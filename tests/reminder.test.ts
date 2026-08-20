import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Notification } from "../src/models/Notification";
import { NotificationPreference } from "../src/models/NotificationPreference";
import { Reminder } from "../src/models/Reminder";
import { User } from "../src/models/User";
import { processDueReminders } from "../src/workers/reminder.worker";
import type { Role } from "../src/utils/constants";
import { nextEmployeeCode } from "../src/utils/sequence";
import { getZonedDayRange } from "../src/utils/timezone";
import { clearCollections, setupTestDb, teardownTestDb } from "./helpers";

const app = createApp();

async function createUser(role: Role, email: string, phone: string) {
  return User.create({
    name: `${role} ${email.split("@")[0]}`,
    email,
    phone,
    passwordHash: await bcrypt.hash("SecurePassword123", 4),
    role,
    status: "ACTIVE",
    isActive: true,
  });
}

async function createEmployeeForUser(
  user: { _id: mongoose.Types.ObjectId; email: string },
  options: { phone?: string; managerId?: string } = {},
) {
  const firstName = user.email.split("@")[0];
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName,
    lastName: "Worker",
    displayName: `${firstName} Worker`,
    email: user.email,
    phone: options.phone ?? "9876500800",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    managerId: options.managerId ?? null,
  });
}

async function loginAs(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "SecurePassword123",
  });
  return response.body.data as { accessToken: string; user: { id: string; role: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function futureDate(ms = 60 * 60 * 1000) {
  return new Date(Date.now() + ms).toISOString();
}

function pastDate(ms = 60 * 1000) {
  return new Date(Date.now() - ms).toISOString();
}

async function seed() {
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500801");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500802");
  const otherUser = await createUser("EMPLOYEE", "other@example.com", "9876500803");

  const rajEmp = await createEmployeeForUser(employeeUser, { phone: "9876500802" });
  await createEmployeeForUser(otherUser, { phone: "9876500803" });
  await createEmployeeForUser(adminUser, { phone: "9876500801" });

  return {
    adminUser,
    employeeUser,
    otherUser,
    rajEmp,
    admin: await loginAs("admin@example.com"),
    raj: await loginAs("raj@example.com"),
    other: await loginAs("other@example.com"),
  };
}

async function createReminder(token: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/reminders")
    .set(auth(token))
    .send({
      title: "Call ABC Industries",
      description: "Follow up regarding proposal",
      reminderType: "FOLLOW_UP",
      scheduledAt: extra.scheduledAt ?? futureDate(2 * 60 * 60 * 1000),
      timezone: "Asia/Kolkata",
      priority: "HIGH",
      actionUrl: "/opportunities/123",
      ...extra,
    });
}

describe("Reminder and notification APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
    await Promise.all([Reminder.syncIndexes(), Notification.syncIndexes(), NotificationPreference.syncIndexes()]);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("creates, lists, gets, and updates a reminder", async () => {
    const ctx = await seed();
    const created = await createReminder(ctx.admin.accessToken);
    expect(created.status).toBe(201);
    expect(created.body.data.reminderId).toMatch(/^REM-\d{6}$/);
    expect(created.body.data.userId).toBe(ctx.admin.user.id);
    expect(created.body.data.status).toBe("SCHEDULED");

    const listed = await request(app)
      .get("/api/v1/reminders")
      .query({ status: "SCHEDULED", reminderType: "FOLLOW_UP", priority: "HIGH", page: 1, limit: 20 })
      .set(auth(ctx.admin.accessToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.meta).toMatchObject({ page: 1, limit: 20, total: 1, hasNextPage: false });

    const id = created.body.data.id as string;
    const fetched = await request(app).get(`/api/v1/reminders/${id}`).set(auth(ctx.admin.accessToken));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.title).toBe("Call ABC Industries");

    const updated = await request(app)
      .patch(`/api/v1/reminders/${id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ title: "Call ABC Industries again", priority: "URGENT" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe("Call ABC Industries again");
    expect(updated.body.data.priority).toBe("URGENT");
    expect(updated.body.data.status).toBe("SCHEDULED");
  });

  it("completes, cancels, and snoozes reminders without corrupting history", async () => {
    const ctx = await seed();
    const created = await createReminder(ctx.admin.accessToken);
    const id = created.body.data.id as string;

    const first = await request(app).patch(`/api/v1/reminders/${id}/complete`).set(auth(ctx.admin.accessToken));
    const second = await request(app).patch(`/api/v1/reminders/${id}/complete`).set(auth(ctx.admin.accessToken));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe("COMPLETED");
    expect(second.body.data.completedAt).toBe(first.body.data.completedAt);

    const other = await createReminder(ctx.admin.accessToken, { title: "Cancel me" });
    const cancelId = other.body.data.id as string;
    const cancelled = await request(app).patch(`/api/v1/reminders/${cancelId}/cancel`).set(auth(ctx.admin.accessToken));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");
    expect(cancelled.body.data.cancelledAt).toBeTruthy();
    const stillThere = await Reminder.findById(cancelId);
    expect(stillThere).toBeTruthy();

    const snoozeSource = await createReminder(ctx.admin.accessToken, { title: "Snooze me" });
    const snoozeId = snoozeSource.body.data.id as string;
    const next = futureDate(5 * 60 * 60 * 1000);
    const snoozed = await request(app)
      .patch(`/api/v1/reminders/${snoozeId}/snooze`)
      .set(auth(ctx.admin.accessToken))
      .send({ scheduledAt: next });
    expect(snoozed.status).toBe(200);
    expect(snoozed.body.data.status).toBe("SCHEDULED");
    expect(snoozed.body.data.reminderId).toBe(snoozeSource.body.data.reminderId);
    expect(new Date(snoozed.body.data.scheduledAt).toISOString()).toBe(new Date(next).toISOString());
  });

  it("returns today and upcoming reminders for the current user", async () => {
    const ctx = await seed();
    const { start } = getZonedDayRange(new Date(), "Asia/Kolkata");
    const todayAt = new Date(start.getTime() + 12 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await createReminder(ctx.admin.accessToken, { title: "Today call", scheduledAt: todayAt.toISOString() });
    await createReminder(ctx.admin.accessToken, { title: "Later call", scheduledAt: later.toISOString() });

    const today = await request(app).get("/api/v1/reminders/today").set(auth(ctx.admin.accessToken));
    expect(today.status).toBe(200);
    expect(today.body.data.some((item: { title: string }) => item.title === "Today call")).toBe(true);

    const upcoming = await request(app)
      .get("/api/v1/reminders/upcoming")
      .query({ days: 7 })
      .set(auth(ctx.admin.accessToken));
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.data.every((item: { status: string }) => item.status === "SCHEDULED")).toBe(true);
  });

  it("enforces ownership, pagination, and input validation", async () => {
    const ctx = await seed();
    const mine = await createReminder(ctx.admin.accessToken);
    const theirs = await createReminder(ctx.raj.accessToken, { title: "Raj reminder" });

    const stolen = await request(app)
      .get(`/api/v1/reminders/${theirs.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(stolen.status).toBe(404);

    const listed = await request(app).get("/api/v1/reminders").set(auth(ctx.raj.accessToken));
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(theirs.body.data.id);

    await createReminder(ctx.raj.accessToken, { title: "Second" });
    const paged = await request(app)
      .get("/api/v1/reminders")
      .query({ page: 1, limit: 1 })
      .set(auth(ctx.raj.accessToken));
    expect(paged.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, hasNextPage: true });

    const badDate = await request(app)
      .post("/api/v1/reminders")
      .set(auth(ctx.admin.accessToken))
      .send({ title: "Bad", scheduledAt: "not-a-date" });
    expect(badDate.status).toBe(422);

    const badTz = await createReminder(ctx.admin.accessToken, { timezone: "Not/AZone" });
    expect(badTz.status).toBe(422);

    const unsafe = await createReminder(ctx.admin.accessToken, { actionUrl: "javascript:alert(1)" });
    expect(unsafe.status).toBe(422);

    const userIdIgnored = await request(app)
      .post("/api/v1/reminders")
      .set(auth(ctx.admin.accessToken))
      .send({
        title: "Hijack",
        scheduledAt: futureDate(),
        userId: ctx.raj.user.id,
      });
    expect(userIdIgnored.status).toBe(422);

    expect(mine.body.success).toBe(true);
  });

  it("creates notifications from due reminders and supports read state APIs", async () => {
    const ctx = await seed();
    const created = await createReminder(ctx.admin.accessToken, {
      title: "Call ABC Industries",
      scheduledAt: pastDate(),
    });
    expect(created.status).toBe(201);

    await Promise.all([processDueReminders(), processDueReminders()]);

    const reminderId = created.body.data.reminderId as string;
    const notifications = await Notification.find({ reminderId, isDeleted: false });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].notificationId).toMatch(/^NOTIF-\d{6}$/);
    expect(notifications[0].status).toBe("SENT");
    expect(notifications[0].isRead).toBe(false);

    const triggered = await Reminder.findById(created.body.data.id);
    expect(triggered?.status).toBe("TRIGGERED");

    const list = await request(app).get("/api/v1/notifications").set(auth(ctx.admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);

    const id = list.body.data[0].id as string;
    const detail = await request(app).get(`/api/v1/notifications/${id}`).set(auth(ctx.admin.accessToken));
    expect(detail.status).toBe(200);

    const forbidden = await request(app).get(`/api/v1/notifications/${id}`).set(auth(ctx.raj.accessToken));
    expect(forbidden.status).toBe(404);

    const read = await request(app).patch(`/api/v1/notifications/${id}/read`).set(auth(ctx.admin.accessToken));
    const readAgain = await request(app).patch(`/api/v1/notifications/${id}/read`).set(auth(ctx.admin.accessToken));
    expect(read.body.data.isRead).toBe(true);
    expect(readAgain.body.data.readAt).toBe(read.body.data.readAt);

    const unread = await request(app).patch(`/api/v1/notifications/${id}/unread`).set(auth(ctx.admin.accessToken));
    expect(unread.body.data.isRead).toBe(false);
    expect(unread.body.data.readAt).toBeNull();
    expect(unread.body.data.status).toBe("SENT");

    await request(app).patch("/api/v1/notifications/read-all").set(auth(ctx.admin.accessToken));
    const count = await request(app).get("/api/v1/notifications/unread-count").set(auth(ctx.admin.accessToken));
    expect(count.body).toMatchObject({ success: true, data: { count: 0 } });

    const deleted = await request(app).delete(`/api/v1/notifications/${id}`).set(auth(ctx.admin.accessToken));
    expect(deleted.status).toBe(200);
    const missing = await request(app).get(`/api/v1/notifications/${id}`).set(auth(ctx.admin.accessToken));
    expect(missing.status).toBe(404);
    const stored = await Notification.findById(id);
    expect(stored?.isDeleted).toBe(true);
  });

  it("stores notification preferences, quiet hours, and category/channel disables", async () => {
    const ctx = await seed();
    const defaults = await request(app).get("/api/v1/notification-preferences").set(auth(ctx.raj.accessToken));
    expect(defaults.status).toBe(200);
    expect(defaults.body.data.channels).toMatchObject({
      inApp: true,
      email: false,
      sms: false,
      push: false,
      whatsapp: false,
    });

    const updated = await request(app)
      .patch("/api/v1/notification-preferences")
      .set(auth(ctx.raj.accessToken))
      .send({
        channels: { inApp: true, email: false, sms: false, push: true, whatsapp: false },
        categories: { reminders: false, tasks: true },
        quietHours: { enabled: true, startTime: "22:00", endTime: "07:00", timezone: "Asia/Kolkata" },
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.channels.push).toBe(true);
    expect(updated.body.data.categories.reminders).toBe(false);
    expect(updated.body.data.quietHours).toMatchObject({
      enabled: true,
      startTime: "22:00",
      endTime: "07:00",
      timezone: "Asia/Kolkata",
    });

    const due = await createReminder(ctx.raj.accessToken, {
      scheduledAt: pastDate(),
      title: "Muted reminder",
      reminderType: "CUSTOM",
    });
    await processDueReminders();
    expect(await Notification.countDocuments({ reminderId: due.body.data.reminderId })).toBe(0);

    const disabled = await request(app)
      .patch("/api/v1/notification-preferences")
      .set(auth(ctx.raj.accessToken))
      .send({ channels: { inApp: false }, categories: { reminders: true } });
    expect(disabled.body.data.channels.inApp).toBe(false);

    const due2 = await createReminder(ctx.raj.accessToken, {
      scheduledAt: pastDate(),
      title: "Channel off",
      reminderType: "CUSTOM",
    });
    await processDueReminders();
    expect(await Notification.countDocuments({ reminderId: due2.body.data.reminderId })).toBe(0);
  });

  it("processes a weekly reminder once and advances nextRunAt", async () => {
    const ctx = await seed();
    const created = await createReminder(ctx.admin.accessToken, {
      title: "Weekly review",
      scheduledAt: pastDate(),
      recurrence: { enabled: true, frequency: "WEEKLY", interval: 1 },
    });
    const firstRun = new Date(created.body.data.nextRunAt);

    await processDueReminders();
    await processDueReminders();

    const reminder = await Reminder.findById(created.body.data.id);
    expect(reminder?.status).toBe("SCHEDULED");
    expect(reminder?.nextRunAt.getTime()).toBeGreaterThan(firstRun.getTime());
    expect(await Notification.countDocuments({ reminderId: created.body.data.reminderId })).toBe(1);
  });

  it("creates a reminder from assistant action and notifies when it is due", async () => {
    const ctx = await seed();
    const action = await request(app)
      .post("/api/v1/assistant/action")
      .set(auth(ctx.admin.accessToken))
      .send({ message: "Remind me tomorrow at 10 AM to call ABC." });
    expect(action.body.data.status).toBe("COMPLETED");
    expect(action.body.data.intent).toBe("CREATE_REMINDER");
    expect(action.body.data.result.reminderId).toMatch(/^REM-\d{6}$/);

    await Reminder.updateOne(
      { reminderId: action.body.data.result.reminderId },
      { $set: { scheduledAt: new Date(Date.now() - 1000), nextRunAt: new Date(Date.now() - 1000) } },
    );

    await Promise.all([processDueReminders(), processDueReminders()]);
    const count = await request(app).get("/api/v1/notifications/unread-count").set(auth(ctx.admin.accessToken));
    expect(count.body.data.count).toBe(1);
  });

  it("creates task, meeting, and CRM follow-up reminders without duplicating offsets", async () => {
    const ctx = await seed();
    const dueDate = futureDate(2 * 24 * 60 * 60 * 1000);
    const task = await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.accessToken))
      .send({
        title: "Prepare proposal",
        assignedTo: String(ctx.rajEmp._id),
        dueDate,
        priority: "HIGH",
      });
    expect(task.status).toBe(201);
    const taskReminder = await Reminder.findOne({ sourceType: "TASK", sourceId: task.body.data.id });
    expect(taskReminder).toBeTruthy();
    expect(await Notification.countDocuments({ type: "TASK_ASSIGNED", recipientId: ctx.employeeUser._id })).toBe(1);

    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const meeting = await request(app)
      .post("/api/v1/meetings")
      .set(auth(ctx.admin.accessToken))
      .send({
        title: "ABC review",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        timezone: "Asia/Kolkata",
        meetingType: "INTERNAL",
      });
    expect(meeting.status).toBe(201);
    const meetingReminder = await Reminder.findOne({ sourceType: "MEETING", sourceId: meeting.body.data.id });
    expect(meetingReminder).toBeTruthy();
    expect(Math.abs(meetingReminder!.scheduledAt.getTime() - (start.getTime() - 15 * 60 * 1000))).toBeLessThan(1000);

    const lead = await request(app)
      .post("/api/v1/leads")
      .set(auth(ctx.admin.accessToken))
      .send({
        name: "ABC Industries",
        companyName: "ABC Industries",
        phone: "9876543299",
        source: "WEBSITE",
        nextFollowUpAt: futureDate(24 * 60 * 60 * 1000),
        assignedTo: String(ctx.rajEmp._id),
      });
    expect(lead.status).toBe(201);
    const followUp = await Reminder.findOne({ sourceType: "LEAD", sourceId: lead.body.data.id });
    expect(followUp?.reminderType).toBe("FOLLOW_UP");

    const again = await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.accessToken))
      .send({
        title: "Prepare proposal",
        assignedTo: String(ctx.rajEmp._id),
        dueDate,
      });
    expect(again.status).toBe(201);
    expect(await Reminder.countDocuments({ sourceType: "TASK", sourceId: task.body.data.id })).toBe(1);
  });
});

import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Meeting } from "../src/models/Meeting";
import { Notification } from "../src/models/Notification";
import { Reminder } from "../src/models/Reminder";
import { Task } from "../src/models/Task";
import { REMINDER_CLAIM_STALE_MS } from "../src/utils/constants";
import { nextEmployeeCode, nextReminderId, nextTaskId } from "../src/utils/sequence";
import { processDueReminders } from "../src/workers/reminder.worker";
import { authHeader, clearCollections, createTestUser, setupTestDb, teardownTestDb } from "./helpers";

const app = createApp();

async function login(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "SecurePassword123",
  });
  return response.body.data as { accessToken: string; user: { id: string; role: string } };
}

async function seed() {
  const adminUser = await createTestUser("ADMIN", "admin@example.com", "9876500101");
  const mdUser = await createTestUser("MD", "md@example.com", "9876500104");
  const managerUser = await createTestUser("MANAGER", "manager@example.com", "9876500102");
  const employeeUser = await createTestUser("EMPLOYEE", "raj@example.com", "9876500103");
  const rajEmp = await Employee.create({
    employeeId: "emp-raj-conc",
    userId: employeeUser._id,
    employeeCode: await nextEmployeeCode(),
    firstName: "Raj",
    lastName: "Kumar",
    displayName: "Raj Kumar",
    email: employeeUser.email,
    phone: "9876500103",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
  });
  const managerEmp = await Employee.create({
    employeeId: "emp-mgr-conc",
    userId: managerUser._id,
    employeeCode: await nextEmployeeCode(),
    firstName: "Manager",
    lastName: "User",
    displayName: "Manager User",
    email: managerUser.email,
    phone: "9876500102",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
  });
  await Employee.create({
    employeeId: "emp-admin-conc",
    userId: adminUser._id,
    employeeCode: await nextEmployeeCode(),
    firstName: "Admin",
    lastName: "User",
    displayName: "Admin User",
    email: adminUser.email,
    phone: "9876500101",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
  });
  return {
    rajEmp,
    managerEmp,
    admin: await login("admin@example.com"),
    md: await login("md@example.com"),
    manager: await login("manager@example.com"),
    raj: await login("raj@example.com"),
  };
}

describe("Concurrency and worker safety", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("keeps a valid terminal status when two users complete the same task", async () => {
    const ctx = await seed();
    const task = await Task.create({
      taskId: await nextTaskId(),
      title: "Shared complete",
      assignedTo: ctx.rajEmp._id,
      createdBy: ctx.admin.user.id,
      priority: "HIGH",
      status: "IN_PROGRESS",
    });

    const [first, second] = await Promise.all([
      request(app)
        .patch(`/api/v1/tasks/${String(task._id)}/status`)
        .set(authHeader(ctx.admin.accessToken))
        .send({ status: "COMPLETED" }),
      request(app)
        .patch(`/api/v1/tasks/${String(task._id)}/status`)
        .set(authHeader(ctx.md.accessToken))
        .send({ status: "COMPLETED" }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const stored = await Task.findById(task._id);
    expect(stored?.status).toBe("COMPLETED");
    expect(stored?.completedAt).toBeTruthy();
  });

  it("assigns a task to exactly one valid employee under concurrent assign", async () => {
    const ctx = await seed();
    const created = await request(app)
      .post("/api/v1/tasks")
      .set(authHeader(ctx.admin.accessToken))
      .send({
        title: "Shared assign",
        assignedTo: String(ctx.rajEmp._id),
        priority: "MEDIUM",
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    await Promise.all([
      request(app)
        .patch(`/api/v1/tasks/${id}/assignee`)
        .set(authHeader(ctx.admin.accessToken))
        .send({ assignedTo: String(ctx.rajEmp._id) }),
      request(app)
        .patch(`/api/v1/tasks/${id}/assignee`)
        .set(authHeader(ctx.admin.accessToken))
        .send({ assignedTo: String(ctx.managerEmp._id) }),
    ]);

    const stored = await Task.findById(id);
    expect([String(ctx.rajEmp._id), String(ctx.managerEmp._id)]).toContain(String(stored?.assignedTo));
  });

  it("does not double-book the same participant when two conflicting meetings are created together", async () => {
    const ctx = await seed();
    const start = new Date("2026-08-21T04:30:00.000Z");
    const end = new Date("2026-08-21T05:30:00.000Z");
    const payload = {
      title: "10 AM review",
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timezone: "Asia/Kolkata",
      meetingType: "INTERNAL",
      participants: [String(ctx.rajEmp._id)],
    };

    const [a, b] = await Promise.all([
      request(app).post("/api/v1/meetings").set(authHeader(ctx.admin.accessToken)).send({ ...payload, title: "Slot A" }),
      request(app).post("/api/v1/meetings").set(authHeader(ctx.manager.accessToken)).send({ ...payload, title: "Slot B" }),
    ]);

    const created = [a, b].filter((item) => item.status === 201);
    const conflicts = [a, b].filter((item) => item.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    const live = await Meeting.countDocuments({
      isDeleted: false,
      status: { $ne: "CANCELLED" },
      participants: ctx.rajEmp._id,
      startTime: { $lt: end },
      endTime: { $gt: start },
    });
    expect(live).toBe(1);
  });

  it("lets only one of three concurrent workers claim a due reminder", async () => {
    const ctx = await seed();
    const reminder = await Reminder.create({
      reminderId: await nextReminderId(),
      userId: ctx.admin.user.id,
      createdBy: ctx.admin.user.id,
      title: "Due now",
      scheduledAt: new Date(Date.now() - 60_000),
      nextRunAt: new Date(Date.now() - 60_000),
      timezone: "Asia/Kolkata",
      status: "SCHEDULED",
    });

    const results = await Promise.all([processDueReminders(), processDueReminders(), processDueReminders()]);
    const processed = results.reduce((sum, item) => sum + item.processed, 0);
    expect(processed).toBe(1);
    expect(await Notification.countDocuments({ reminderId: reminder.reminderId })).toBe(1);
    const stored = await Reminder.findById(reminder._id);
    expect(stored?.status).toBe("TRIGGERED");
  });

  it("recovers a stale PROCESSING reminder and does not leave it stuck", async () => {
    const ctx = await seed();
    const reminder = await Reminder.create({
      reminderId: await nextReminderId(),
      userId: ctx.admin.user.id,
      createdBy: ctx.admin.user.id,
      title: "Crashed worker",
      scheduledAt: new Date(Date.now() - 60_000),
      nextRunAt: new Date(Date.now() - 60_000),
      timezone: "Asia/Kolkata",
      status: "PROCESSING",
      lastProcessedAt: new Date(Date.now() - REMINDER_CLAIM_STALE_MS - 1_000),
      processingAttempts: 1,
    });

    const result = await processDueReminders();
    expect(result.processed).toBe(1);
    expect(await Notification.countDocuments({ reminderId: reminder.reminderId })).toBe(1);
    const stored = await Reminder.findById(reminder._id);
    expect(stored?.status).toBe("TRIGGERED");
  });

  it("does not reclaim a recently PROCESSING reminder", async () => {
    const ctx = await seed();
    await Reminder.create({
      reminderId: await nextReminderId(),
      userId: ctx.admin.user.id,
      createdBy: ctx.admin.user.id,
      title: "In flight",
      scheduledAt: new Date(Date.now() - 60_000),
      nextRunAt: new Date(Date.now() - 60_000),
      timezone: "Asia/Kolkata",
      status: "PROCESSING",
      lastProcessedAt: new Date(),
      processingAttempts: 1,
    });

    const result = await processDueReminders();
    expect(result.processed).toBe(0);
    expect(await Reminder.countDocuments({ status: "PROCESSING" })).toBe(1);
    expect(await Notification.countDocuments({})).toBe(0);
  });
});

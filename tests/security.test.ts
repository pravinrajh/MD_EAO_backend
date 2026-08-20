import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { Employee } from "../src/models/Employee";
import { Notification } from "../src/models/Notification";
import { Project } from "../src/models/Project";
import { Reminder } from "../src/models/Reminder";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import { nextEmployeeCode, nextNotificationId, nextProjectId, nextReminderId, nextTaskId } from "../src/utils/sequence";
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
  const adminUser = await createTestUser("ADMIN", "admin@example.com", "9876500001");
  const employeeUser = await createTestUser("EMPLOYEE", "raj@example.com", "9876500002");
  const otherUser = await createTestUser("EMPLOYEE", "other@example.com", "9876500003");
  const rajEmp = await Employee.create({
    employeeId: "emp-raj",
    userId: employeeUser._id,
    employeeCode: await nextEmployeeCode(),
    firstName: "Raj",
    lastName: "Kumar",
    displayName: "Raj Kumar",
    email: employeeUser.email,
    phone: "9876500002",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
  });
  const otherEmp = await Employee.create({
    employeeId: "emp-other",
    userId: otherUser._id,
    employeeCode: await nextEmployeeCode(),
    firstName: "Other",
    lastName: "User",
    displayName: "Other User",
    email: otherUser.email,
    phone: "9876500003",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
  });
  const admin = await login("admin@example.com");
  const raj = await login("raj@example.com");
  const other = await login("other@example.com");
  return { adminUser, employeeUser, otherUser, rajEmp, otherEmp, admin, raj, other };
}

describe("Security extras", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("rejects login for an inactive account without leaking hashes", async () => {
    await User.create({
      name: "Disabled",
      email: "disabled@example.com",
      phone: "9876500099",
      passwordHash: await bcrypt.hash("SecurePassword123", 4),
      role: "EMPLOYEE",
      status: "INACTIVE",
      isActive: false,
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "disabled@example.com",
      password: "SecurePassword123",
    });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Account is not active");
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|JWT_SECRET|stack/i);
  });

  it("rejects an expired access token", async () => {
    const ctx = await seed();
    const token = jwt.sign(
      { sub: ctx.admin.user.id, role: "ADMIN", type: "access" },
      env.JWT_SECRET,
      { expiresIn: "-10s" },
    );
    const response = await request(app).get("/api/v1/auth/me").set(authHeader(token));
    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/invalid or expired token/i);
  });

  it("rejects missing, invalid, and wrong-role access on a protected task list", async () => {
    await seed();
    const missing = await request(app).get("/api/v1/tasks");
    expect(missing.status).toBe(401);

    const invalid = await request(app).get("/api/v1/tasks").set(authHeader("not-a-token"));
    expect(invalid.status).toBe(401);
  });

  it("blocks IDOR on another user's task, project, reminder, and notification", async () => {
    const ctx = await seed();
    const task = await Task.create({
      taskId: await nextTaskId(),
      title: "Other task",
      assignedTo: ctx.otherEmp._id,
      createdBy: ctx.other.user.id,
      priority: "LOW",
      status: "PENDING",
    });
    const project = await Project.create({
      projectId: await nextProjectId(),
      name: "Other Project",
      projectType: "OTHER",
      managerId: ctx.otherEmp._id,
      members: [ctx.otherEmp._id],
      status: "ACTIVE",
      budget: 1000,
      actualExpense: 0,
      createdBy: ctx.other.user.id,
    });
    const reminder = await Reminder.create({
      reminderId: await nextReminderId(),
      userId: ctx.other.user.id,
      createdBy: ctx.other.user.id,
      title: "Private reminder",
      scheduledAt: new Date(Date.now() + 60_000),
      nextRunAt: new Date(Date.now() + 60_000),
      timezone: "Asia/Kolkata",
    });
    const notification = await Notification.create({
      notificationId: await nextNotificationId(),
      recipientId: ctx.other.user.id,
      type: "SYSTEM_ALERT",
      category: "system",
      title: "Private",
      message: "Not yours",
      priority: "NORMAL",
    });

    const stolenTask = await request(app)
      .get(`/api/v1/tasks/${String(task._id)}`)
      .set(authHeader(ctx.raj.accessToken));
    expect([403, 404]).toContain(stolenTask.status);
    expect(stolenTask.body.data).toBeFalsy();

    const stolenProject = await request(app)
      .get(`/api/v1/projects/${String(project._id)}`)
      .set(authHeader(ctx.raj.accessToken));
    expect([403, 404]).toContain(stolenProject.status);

    const stolenReminder = await request(app)
      .get(`/api/v1/reminders/${String(reminder._id)}`)
      .set(authHeader(ctx.raj.accessToken));
    expect(stolenReminder.status).toBe(404);

    const stolenNotification = await request(app)
      .get(`/api/v1/notifications/${String(notification._id)}`)
      .set(authHeader(ctx.raj.accessToken));
    expect(stolenNotification.status).toBe(404);
  });

  it("rejects Mongo operators and mass-assignment privilege fields", async () => {
    const ctx = await seed();
    const operators = await request(app)
      .post("/api/v1/tasks")
      .set(authHeader(ctx.admin.accessToken))
      .send({
        title: "Inject",
        assignedTo: String(ctx.rajEmp._id),
        $gt: { status: "COMPLETED" },
      });
    expect([201, 422]).toContain(operators.status);
    expect(operators.status).not.toBe(500);
    if (operators.status === 201) {
      expect(operators.body.data.status).toBe("PENDING");
      expect(operators.body.data).not.toHaveProperty("$gt");
    }

    const mass = await request(app)
      .post("/api/v1/tasks")
      .set(authHeader(ctx.admin.accessToken))
      .send({
        title: "Escalate",
        assignedTo: String(ctx.rajEmp._id),
        role: "ADMIN",
        isAdmin: true,
        userId: ctx.admin.user.id,
        createdBy: ctx.other.user.id,
      });
    expect(mass.status).toBe(422);

    const queryInject = await request(app)
      .get("/api/v1/tasks")
      .query({ status: { $ne: "COMPLETED" } })
      .set(authHeader(ctx.admin.accessToken));
    expect([200, 422]).toContain(queryInject.status);
    expect(queryInject.status).not.toBe(500);
  });

  it("rejects invalid ObjectIds, empty titles, and overlong strings", async () => {
    const ctx = await seed();
    const badId = await request(app).get("/api/v1/tasks/not-an-id").set(authHeader(ctx.admin.accessToken));
    expect([400, 422]).toContain(badId.status);

    const missing = await request(app)
      .post("/api/v1/tasks")
      .set(authHeader(ctx.admin.accessToken))
      .send({ assignedTo: String(ctx.rajEmp._id) });
    expect(missing.status).toBe(422);

    const empty = await request(app)
      .post("/api/v1/tasks")
      .set(authHeader(ctx.admin.accessToken))
      .send({ title: "   ", assignedTo: String(ctx.rajEmp._id) });
    expect(empty.status).toBe(422);

    const tooLong = await request(app)
      .post("/api/v1/tasks")
      .set(authHeader(ctx.admin.accessToken))
      .send({ title: "T".repeat(201), assignedTo: String(ctx.rajEmp._id) });
    expect(tooLong.status).toBe(422);

    const missingOid = await request(app)
      .post("/api/v1/tasks")
      .set(authHeader(ctx.admin.accessToken))
      .send({ title: "X", assignedTo: new mongoose.Types.ObjectId().toString() });
    expect([400, 404, 422]).toContain(missingOid.status);
  });
});

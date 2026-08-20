import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { nextEmployeeCode } from "../src/utils/sequence";
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
  options: { status?: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED"; managerId?: string; phone?: string } = {},
) {
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName: user.email.split("@")[0],
    lastName: "Worker",
    displayName: `${user.email.split("@")[0]} Worker`,
    email: user.email,
    phone: options.phone ?? "9876500000",
    employmentType: "FULL_TIME",
    status: options.status ?? "ACTIVE",
    managerId: options.managerId ?? null,
  });
}

async function loginAs(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "SecurePassword123",
  });
  return response.body.data as {
    accessToken: string;
    user: { id: string; role: string };
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seed() {
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500001");
  const mdUser = await createUser("MD", "md@example.com", "9876500002");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500003");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500004");
  const otherUser = await createUser("EMPLOYEE", "other@example.com", "9876500005");

  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500003" });
  const rajEmp = await createEmployeeForUser(employeeUser, {
    phone: "9876500004",
    managerId: String(managerEmp._id),
  });
  const otherEmp = await createEmployeeForUser(otherUser, { phone: "9876500005" });

  const admin = await loginAs("admin@example.com");
  const md = await loginAs("md@example.com");
  const manager = await loginAs("manager@example.com");
  const raj = await loginAs("raj@example.com");
  const other = await loginAs("other@example.com");

  return {
    adminUser,
    mdUser,
    managerUser,
    employeeUser,
    otherUser,
    managerEmp,
    rajEmp,
    otherEmp,
    admin,
    md,
    manager,
    raj,
    other,
  };
}

async function createTask(token: string, assignedTo: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/tasks")
    .set(auth(token))
    .send({
      title: extra.title ?? "Check Chennai electrical material",
      description: extra.description ?? "Verify delivery status with vendor",
      assignedTo,
      projectId: extra.projectId ?? null,
      priority: extra.priority ?? "HIGH",
      dueDate: extra.dueDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ...extra,
    });
}

describe("Task management APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  describe("creation", () => {
    it("creates a task successfully with generated taskId and createdBy from the session", async () => {
      const ctx = await seed();
      const response = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id));

      expect(response.status).toBe(201);
      expect(response.body.data.taskId).toBe("TASK-000001");
      expect(response.body.data.status).toBe("PENDING");
      expect(response.body.data.isOverdue).toBe(false);
      expect(response.body.data.assignedTo.employeeCode).toMatch(/^EMP-/);
      expect(response.body.data.assignedTo.name).toBeDefined();
      expect(response.body.data.createdBy.id).toBe(ctx.admin.user.id);
      expect(response.body.data.passwordHash).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
    });

    it("rejects a missing title", async () => {
      const ctx = await seed();
      const response = await request(app).post("/api/v1/tasks").set(auth(ctx.admin.accessToken)).send({
        assignedTo: String(ctx.rajEmp._id),
        priority: "HIGH",
      });
      expect(response.status).toBe(422);
    });

    it("rejects an invalid employee", async () => {
      const ctx = await seed();
      const response = await createTask(ctx.admin.accessToken, new mongoose.Types.ObjectId().toString());
      expect(response.status).toBe(400);
    });

    it("rejects an inactive employee", async () => {
      const ctx = await seed();
      const inactiveUser = await createUser("EMPLOYEE", "inactive@example.com", "9876500006");
      const inactiveEmp = await createEmployeeForUser(inactiveUser, { status: "INACTIVE", phone: "9876500006" });
      const response = await createTask(ctx.admin.accessToken, String(inactiveEmp._id));
      expect(response.status).toBe(400);
    });

    it("rejects an invalid priority", async () => {
      const ctx = await seed();
      const response = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { priority: "URGENT" });
      expect(response.status).toBe(422);
    });

    it("rejects an invalid dueDate", async () => {
      const ctx = await seed();
      const response = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { dueDate: "not-a-date" });
      expect(response.status).toBe(422);
    });

    it("rejects reminderAt after dueDate", async () => {
      const ctx = await seed();
      const response = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), {
        dueDate: "2026-08-20T16:00:00.000Z",
        reminderAt: "2026-08-21T16:00:00.000Z",
      });
      expect(response.status).toBe(422);
    });

    it("assigns unique task IDs even for concurrent creates", async () => {
      const ctx = await seed();
      const [first, second] = await Promise.all([
        createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { title: "Task A" }),
        createTask(ctx.admin.accessToken, String(ctx.otherEmp._id), { title: "Task B" }),
      ]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.taskId).not.toBe(second.body.data.taskId);
    });

    it("ignores client-provided createdBy and rejects unknown fields", async () => {
      const ctx = await seed();
      const response = await request(app).post("/api/v1/tasks").set(auth(ctx.admin.accessToken)).send({
        title: "Created by override",
        assignedTo: String(ctx.rajEmp._id),
        createdBy: String(ctx.mdUser._id),
      });
      expect(response.status).toBe(422);
    });
  });

  describe("listing", () => {
    it("paginates and caps the maximum limit at 100", async () => {
      const ctx = await seed();
      await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { title: "One" });
      await createTask(ctx.admin.accessToken, String(ctx.otherEmp._id), { title: "Two" });

      const page1 = await request(app)
        .get("/api/v1/tasks?page=1&limit=1")
        .set(auth(ctx.admin.accessToken));
      expect(page1.status).toBe(200);
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, hasNextPage: true });

      const capped = await request(app)
        .get("/api/v1/tasks?limit=1000000")
        .set(auth(ctx.admin.accessToken));
      expect(capped.status).toBe(200);
      expect(capped.body.meta.limit).toBe(100);
    });

    it("searches and filters by status, priority, assignee, creator, dates, overdue, and sort", async () => {
      const ctx = await seed();
      await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), {
        title: "Check material",
        priority: "HIGH",
        dueDate: "2020-01-01T00:00:00.000Z",
      });
      await createTask(ctx.md.accessToken, String(ctx.otherEmp._id), {
        title: "Office cleanup",
        priority: "LOW",
        dueDate: "2030-01-01T00:00:00.000Z",
      });

      const search = await request(app)
        .get("/api/v1/tasks?search=material")
        .set(auth(ctx.admin.accessToken));
      expect(search.body.data).toHaveLength(1);

      const status = await request(app)
        .get("/api/v1/tasks?status=PENDING&priority=HIGH")
        .set(auth(ctx.admin.accessToken));
      expect(status.body.data).toHaveLength(1);

      const assigned = await request(app)
        .get(`/api/v1/tasks?assignedTo=${ctx.rajEmp._id}`)
        .set(auth(ctx.admin.accessToken));
      expect(assigned.body.data).toHaveLength(1);

      const created = await request(app)
        .get(`/api/v1/tasks?createdBy=${ctx.md.user.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(created.body.data).toHaveLength(1);

      const ranged = await request(app)
        .get("/api/v1/tasks?dueFrom=2019-01-01&dueTo=2021-01-01")
        .set(auth(ctx.admin.accessToken));
      expect(ranged.body.data).toHaveLength(1);

      const overdue = await request(app)
        .get("/api/v1/tasks?overdue=true")
        .set(auth(ctx.admin.accessToken));
      expect(overdue.body.data).toHaveLength(1);
      expect(overdue.body.data[0].isOverdue).toBe(true);

      const sorted = await request(app)
        .get("/api/v1/tasks?sortBy=dueDate&sortOrder=asc")
        .set(auth(ctx.admin.accessToken));
      expect(new Date(sorted.body.data[0].dueDate).getTime()).toBeLessThan(
        new Date(sorted.body.data[1].dueDate).getTime(),
      );
    });
  });

  describe("authorization", () => {
    it("requires a JWT", async () => {
      const response = await request(app).get("/api/v1/tasks");
      expect(response.status).toBe(401);
    });

    it("lets MD and ADMIN manage tasks", async () => {
      const ctx = await seed();
      const mdCreated = await createTask(ctx.md.accessToken, String(ctx.rajEmp._id), { title: "MD task" });
      const adminCreated = await createTask(ctx.admin.accessToken, String(ctx.otherEmp._id), { title: "Admin task" });
      expect(mdCreated.status).toBe(201);
      expect(adminCreated.status).toBe(201);
    });

    it("lets a manager manage team tasks but not outsiders", async () => {
      const ctx = await seed();
      const team = await createTask(ctx.manager.accessToken, String(ctx.rajEmp._id), { title: "Team task" });
      expect(team.status).toBe(201);

      const outsider = await createTask(ctx.manager.accessToken, String(ctx.otherEmp._id), { title: "Outsider" });
      expect(outsider.status).toBe(403);
    });

    it("lets an employee access own tasks only", async () => {
      const ctx = await seed();
      const own = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { title: "Raj task" });
      const other = await createTask(ctx.admin.accessToken, String(ctx.otherEmp._id), { title: "Other task" });

      const list = await request(app).get("/api/v1/tasks").set(auth(ctx.raj.accessToken));
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(own.body.data.id);

      const forbidden = await request(app)
        .get(`/api/v1/tasks/${other.body.data.id}`)
        .set(auth(ctx.raj.accessToken));
      expect(forbidden.status).toBe(403);
    });

    it("prevents an employee from modifying another employee's task", async () => {
      const ctx = await seed();
      const other = await createTask(ctx.admin.accessToken, String(ctx.otherEmp._id));
      const response = await request(app)
        .patch(`/api/v1/tasks/${other.body.data.id}`)
        .set(auth(ctx.raj.accessToken))
        .send({ title: "Hijacked" });
      expect(response.status).toBe(403);
    });

    it("prevents an employee from assigning or deleting tasks", async () => {
      const ctx = await seed();
      const created = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id));

      const assign = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}/assignee`)
        .set(auth(ctx.raj.accessToken))
        .send({ assignedTo: String(ctx.otherEmp._id) });
      expect(assign.status).toBe(403);

      const remove = await request(app)
        .delete(`/api/v1/tasks/${created.body.data.id}`)
        .set(auth(ctx.raj.accessToken));
      expect(remove.status).toBe(403);

      const create = await createTask(ctx.raj.accessToken, String(ctx.otherEmp._id));
      expect(create.status).toBe(403);
    });

    it("rejects MongoDB operators and invalid ObjectIds", async () => {
      const ctx = await seed();
      const created = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id));

      const injected = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken))
        .send({ $set: { status: "COMPLETED" } });
      expect(injected.status).toBe(422);

      const invalidId = await request(app).get("/api/v1/tasks/not-an-id").set(auth(ctx.admin.accessToken));
      expect(invalidId.status).toBe(400);
    });
  });

  describe("status transitions", () => {
    it("allows PENDING → IN_PROGRESS → COMPLETED and sets timestamps", async () => {
      const ctx = await seed();
      const created = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id));

      const progress = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}/status`)
        .set(auth(ctx.raj.accessToken))
        .send({ status: "IN_PROGRESS" });
      expect(progress.status).toBe(200);
      expect(progress.body.data.status).toBe("IN_PROGRESS");
      expect(progress.body.data.startedAt).toBeTruthy();

      const done = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}/status`)
        .set(auth(ctx.raj.accessToken))
        .send({ status: "COMPLETED", completionNote: "Material verified with vendor." });
      expect(done.status).toBe(200);
      expect(done.body.data.status).toBe("COMPLETED");
      expect(done.body.data.completedAt).toBeTruthy();
      expect(done.body.data.completionNote).toBe("Material verified with vendor.");
    });

    it("allows PENDING → CANCELLED and IN_PROGRESS → CANCELLED", async () => {
      const ctx = await seed();
      const pending = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { title: "Cancel pending" });
      const cancelPending = await request(app)
        .patch(`/api/v1/tasks/${pending.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "CANCELLED", reason: "Project requirement changed" });
      expect(cancelPending.status).toBe(200);
      expect(cancelPending.body.data.cancelledAt).toBeTruthy();

      const active = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { title: "Cancel active" });
      await request(app)
        .patch(`/api/v1/tasks/${active.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "IN_PROGRESS" });
      const cancelActive = await request(app)
        .patch(`/api/v1/tasks/${active.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "CANCELLED" });
      expect(cancelActive.status).toBe(200);
    });

    it("rejects invalid transitions with 409", async () => {
      const ctx = await seed();
      const created = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id));
      const skip = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "COMPLETED" });
      expect(skip.status).toBe(409);

      await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "IN_PROGRESS" });
      await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "COMPLETED" });
      const reopen = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "PENDING" });
      expect(reopen.status).toBe(409);
    });
  });

  describe("special views", () => {
    it("does not treat /my as an ObjectId and returns the caller's assigned tasks", async () => {
      const ctx = await seed();
      await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { title: "Mine" });
      await createTask(ctx.admin.accessToken, String(ctx.otherEmp._id), { title: "Not mine" });

      const response = await request(app)
        .get("/api/v1/tasks/my?status=PENDING&sortBy=dueDate&sortOrder=asc")
        .set(auth(ctx.raj.accessToken));
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe("Mine");
    });

    it("returns created-by-me for the authenticated user", async () => {
      const ctx = await seed();
      await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { title: "Admin created" });
      await createTask(ctx.md.accessToken, String(ctx.rajEmp._id), { title: "MD created" });

      const response = await request(app).get("/api/v1/tasks/created-by-me").set(auth(ctx.admin.accessToken));
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe("Admin created");
    });

    it("returns overdue tasks without storing an OVERDUE status", async () => {
      const ctx = await seed();
      await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), {
        title: "Late",
        dueDate: "2020-01-01T00:00:00.000Z",
      });
      const response = await request(app).get("/api/v1/tasks/overdue").set(auth(ctx.admin.accessToken));
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe("PENDING");
      expect(response.body.data[0].isOverdue).toBe(true);
    });

    it("returns today's tasks using the configured timezone", async () => {
      const ctx = await seed();
      await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), {
        title: "Today",
        dueDate: new Date().toISOString(),
      });
      await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), {
        title: "Later",
        dueDate: "2031-01-01T00:00:00.000Z",
      });

      const response = await request(app).get("/api/v1/tasks/today").set(auth(ctx.admin.accessToken));
      expect(response.status).toBe(200);
      expect(response.body.data.some((task: { title: string }) => task.title === "Today")).toBe(true);
      expect(response.body.data.some((task: { title: string }) => task.title === "Later")).toBe(false);
    });

    it("returns aggregated counts without loading all documents", async () => {
      const ctx = await seed();
      const pending = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), {
        title: "Pending",
        dueDate: "2020-01-01T00:00:00.000Z",
      });
      const active = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), { title: "Active" });
      await request(app)
        .patch(`/api/v1/tasks/${active.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "IN_PROGRESS" });
      await request(app)
        .patch(`/api/v1/tasks/${active.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "COMPLETED" });
      await request(app)
        .patch(`/api/v1/tasks/${pending.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "CANCELLED" });
      const another = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id), {
        title: "Still pending",
        dueDate: "2020-01-01T00:00:00.000Z",
      });
      expect(another.status).toBe(201);

      const response = await request(app).get("/api/v1/tasks/counts").set(auth(ctx.admin.accessToken));
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        total: 3,
        pending: 1,
        inProgress: 0,
        completed: 1,
        cancelled: 1,
        overdue: 1,
      });
    });
  });

  describe("delete", () => {
    it("soft-deletes a task, hides it from lists, and keeps the document", async () => {
      const ctx = await seed();
      const created = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id));
      const removed = await request(app)
        .delete(`/api/v1/tasks/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(removed.status).toBe(200);
      expect(removed.body.data.isDeleted).toBe(true);

      const list = await request(app).get("/api/v1/tasks").set(auth(ctx.admin.accessToken));
      expect(list.body.data).toHaveLength(0);

      const stored = await Task.findById(created.body.data.id).lean();
      expect(stored).not.toBeNull();
      expect(stored?.isDeleted).toBe(true);
      expect(stored?.title).toBe("Check Chennai electrical material");
    });
  });

  describe("assignee and update", () => {
    it("reassigns a task to an active employee", async () => {
      const ctx = await seed();
      const created = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id));
      const response = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}/assignee`)
        .set(auth(ctx.admin.accessToken))
        .send({ assignedTo: String(ctx.otherEmp._id) });
      expect(response.status).toBe(200);
      expect(response.body.data.assignedTo.id).toBe(String(ctx.otherEmp._id));
    });

    it("updates allowed fields without changing status or createdBy", async () => {
      const ctx = await seed();
      const created = await createTask(ctx.admin.accessToken, String(ctx.rajEmp._id));
      const response = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken))
        .send({ title: "Updated title", priority: "CRITICAL" });
      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe("Updated title");
      expect(response.body.data.priority).toBe("CRITICAL");
      expect(response.body.data.status).toBe("PENDING");
      expect(response.body.data.createdBy.id).toBe(ctx.admin.user.id);
    });
  });
});

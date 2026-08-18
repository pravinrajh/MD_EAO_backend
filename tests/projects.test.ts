import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Project } from "../src/models/Project";
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
  options: { status?: "ACTIVE" | "INACTIVE"; managerId?: string; phone?: string } = {},
) {
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName: user.email.split("@")[0],
    lastName: "Worker",
    displayName: `${user.email.split("@")[0]} Worker`,
    email: user.email,
    phone: options.phone ?? "9876500100",
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
  return response.body.data as { accessToken: string; user: { id: string; role: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seed() {
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500101");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500102");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500103");
  const outsiderUser = await createUser("EMPLOYEE", "out@example.com", "9876500104");

  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500102" });
  const rajEmp = await createEmployeeForUser(employeeUser, {
    phone: "9876500103",
    managerId: String(managerEmp._id),
  });
  const outEmp = await createEmployeeForUser(outsiderUser, { phone: "9876500104" });

  return {
    adminUser,
    managerEmp,
    rajEmp,
    outEmp,
    admin: await loginAs("admin@example.com"),
    manager: await loginAs("manager@example.com"),
    raj: await loginAs("raj@example.com"),
    out: await loginAs("out@example.com"),
  };
}

function projectBody(managerId: string, extra: Record<string, unknown> = {}) {
  return {
    name: extra.name ?? "Chennai Project",
    code: extra.code ?? "CHN-001",
    description: extra.description ?? "Chennai infrastructure project",
    location: extra.location ?? "Chennai",
    projectType: extra.projectType ?? "INFRASTRUCTURE",
    managerId,
    members: extra.members ?? [],
    status: extra.status ?? "PLANNING",
    progress: extra.progress ?? 0,
    budget: extra.budget ?? 15000000,
    startDate: extra.startDate ?? "2026-08-20T00:00:00.000Z",
    expectedEndDate: extra.expectedEndDate ?? "2027-08-20T00:00:00.000Z",
    ...extra,
  };
}

async function createProject(token: string, managerId: string, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/projects").set(auth(token)).send(projectBody(managerId, extra));
}

describe("Project management APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  describe("create", () => {
    it("creates a project with generated projectId and createdBy from the session", async () => {
      const ctx = await seed();
      const response = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        members: [String(ctx.rajEmp._id)],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.projectId).toBe("PROJ-000001");
      expect(response.body.data.code).toBe("CHN-001");
      expect(response.body.data.manager.employeeCode).toMatch(/^EMP-/);
      expect(response.body.data.members).toHaveLength(1);
      expect(response.body.data.actualExpense).toBe(0);
      expect(response.body.data.createdBy).toBe(ctx.admin.user.id);
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
    });

    it("rejects a missing name", async () => {
      const ctx = await seed();
      const response = await request(app).post("/api/v1/projects").set(auth(ctx.admin.accessToken)).send({
        projectType: "INFRASTRUCTURE",
        managerId: String(ctx.managerEmp._id),
      });
      expect(response.status).toBe(422);
    });

    it("rejects an invalid manager", async () => {
      const ctx = await seed();
      const response = await createProject(ctx.admin.accessToken, new mongoose.Types.ObjectId().toString());
      expect(response.status).toBe(400);
    });

    it("rejects an inactive manager", async () => {
      const ctx = await seed();
      const inactiveUser = await createUser("EMPLOYEE", "inactive@example.com", "9876500105");
      const inactiveEmp = await createEmployeeForUser(inactiveUser, { status: "INACTIVE", phone: "9876500105" });
      const response = await createProject(ctx.admin.accessToken, String(inactiveEmp._id), { code: "IN-001" });
      expect(response.status).toBe(400);
    });

    it("rejects an invalid project type", async () => {
      const ctx = await seed();
      const response = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        projectType: "WAREHOUSE",
      });
      expect(response.status).toBe(422);
    });

    it("rejects invalid progress and budget", async () => {
      const ctx = await seed();
      const progress = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        code: "P-1",
        progress: 150,
      });
      expect(progress.status).toBe(422);

      const budget = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        code: "P-2",
        budget: 10.5,
      });
      expect(budget.status).toBe(422);
    });

    it("rejects an invalid date range", async () => {
      const ctx = await seed();
      const response = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        startDate: "2027-01-01T00:00:00.000Z",
        expectedEndDate: "2026-01-01T00:00:00.000Z",
      });
      expect(response.status).toBe(422);
    });

    it("rejects a duplicate project code", async () => {
      const ctx = await seed();
      await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), { code: "CHN-001" });
      const response = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        name: "Second",
        code: "chn-001",
      });
      expect(response.status).toBe(409);
    });

    it("rejects client-provided createdBy", async () => {
      const ctx = await seed();
      const response = await request(app).post("/api/v1/projects").set(auth(ctx.admin.accessToken)).send({
        ...projectBody(String(ctx.managerEmp._id)),
        createdBy: String(ctx.raj.user.id),
      });
      expect(response.status).toBe(422);
    });
  });

  describe("list and get", () => {
    it("paginates, searches, filters, and sorts", async () => {
      const ctx = await seed();
      await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        name: "Chennai Project",
        code: "CHN-001",
        location: "Chennai",
        projectType: "INFRASTRUCTURE",
      });
      await createProject(ctx.admin.accessToken, String(ctx.rajEmp._id), {
        name: "Bangalore Project",
        code: "BLR-002",
        location: "Bangalore",
        projectType: "RESIDENTIAL",
        description: "IT campus",
        status: "PLANNING",
      });

      const page = await request(app).get("/api/v1/projects?page=1&limit=1").set(auth(ctx.admin.accessToken));
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta.total).toBe(2);

      const search = await request(app).get("/api/v1/projects?search=Chennai").set(auth(ctx.admin.accessToken));
      expect(search.body.data).toHaveLength(1);

      const type = await request(app)
        .get("/api/v1/projects?projectType=RESIDENTIAL&location=Bangalore")
        .set(auth(ctx.admin.accessToken));
      expect(type.body.data).toHaveLength(1);

      const manager = await request(app)
        .get(`/api/v1/projects?managerId=${ctx.managerEmp._id}`)
        .set(auth(ctx.admin.accessToken));
      expect(manager.body.data).toHaveLength(1);

      const sorted = await request(app)
        .get("/api/v1/projects?sortBy=name&sortOrder=asc")
        .set(auth(ctx.admin.accessToken));
      expect(sorted.body.data[0].name).toBe("Bangalore Project");
    });

    it("returns a project with manager and members and rejects invalid ids", async () => {
      const ctx = await seed();
      const created = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        members: [String(ctx.rajEmp._id)],
      });

      const fetched = await request(app)
        .get(`/api/v1/projects/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(fetched.status).toBe(200);
      expect(fetched.body.data.manager.id).toBe(String(ctx.managerEmp._id));
      expect(fetched.body.data.members[0].id).toBe(String(ctx.rajEmp._id));

      const invalid = await request(app).get("/api/v1/projects/not-an-id").set(auth(ctx.admin.accessToken));
      expect(invalid.status).toBe(400);

      const missing = await request(app)
        .get(`/api/v1/projects/${new mongoose.Types.ObjectId().toString()}`)
        .set(auth(ctx.admin.accessToken));
      expect(missing.status).toBe(404);
    });
  });

  describe("update and status", () => {
    it("updates allowed fields and rejects protected fields and operators", async () => {
      const ctx = await seed();
      const created = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id));

      const updated = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken))
        .send({ name: "Chennai Metro", progress: 10 });
      expect(updated.status).toBe(200);
      expect(updated.body.data.name).toBe("Chennai Metro");
      expect(updated.body.data.projectId).toBe("PROJ-000001");

      const protectedField = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken))
        .send({ actualExpense: 99, projectId: "HACK" });
      expect(protectedField.status).toBe(422);

      const injected = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken))
        .send({ $set: { budget: 1 } });
      expect(injected.status).toBe(422);
    });

    it("applies controlled status transitions and completion side effects", async () => {
      const ctx = await seed();
      const created = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id));

      const active = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "ACTIVE" });
      expect(active.status).toBe(200);

      const hold = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "ON_HOLD" });
      expect(hold.status).toBe(200);

      await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "ACTIVE" });

      const risk = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "AT_RISK" });
      expect(risk.status).toBe(200);

      await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "ACTIVE" });

      const done = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "COMPLETED" });
      expect(done.status).toBe(200);
      expect(done.body.data.progress).toBe(100);
      expect(done.body.data.completedAt).toBeTruthy();

      const reopen = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "ACTIVE" });
      expect(reopen.status).toBe(409);
    });
  });

  describe("members and manager", () => {
    it("replaces members, removes duplicates, and rejects invalid or inactive employees", async () => {
      const ctx = await seed();
      const created = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id));

      const added = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/members`)
        .set(auth(ctx.admin.accessToken))
        .send({ members: [String(ctx.rajEmp._id), String(ctx.rajEmp._id)] });
      expect(added.status).toBe(200);
      expect(added.body.data.members).toHaveLength(1);

      const cleared = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/members`)
        .set(auth(ctx.admin.accessToken))
        .send({ members: [] });
      expect(cleared.body.data.members).toHaveLength(0);

      const invalid = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/members`)
        .set(auth(ctx.admin.accessToken))
        .send({ members: [new mongoose.Types.ObjectId().toString()] });
      expect(invalid.status).toBe(400);

      const inactiveUser = await createUser("EMPLOYEE", "dead@example.com", "9876500106");
      const inactiveEmp = await createEmployeeForUser(inactiveUser, { status: "INACTIVE", phone: "9876500106" });
      const inactive = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/members`)
        .set(auth(ctx.admin.accessToken))
        .send({ members: [String(inactiveEmp._id)] });
      expect(inactive.status).toBe(400);
    });

    it("updates the manager for privileged roles", async () => {
      const ctx = await seed();
      const created = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id));
      const response = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/manager`)
        .set(auth(ctx.admin.accessToken))
        .send({ managerId: String(ctx.rajEmp._id) });
      expect(response.status).toBe(200);
      expect(response.body.data.manager.id).toBe(String(ctx.rajEmp._id));
    });
  });

  describe("authorization", () => {
    it("requires a JWT", async () => {
      const response = await request(app).get("/api/v1/projects");
      expect(response.status).toBe(401);
    });

    it("lets a manager update their project but not change manager or budget", async () => {
      const ctx = await seed();
      const created = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        members: [String(ctx.rajEmp._id)],
      });

      const update = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}`)
        .set(auth(ctx.manager.accessToken))
        .send({ description: "Updated by manager" });
      expect(update.status).toBe(200);

      const budget = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}`)
        .set(auth(ctx.manager.accessToken))
        .send({ budget: 1 });
      expect(budget.status).toBe(403);

      const managerChange = await request(app)
        .patch(`/api/v1/projects/${created.body.data.id}/manager`)
        .set(auth(ctx.manager.accessToken))
        .send({ managerId: String(ctx.rajEmp._id) });
      expect(managerChange.status).toBe(403);
    });

    it("lets an employee view assigned projects only and blocks mutations", async () => {
      const ctx = await seed();
      const assigned = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        members: [String(ctx.rajEmp._id)],
        code: "CHN-001",
      });
      await createProject(ctx.admin.accessToken, String(ctx.outEmp._id), {
        name: "Secret",
        code: "SEC-001",
      });

      const list = await request(app).get("/api/v1/projects").set(auth(ctx.raj.accessToken));
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(assigned.body.data.id);

      const create = await createProject(ctx.raj.accessToken, String(ctx.rajEmp._id), { code: "EMP-P" });
      expect(create.status).toBe(403);

      const members = await request(app)
        .patch(`/api/v1/projects/${assigned.body.data.id}/members`)
        .set(auth(ctx.raj.accessToken))
        .send({ members: [String(ctx.outEmp._id)] });
      expect(members.status).toBe(403);

      const remove = await request(app)
        .delete(`/api/v1/projects/${assigned.body.data.id}`)
        .set(auth(ctx.raj.accessToken));
      expect(remove.status).toBe(403);
    });
  });

  describe("task integration", () => {
    it("lists project tasks with pagination and filters, excluding deleted tasks", async () => {
      const ctx = await seed();
      const project = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        members: [String(ctx.rajEmp._id)],
      });

      const first = await request(app).post("/api/v1/tasks").set(auth(ctx.admin.accessToken)).send({
        title: "Site inspection",
        assignedTo: String(ctx.rajEmp._id),
        projectId: project.body.data.id,
        priority: "HIGH",
        dueDate: "2026-09-01T00:00:00.000Z",
      });
      const second = await request(app).post("/api/v1/tasks").set(auth(ctx.admin.accessToken)).send({
        title: "Vendor follow-up",
        assignedTo: String(ctx.managerEmp._id),
        projectId: project.body.data.id,
        priority: "LOW",
      });
      await request(app).delete(`/api/v1/tasks/${second.body.data.id}`).set(auth(ctx.admin.accessToken));

      const list = await request(app)
        .get(`/api/v1/projects/${project.body.data.id}/tasks?page=1&limit=20&status=PENDING&priority=HIGH`)
        .set(auth(ctx.admin.accessToken));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(first.body.data.id);
      expect(list.body.meta.total).toBe(1);

      const stored = await Project.findById(project.body.data.id).lean();
      expect((stored as { tasks?: unknown }).tasks).toBeUndefined();
    });

    it("returns task summary counts including overdue and excludes deleted tasks", async () => {
      const ctx = await seed();
      const project = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id));
      await request(app).post("/api/v1/tasks").set(auth(ctx.admin.accessToken)).send({
        title: "Late",
        assignedTo: String(ctx.rajEmp._id),
        projectId: project.body.data.id,
        dueDate: "2020-01-01T00:00:00.000Z",
      });
      const extra = await request(app).post("/api/v1/tasks").set(auth(ctx.admin.accessToken)).send({
        title: "Gone",
        assignedTo: String(ctx.rajEmp._id),
        projectId: project.body.data.id,
      });
      await request(app).delete(`/api/v1/tasks/${extra.body.data.id}`).set(auth(ctx.admin.accessToken));

      const summary = await request(app)
        .get(`/api/v1/projects/${project.body.data.id}/tasks/summary`)
        .set(auth(ctx.admin.accessToken));
      expect(summary.body.data).toMatchObject({
        total: 1,
        pending: 1,
        overdue: 1,
      });
    });
  });

  describe("summary and delete", () => {
    it("returns project summary with remaining budget and deterministic health", async () => {
      const ctx = await seed();
      const created = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id), {
        budget: 10000000,
      });
      await Project.updateOne({ _id: created.body.data.id }, { $set: { actualExpense: 11000000 } });
      await request(app).post("/api/v1/tasks").set(auth(ctx.admin.accessToken)).send({
        title: "Overdue work",
        assignedTo: String(ctx.rajEmp._id),
        projectId: created.body.data.id,
        dueDate: "2020-01-01T00:00:00.000Z",
      });

      const response = await request(app)
        .get(`/api/v1/projects/${created.body.data.id}/summary`)
        .set(auth(ctx.admin.accessToken));
      expect(response.status).toBe(200);
      expect(response.body.data.financial).toEqual({
        budget: 10000000,
        actualExpense: 11000000,
        remainingBudget: -1000000,
      });
      expect(response.body.data.tasks.overdue).toBe(1);
      expect(response.body.data.project.health).toBe("CRITICAL");
    });

    it("soft-deletes a project, hides it from lists, and keeps related tasks", async () => {
      const ctx = await seed();
      const created = await createProject(ctx.admin.accessToken, String(ctx.managerEmp._id));
      const task = await request(app).post("/api/v1/tasks").set(auth(ctx.admin.accessToken)).send({
        title: "Keep me",
        assignedTo: String(ctx.rajEmp._id),
        projectId: created.body.data.id,
      });

      const removed = await request(app)
        .delete(`/api/v1/projects/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(removed.status).toBe(200);
      expect(removed.body.data.isDeleted).toBe(true);

      const list = await request(app).get("/api/v1/projects").set(auth(ctx.admin.accessToken));
      expect(list.body.data).toHaveLength(0);

      const fetched = await request(app)
        .get(`/api/v1/projects/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(fetched.status).toBe(404);

      const storedProject = await Project.findById(created.body.data.id).lean();
      const storedTask = await Task.findById(task.body.data.id).lean();
      expect(storedProject?.isDeleted).toBe(true);
      expect(storedTask).not.toBeNull();
      expect(String(storedTask?.projectId)).toBe(created.body.data.id);
    });
  });
});

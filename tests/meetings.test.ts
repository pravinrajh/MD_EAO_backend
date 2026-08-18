import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Meeting } from "../src/models/Meeting";
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
  options: { status?: "ACTIVE" | "INACTIVE"; phone?: string } = {},
) {
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName: user.email.split("@")[0],
    lastName: "Worker",
    displayName: `${user.email.split("@")[0]} Worker`,
    email: user.email,
    phone: options.phone ?? "9876500200",
    employmentType: "FULL_TIME",
    status: options.status ?? "ACTIVE",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500201");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500202");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500203");
  const otherUser = await createUser("EMPLOYEE", "other@example.com", "9876500204");

  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500202" });
  const rajEmp = await createEmployeeForUser(employeeUser, { phone: "9876500203" });
  const otherEmp = await createEmployeeForUser(otherUser, { phone: "9876500204" });

  return {
    adminUser,
    managerEmp,
    rajEmp,
    otherEmp,
    admin: await loginAs("admin@example.com"),
    manager: await loginAs("manager@example.com"),
    raj: await loginAs("raj@example.com"),
    other: await loginAs("other@example.com"),
  };
}

async function createMeeting(token: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/meetings")
    .set(auth(token))
    .send({
      title: extra.title ?? "Chennai Project Review",
      description: extra.description ?? "Weekly project progress review",
      meetingType: extra.meetingType ?? "PROJECT_REVIEW",
      participants: extra.participants ?? [],
      location: extra.location ?? "Conference Room 1",
      startTime: extra.startTime ?? "2026-08-20T10:00:00.000Z",
      endTime: extra.endTime ?? "2026-08-20T11:00:00.000Z",
      timezone: extra.timezone ?? "Asia/Kolkata",
      ...extra,
    });
}

describe("Meeting and calendar APIs", () => {
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
    it("creates a meeting with generated id and organizer from the session", async () => {
      const ctx = await seed();
      const response = await createMeeting(ctx.admin.accessToken, {
        participants: [String(ctx.rajEmp._id)],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.meetingId).toBe("MTG-000001");
      expect(response.body.data.status).toBe("SCHEDULED");
      expect(response.body.data.organizer.id).toBe(ctx.admin.user.id);
      expect(response.body.data.createdBy).toBe(ctx.admin.user.id);
      expect(response.body.data.participants[0].id).toBe(String(ctx.rajEmp._id));
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);

      const second = await createMeeting(ctx.admin.accessToken, {
        title: "Second",
        startTime: "2026-08-20T12:00:00.000Z",
        endTime: "2026-08-20T13:00:00.000Z",
      });
      expect(second.status).toBe(201);
      expect(second.body.data.meetingId).toBe("MTG-000002");
    });

    it("rejects missing title, invalid type, timezone, and date order", async () => {
      const ctx = await seed();
      const missing = await request(app).post("/api/v1/meetings").set(auth(ctx.admin.accessToken)).send({
        startTime: "2026-08-20T10:00:00.000Z",
        endTime: "2026-08-20T11:00:00.000Z",
      });
      expect(missing.status).toBe(422);

      const type = await createMeeting(ctx.admin.accessToken, { meetingType: "PARTY" });
      expect(type.status).toBe(422);

      const tz = await createMeeting(ctx.admin.accessToken, { timezone: "Not/A_Zone" });
      expect(tz.status).toBe(422);

      const after = await createMeeting(ctx.admin.accessToken, {
        startTime: "2026-08-20T12:00:00.000Z",
        endTime: "2026-08-20T11:00:00.000Z",
      });
      expect(after.status).toBe(400);

      const equal = await createMeeting(ctx.admin.accessToken, {
        startTime: "2026-08-20T11:00:00.000Z",
        endTime: "2026-08-20T11:00:00.000Z",
      });
      expect(equal.status).toBe(400);
    });

    it("rejects invalid and inactive participants and invalid projects", async () => {
      const ctx = await seed();
      const missing = await createMeeting(ctx.admin.accessToken, {
        participants: [new mongoose.Types.ObjectId().toString()],
      });
      expect(missing.status).toBe(400);

      const inactiveUser = await createUser("EMPLOYEE", "inactive@example.com", "9876500205");
      const inactiveEmp = await createEmployeeForUser(inactiveUser, { status: "INACTIVE", phone: "9876500205" });
      const inactive = await createMeeting(ctx.admin.accessToken, {
        title: "Inactive",
        startTime: "2026-08-21T10:00:00.000Z",
        endTime: "2026-08-21T11:00:00.000Z",
        participants: [String(inactiveEmp._id)],
      });
      expect(inactive.status).toBe(400);

      const project = await createMeeting(ctx.admin.accessToken, {
        title: "Bad project",
        projectId: new mongoose.Types.ObjectId().toString(),
        startTime: "2026-08-22T10:00:00.000Z",
        endTime: "2026-08-22T11:00:00.000Z",
      });
      expect(project.status).toBe(400);

      const duplicate = await createMeeting(ctx.admin.accessToken, {
        title: "Duplicates",
        participants: [String(ctx.rajEmp._id), String(ctx.rajEmp._id)],
        startTime: "2026-08-22T14:00:00.000Z",
        endTime: "2026-08-22T15:00:00.000Z",
      });
      expect(duplicate.status).toBe(422);
    });

    it("rejects client-provided organizerId", async () => {
      const ctx = await seed();
      const response = await request(app).post("/api/v1/meetings").set(auth(ctx.admin.accessToken)).send({
        title: "Override",
        startTime: "2026-08-20T10:00:00.000Z",
        endTime: "2026-08-20T11:00:00.000Z",
        organizerId: ctx.raj.user.id,
      });
      expect(response.status).toBe(422);
    });
  });

  describe("list", () => {
    it("paginates, searches, filters, and sorts", async () => {
      const ctx = await seed();
      await createMeeting(ctx.admin.accessToken, {
        title: "Project review",
        meetingType: "PROJECT_REVIEW",
        participants: [String(ctx.rajEmp._id)],
        startTime: "2026-08-20T10:00:00.000Z",
        endTime: "2026-08-20T11:00:00.000Z",
      });
      await createMeeting(ctx.manager.accessToken, {
        title: "Vendor meeting",
        description: "Supplier discussion",
        meetingType: "VENDOR",
        location: "Client Office",
        participants: [String(ctx.otherEmp._id)],
        startTime: "2026-08-21T10:00:00.000Z",
        endTime: "2026-08-21T11:00:00.000Z",
      });

      const page = await request(app).get("/api/v1/meetings?page=1&limit=1").set(auth(ctx.admin.accessToken));
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta.total).toBe(2);

      const search = await request(app).get("/api/v1/meetings?search=project").set(auth(ctx.admin.accessToken));
      expect(search.body.data).toHaveLength(1);

      const type = await request(app)
        .get("/api/v1/meetings?meetingType=VENDOR&status=SCHEDULED")
        .set(auth(ctx.admin.accessToken));
      expect(type.body.data).toHaveLength(1);

      const participant = await request(app)
        .get(`/api/v1/meetings?participantId=${ctx.rajEmp._id}`)
        .set(auth(ctx.admin.accessToken));
      expect(participant.body.data).toHaveLength(1);

      const ranged = await request(app)
        .get("/api/v1/meetings?from=2026-08-21T00:00:00.000Z&to=2026-08-22T00:00:00.000Z")
        .set(auth(ctx.admin.accessToken));
      expect(ranged.body.data).toHaveLength(1);

      const sorted = await request(app)
        .get("/api/v1/meetings?sortBy=startTime&sortOrder=asc")
        .set(auth(ctx.admin.accessToken));
      expect(new Date(sorted.body.data[0].startTime).getTime()).toBeLessThan(
        new Date(sorted.body.data[1].startTime).getTime(),
      );
    });
  });

  describe("status and cancel", () => {
    it("applies allowed transitions and stores completion and cancellation metadata", async () => {
      const ctx = await seed();
      const created = await createMeeting(ctx.admin.accessToken, {
        participants: [String(ctx.rajEmp._id)],
      });

      const progress = await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "IN_PROGRESS" });
      expect(progress.status).toBe(200);

      const done = await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "COMPLETED", notes: "Project is currently 72% complete." });
      expect(done.status).toBe(200);
      expect(done.body.data.completedAt).toBeTruthy();
      expect(done.body.data.notes).toContain("72%");

      const reopen = await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "SCHEDULED" });
      expect(reopen.status).toBe(409);

      const inProgress = await createMeeting(ctx.admin.accessToken, {
        title: "Live meeting",
        startTime: "2026-08-22T10:00:00.000Z",
        endTime: "2026-08-22T11:00:00.000Z",
      });
      await request(app)
        .patch(`/api/v1/meetings/${inProgress.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "IN_PROGRESS" });
      const liveCancel = await request(app)
        .patch(`/api/v1/meetings/${inProgress.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "CANCELLED" });
      expect(liveCancel.status).toBe(200);
      expect(liveCancel.body.data.status).toBe("CANCELLED");

      const other = await createMeeting(ctx.admin.accessToken, {
        title: "Cancel me",
        startTime: "2026-08-23T10:00:00.000Z",
        endTime: "2026-08-23T11:00:00.000Z",
      });
      const cancelled = await request(app)
        .patch(`/api/v1/meetings/${other.body.data.id}/cancel`)
        .set(auth(ctx.admin.accessToken))
        .send({ reason: "Client requested reschedule" });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe("CANCELLED");
      expect(cancelled.body.data.cancelledAt).toBeTruthy();
      expect(cancelled.body.data.cancellationReason).toBe("Client requested reschedule");
    });
  });

  describe("reschedule and conflicts", () => {
    it("reschedules a valid meeting and rejects closed meetings", async () => {
      const ctx = await seed();
      const created = await createMeeting(ctx.admin.accessToken, {
        participants: [String(ctx.rajEmp._id)],
      });
      const moved = await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}/reschedule`)
        .set(auth(ctx.admin.accessToken))
        .send({
          startTime: "2026-08-21T11:00:00.000Z",
          endTime: "2026-08-21T12:00:00.000Z",
          timezone: "Asia/Kolkata",
        });
      expect(moved.status).toBe(200);

      const invalid = await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}/reschedule`)
        .set(auth(ctx.admin.accessToken))
        .send({
          startTime: "2026-08-21T13:00:00.000Z",
          endTime: "2026-08-21T12:00:00.000Z",
        });
      expect(invalid.status).toBe(400);

      await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "IN_PROGRESS" });
      await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "COMPLETED" });
      const closed = await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}/reschedule`)
        .set(auth(ctx.admin.accessToken))
        .send({
          startTime: "2026-08-22T11:00:00.000Z",
          endTime: "2026-08-22T12:00:00.000Z",
        });
      expect(closed.status).toBe(409);

      const cancellable = await createMeeting(ctx.admin.accessToken, {
        title: "To cancel",
        startTime: "2026-08-24T10:00:00.000Z",
        endTime: "2026-08-24T11:00:00.000Z",
      });
      await request(app)
        .patch(`/api/v1/meetings/${cancellable.body.data.id}/cancel`)
        .set(auth(ctx.admin.accessToken))
        .send({ reason: "Client requested reschedule" });
      const cancelledMove = await request(app)
        .patch(`/api/v1/meetings/${cancellable.body.data.id}/reschedule`)
        .set(auth(ctx.admin.accessToken))
        .send({
          startTime: "2026-08-25T11:00:00.000Z",
          endTime: "2026-08-25T12:00:00.000Z",
        });
      expect(cancelledMove.status).toBe(409);
    });

    it("detects overlapping participants and allows adjacent or different-participant meetings", async () => {
      const ctx = await seed();
      const first = await createMeeting(ctx.admin.accessToken, {
        title: "Block A",
        participants: [String(ctx.rajEmp._id)],
        startTime: "2026-08-20T10:00:00.000Z",
        endTime: "2026-08-20T11:00:00.000Z",
      });
      expect(first.status).toBe(201);

      const overlap = await createMeeting(ctx.admin.accessToken, {
        title: "Block B",
        participants: [String(ctx.rajEmp._id)],
        startTime: "2026-08-20T10:30:00.000Z",
        endTime: "2026-08-20T11:30:00.000Z",
      });
      expect(overlap.status).toBe(409);
      expect(overlap.body.message).toBe("Meeting conflict detected");

      const adjacent = await createMeeting(ctx.admin.accessToken, {
        title: "Block C",
        participants: [String(ctx.rajEmp._id)],
        startTime: "2026-08-20T11:00:00.000Z",
        endTime: "2026-08-20T12:00:00.000Z",
      });
      expect(adjacent.status).toBe(201);

      const other = await createMeeting(ctx.admin.accessToken, {
        title: "Other people",
        participants: [String(ctx.otherEmp._id)],
        startTime: "2026-08-20T10:30:00.000Z",
        endTime: "2026-08-20T11:30:00.000Z",
      });
      expect(other.status).toBe(201);

      await request(app)
        .patch(`/api/v1/meetings/${first.body.data.id}/cancel`)
        .set(auth(ctx.admin.accessToken))
        .send({ reason: "No longer needed" });
      const afterCancel = await createMeeting(ctx.admin.accessToken, {
        title: "Reuse slot",
        participants: [String(ctx.rajEmp._id)],
        startTime: "2026-08-20T10:00:00.000Z",
        endTime: "2026-08-20T11:00:00.000Z",
      });
      expect(afterCancel.status).toBe(201);
    });
  });

  describe("views", () => {
    it("does not treat static paths as ids and returns today, upcoming, my, calendar, and counts", async () => {
      const ctx = await seed();
      const now = new Date();
      const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const inTwoDaysEnd = new Date(inTwoDays.getTime() + 60 * 60 * 1000);

      await createMeeting(ctx.admin.accessToken, {
        title: "Today slot",
        participants: [String(ctx.rajEmp._id)],
        startTime: now.toISOString(),
        endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      });
      await createMeeting(ctx.admin.accessToken, {
        title: "Later slot",
        participants: [String(ctx.rajEmp._id)],
        startTime: inTwoDays.toISOString(),
        endTime: inTwoDaysEnd.toISOString(),
      });

      const today = await request(app).get("/api/v1/meetings/today").set(auth(ctx.admin.accessToken));
      expect(today.status).toBe(200);
      expect(today.body.data.some((item: { title: string }) => item.title === "Today slot")).toBe(true);

      const upcoming = await request(app).get("/api/v1/meetings/upcoming?days=7").set(auth(ctx.admin.accessToken));
      expect(upcoming.status).toBe(200);
      expect(upcoming.body.data.some((item: { title: string }) => item.title === "Later slot")).toBe(true);

      const mine = await request(app).get("/api/v1/meetings/my").set(auth(ctx.raj.accessToken));
      expect(mine.status).toBe(200);
      expect(mine.body.data.length).toBeGreaterThan(0);

      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const to = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();
      const calendar = await request(app)
        .get(`/api/v1/meetings/calendar?from=${from}&to=${to}`)
        .set(auth(ctx.admin.accessToken));
      expect(calendar.status).toBe(200);
      expect(calendar.body.data[0].start).toBeDefined();
      expect(calendar.body.data[0].title).toBeDefined();

      const tooWide = await request(app)
        .get("/api/v1/meetings/calendar?from=2020-01-01&to=2030-01-01")
        .set(auth(ctx.admin.accessToken));
      expect(tooWide.status).toBe(422);

      const counts = await request(app).get("/api/v1/meetings/counts").set(auth(ctx.admin.accessToken));
      expect(counts.body.data.total).toBe(2);
      expect(counts.body.data.scheduled).toBe(2);
    });
  });

  describe("authorization and delete", () => {
    it("requires JWT and hides unrelated meetings from employees", async () => {
      const ctx = await seed();
      expect((await request(app).get("/api/v1/meetings")).status).toBe(401);

      const created = await createMeeting(ctx.admin.accessToken, {
        participants: [String(ctx.otherEmp._id)],
        startTime: "2026-08-24T10:00:00.000Z",
        endTime: "2026-08-24T11:00:00.000Z",
      });
      const hidden = await request(app)
        .get(`/api/v1/meetings/${created.body.data.id}`)
        .set(auth(ctx.raj.accessToken));
      expect(hidden.status).toBe(403);

      const create = await createMeeting(ctx.raj.accessToken, {
        title: "Employee created",
        startTime: "2026-08-25T10:00:00.000Z",
        endTime: "2026-08-25T11:00:00.000Z",
      });
      expect(create.status).toBe(403);

      const organizer = await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}`)
        .set(auth(ctx.raj.accessToken))
        .send({ organizerId: ctx.raj.user.id, title: "Hijack" });
      expect(organizer.status).toBe(422);

      const hijack = await request(app)
        .patch(`/api/v1/meetings/${created.body.data.id}`)
        .set(auth(ctx.raj.accessToken))
        .send({ title: "Hijack" });
      expect(hijack.status).toBe(403);
    });

    it("lets an employee view meetings they participate in", async () => {
      const ctx = await seed();
      const created = await createMeeting(ctx.admin.accessToken, {
        participants: [String(ctx.rajEmp._id)],
        startTime: "2026-08-26T10:00:00.000Z",
        endTime: "2026-08-26T11:00:00.000Z",
      });
      const mine = await request(app).get(`/api/v1/meetings/${created.body.data.id}`).set(auth(ctx.raj.accessToken));
      expect(mine.status).toBe(200);
    });

    it("soft-deletes meetings and excludes them from lists", async () => {
      const ctx = await seed();
      const created = await createMeeting(ctx.admin.accessToken);
      const removed = await request(app)
        .delete(`/api/v1/meetings/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(removed.status).toBe(200);
      expect(removed.body.data.isDeleted).toBe(true);

      const list = await request(app).get("/api/v1/meetings").set(auth(ctx.admin.accessToken));
      expect(list.body.data).toHaveLength(0);

      const stored = await Meeting.findById(created.body.data.id).lean();
      expect(stored?.isDeleted).toBe(true);
    });
  });

  describe("project integration", () => {
    it("lists meetings for a project", async () => {
      const ctx = await seed();
      const project = await request(app).post("/api/v1/projects").set(auth(ctx.admin.accessToken)).send({
        name: "Chennai Project",
        code: "CHN-MTG",
        projectType: "INFRASTRUCTURE",
        managerId: String(ctx.managerEmp._id),
      });
      const created = await createMeeting(ctx.admin.accessToken, {
        title: "Site meeting",
        projectId: project.body.data.id,
        participants: [String(ctx.rajEmp._id)],
        startTime: "2026-08-27T10:00:00.000Z",
        endTime: "2026-08-27T11:00:00.000Z",
      });
      expect(created.status).toBe(201);

      const list = await request(app)
        .get(`/api/v1/projects/${project.body.data.id}/meetings`)
        .set(auth(ctx.admin.accessToken));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(created.body.data.id);
    });
  });
});

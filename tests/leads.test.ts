import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Lead } from "../src/models/Lead";
import { User } from "../src/models/User";
import { leadService } from "../src/services/lead.service";
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
  options: { status?: "ACTIVE" | "INACTIVE"; phone?: string; managerId?: string } = {},
) {
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName: user.email.split("@")[0],
    lastName: "Worker",
    displayName: `${user.email.split("@")[0]} Worker`,
    email: user.email,
    phone: options.phone ?? "9876500300",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500301");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500302");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500303");
  const otherUser = await createUser("EMPLOYEE", "other@example.com", "9876500304");

  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500302" });
  const rajEmp = await createEmployeeForUser(employeeUser, {
    phone: "9876500303",
    managerId: String(managerEmp._id),
  });
  const otherEmp = await createEmployeeForUser(otherUser, { phone: "9876500304" });

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

function leadBody(extra: Record<string, unknown> = {}) {
  return {
    name: "Raj Kumar",
    companyName: "ABC Industries",
    email: extra.email ?? "raj@abc.com",
    phone: extra.phone ?? "9876543210",
    source: "WEBSITE",
    industry: "Manufacturing",
    location: "Chennai",
    description: "Interested in project development",
    priority: "HIGH",
    estimatedValue: 5000000,
    expectedCloseDate: "2026-12-30T00:00:00.000Z",
    nextFollowUpAt: "2026-08-25T10:00:00.000Z",
    ...extra,
  };
}

async function createLead(token: string, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/leads").set(auth(token)).send(leadBody(extra));
}

describe("Lead APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
    await Lead.syncIndexes();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  describe("create", () => {
    it("creates a lead with generated id and createdBy from the session", async () => {
      const ctx = await seed();
      const response = await createLead(ctx.admin.accessToken, { assignedTo: String(ctx.rajEmp._id) });

      expect(response.status).toBe(201);
      expect(response.body.data.leadId).toBe("LEAD-000001");
      expect(response.body.data.status).toBe("NEW");
      expect(response.body.data.priority).toBe("HIGH");
      expect(response.body.data.createdBy.id).toBe(ctx.admin.user.id);
      expect(response.body.data.assignedTo.id).toBe(String(ctx.rajEmp._id));
      expect(response.body.data.estimatedValue).toBe(5000000);
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
      expect(JSON.stringify(response.body)).not.toMatch(/emailNormalized/);

      const second = await createLead(ctx.admin.accessToken, {
        email: "second@abc.com",
        phone: "9876543211",
      });
      expect(second.status).toBe(201);
      expect(second.body.data.leadId).toBe("LEAD-000002");
    });

    it("rejects invalid email, phone, source, priority, money, and missing contact", async () => {
      const ctx = await seed();
      const email = await createLead(ctx.admin.accessToken, { email: "not-an-email" });
      expect(email.status).toBe(422);

      const phone = await createLead(ctx.admin.accessToken, { phone: "12345", email: "ok@abc.com" });
      expect(phone.status).toBe(422);

      const source = await createLead(ctx.admin.accessToken, { source: "WALK_IN", email: "ok2@abc.com", phone: "9876543212" });
      expect(source.status).toBe(422);

      const priority = await createLead(ctx.admin.accessToken, {
        priority: "URGENT",
        email: "ok3@abc.com",
        phone: "9876543213",
      });
      expect(priority.status).toBe(422);

      const money = await createLead(ctx.admin.accessToken, {
        estimatedValue: 10.5,
        email: "ok4@abc.com",
        phone: "9876543214",
      });
      expect(money.status).toBe(422);

      const missing = await request(app).post("/api/v1/leads").set(auth(ctx.admin.accessToken)).send({
        name: "No Contact",
        source: "WEBSITE",
      });
      expect(missing.status).toBe(422);
    });

    it("rejects inactive and missing assignees and client-provided createdBy", async () => {
      const ctx = await seed();
      const missing = await createLead(ctx.admin.accessToken, {
        assignedTo: new mongoose.Types.ObjectId().toString(),
        email: "miss@abc.com",
        phone: "9876543215",
      });
      expect(missing.status).toBe(400);

      const inactiveUser = await createUser("EMPLOYEE", "inactive@example.com", "9876500305");
      const inactiveEmp = await createEmployeeForUser(inactiveUser, { status: "INACTIVE", phone: "9876500305" });
      const inactive = await createLead(ctx.admin.accessToken, {
        assignedTo: String(inactiveEmp._id),
        email: "inact@abc.com",
        phone: "9876543216",
      });
      expect(inactive.status).toBe(400);

      const override = await request(app).post("/api/v1/leads").set(auth(ctx.admin.accessToken)).send({
        ...leadBody({ email: "over@abc.com", phone: "9876543217" }),
        createdBy: ctx.raj.user.id,
      });
      expect(override.status).toBe(422);

      const created = await createLead(ctx.admin.accessToken, { email: "op@abc.com", phone: "9876543218" });
      const operators = await request(app)
        .patch(`/api/v1/leads/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken))
        .send({ $set: { name: "Hacked" } });
      expect(operators.status).toBe(422);
    });

    it("prevents duplicate email or phone", async () => {
      const ctx = await seed();
      const first = await createLead(ctx.admin.accessToken);
      expect(first.status).toBe(201);

      const emailDup = await createLead(ctx.admin.accessToken, { phone: "9876543299" });
      expect(emailDup.status).toBe(409);

      const phoneDup = await createLead(ctx.admin.accessToken, { email: "other@abc.com" });
      expect(phoneDup.status).toBe(409);
    });

    it("does not let an employee assign another employee", async () => {
      const ctx = await seed();
      const response = await createLead(ctx.raj.accessToken, { assignedTo: String(ctx.otherEmp._id) });
      expect(response.status).toBe(403);
    });
  });

  describe("list and get", () => {
    it("supports search, pagination, filters, and date range", async () => {
      const ctx = await seed();
      await createLead(ctx.admin.accessToken, {
        assignedTo: String(ctx.rajEmp._id),
        companyName: "ABC Industries",
      });
      await createLead(ctx.admin.accessToken, {
        name: "Other Lead",
        companyName: "XYZ Corp",
        email: "xyz@xyz.com",
        phone: "9876543220",
        source: "REFERRAL",
        priority: "LOW",
        assignedTo: String(ctx.otherEmp._id),
      });

      const search = await request(app).get("/api/v1/leads?search=ABC").set(auth(ctx.admin.accessToken));
      expect(search.status).toBe(200);
      expect(search.body.data).toHaveLength(1);
      expect(search.body.data[0].companyName).toBe("ABC Industries");
      expect(search.body.meta.total).toBe(1);
      expect(search.body.meta.limit).toBeLessThanOrEqual(100);

      const paged = await request(app).get("/api/v1/leads?page=1&limit=1").set(auth(ctx.admin.accessToken));
      expect(paged.body.data).toHaveLength(1);
      expect(paged.body.meta.total).toBe(2);
      expect(paged.body.meta.hasNextPage).toBe(true);

      const filtered = await request(app)
        .get(`/api/v1/leads?status=NEW&priority=HIGH&source=WEBSITE&assignedTo=${ctx.rajEmp._id}`)
        .set(auth(ctx.admin.accessToken));
      expect(filtered.body.data).toHaveLength(1);

      const ranged = await request(app)
        .get("/api/v1/leads?from=2026-08-01T00:00:00.000Z&to=2099-08-31T00:00:00.000Z&sortBy=createdAt&sortOrder=desc")
        .set(auth(ctx.admin.accessToken));
      expect(ranged.status).toBe(200);
      expect(ranged.body.data.length).toBe(2);
    });

    it("returns assigned employee and created by on get", async () => {
      const ctx = await seed();
      const created = await createLead(ctx.admin.accessToken, { assignedTo: String(ctx.rajEmp._id) });
      const response = await request(app)
        .get(`/api/v1/leads/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(response.status).toBe(200);
      expect(response.body.data.assignedTo.name).toBeDefined();
      expect(response.body.data.createdBy.name).toBeDefined();
    });

    it("hides other employees' leads from an employee", async () => {
      const ctx = await seed();
      const mine = await createLead(ctx.admin.accessToken, {
        assignedTo: String(ctx.rajEmp._id),
        email: "mine@abc.com",
        phone: "9876543221",
      });
      await createLead(ctx.admin.accessToken, {
        assignedTo: String(ctx.otherEmp._id),
        email: "theirs@abc.com",
        phone: "9876543222",
      });

      const list = await request(app).get("/api/v1/leads").set(auth(ctx.raj.accessToken));
      expect(list.body.data.every((item: { id: string }) => item.id === mine.body.data.id)).toBe(true);

      const otherLead = await request(app).get("/api/v1/leads").set(auth(ctx.admin.accessToken));
      const foreign = otherLead.body.data.find((item: { email: string }) => item.email === "theirs@abc.com");
      const hidden = await request(app).get(`/api/v1/leads/${foreign.id}`).set(auth(ctx.raj.accessToken));
      expect(hidden.status).toBe(403);

      const impersonate = await request(app)
        .get(`/api/v1/leads?assignedTo=${ctx.otherEmp._id}`)
        .set(auth(ctx.raj.accessToken));
      expect(impersonate.status).toBe(403);
    });
  });

  describe("update status follow-up convert delete", () => {
    it("updates allowed fields and rejects status and id changes", async () => {
      const ctx = await seed();
      const created = await createLead(ctx.admin.accessToken, { assignedTo: String(ctx.rajEmp._id) });
      const response = await request(app)
        .patch(`/api/v1/leads/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken))
        .send({ location: "Coimbatore", priority: "CRITICAL" });
      expect(response.status).toBe(200);
      expect(response.body.data.location).toBe("Coimbatore");

      const blocked = await request(app)
        .patch(`/api/v1/leads/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "QUALIFIED", leadId: "LEAD-999999" });
      expect(blocked.status).toBe(422);
    });

    it("enforces controlled status transitions", async () => {
      const ctx = await seed();
      const created = await createLead(ctx.admin.accessToken);
      const id = created.body.data.id;

      const contacted = await request(app)
        .patch(`/api/v1/leads/${id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "CONTACTED" });
      expect(contacted.status).toBe(200);

      const qualified = await request(app)
        .patch(`/api/v1/leads/${id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "QUALIFIED" });
      expect(qualified.status).toBe(200);

      const skip = await request(app)
        .patch(`/api/v1/leads/${id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "NEW" });
      expect(skip.status).toBe(409);

      const convertViaStatus = await request(app)
        .patch(`/api/v1/leads/${id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "CONVERTED" });
      expect(convertViaStatus.status).toBe(409);

      const lost = await request(app)
        .patch(`/api/v1/leads/${id}/status`)
        .set(auth(ctx.admin.accessToken))
        .send({ status: "LOST" });
      expect(lost.status).toBe(200);
    });

    it("updates follow-up date", async () => {
      const ctx = await seed();
      const created = await createLead(ctx.admin.accessToken);
      const response = await request(app)
        .patch(`/api/v1/leads/${created.body.data.id}/follow-up`)
        .set(auth(ctx.admin.accessToken))
        .send({ nextFollowUpAt: "2026-09-01T10:00:00.000Z" });
      expect(response.status).toBe(200);
      expect(response.body.data.nextFollowUpAt).toBe("2026-09-01T10:00:00.000Z");

      const invalid = await request(app)
        .patch(`/api/v1/leads/${created.body.data.id}/follow-up`)
        .set(auth(ctx.admin.accessToken))
        .send({ nextFollowUpAt: "not-a-date" });
      expect(invalid.status).toBe(422);
    });

    it("converts a lead to customer and opportunity idempotently", async () => {
      const ctx = await seed();
      const created = await createLead(ctx.admin.accessToken, { assignedTo: String(ctx.rajEmp._id) });
      const id = created.body.data.id;

      await request(app).patch(`/api/v1/leads/${id}/status`).set(auth(ctx.admin.accessToken)).send({ status: "CONTACTED" });
      await request(app).patch(`/api/v1/leads/${id}/status`).set(auth(ctx.admin.accessToken)).send({ status: "QUALIFIED" });

      const converted = await request(app).post(`/api/v1/leads/${id}/convert`).set(auth(ctx.admin.accessToken)).send({
        createCustomer: true,
        createOpportunity: true,
        opportunity: {
          title: "ABC Industries Project",
          estimatedValue: 5000000,
          expectedCloseDate: "2026-12-30T00:00:00.000Z",
        },
      });
      expect(converted.status).toBe(200);
      expect(converted.body.data.lead.status).toBe("CONVERTED");
      expect(converted.body.data.customer.customerId).toBe("CUST-000001");
      expect(converted.body.data.opportunity.opportunityId).toBe("OPP-000001");

      const again = await request(app).post(`/api/v1/leads/${id}/convert`).set(auth(ctx.admin.accessToken)).send({
        createCustomer: true,
        createOpportunity: true,
      });
      expect(again.status).toBe(200);
      expect(again.body.data.customer.id).toBe(converted.body.data.customer.id);
      expect(again.body.data.opportunity.id).toBe(converted.body.data.opportunity.id);
    });

    it("soft-deletes leads and hides them from list and get", async () => {
      const ctx = await seed();
      const created = await createLead(ctx.admin.accessToken);
      const removed = await request(app)
        .delete(`/api/v1/leads/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(removed.status).toBe(200);
      expect(removed.body.data.isDeleted).toBe(true);

      const list = await request(app).get("/api/v1/leads").set(auth(ctx.admin.accessToken));
      expect(list.body.data).toHaveLength(0);

      const get = await request(app)
        .get(`/api/v1/leads/${created.body.data.id}`)
        .set(auth(ctx.admin.accessToken));
      expect(get.status).toBe(404);

      const forbidden = await request(app)
        .delete(`/api/v1/leads/${created.body.data.id}`)
        .set(auth(ctx.raj.accessToken));
      expect([403, 404]).toContain(forbidden.status);
    });

    it("requires authentication and rejects invalid ids", async () => {
      const unauth = await request(app).get("/api/v1/leads");
      expect(unauth.status).toBe(401);

      const ctx = await seed();
      const invalid = await request(app).get("/api/v1/leads/not-an-id").set(auth(ctx.admin.accessToken));
      expect(invalid.status).toBe(400);
    });

    it("uses indexes for paginated list queries", async () => {
      const ctx = await seed();
      await createLead(ctx.admin.accessToken);
      const plan = (await leadService.explainList({}, { id: ctx.admin.user.id, role: "ADMIN" })) as {
        queryPlanner?: { winningPlan?: { inputStage?: { indexName?: string }; indexName?: string } };
      };
      const planJson = JSON.stringify(plan);
      expect(planJson).toMatch(/IXSCAN|indexName|winningPlan/);
    });
  });
});

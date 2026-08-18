import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Customer } from "../src/models/Customer";
import { Employee } from "../src/models/Employee";
import { Lead } from "../src/models/Lead";
import { Opportunity } from "../src/models/Opportunity";
import { SalesActivity } from "../src/models/SalesActivity";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { nextCustomerId, nextEmployeeCode, nextLeadId, nextOpportunityId } from "../src/utils/sequence";
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
    phone: options.phone ?? "9876500600",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500601");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500603");
  const otherUser = await createUser("EMPLOYEE", "other@example.com", "9876500604");
  const rajEmp = await createEmployeeForUser(employeeUser, { phone: "9876500603" });
  const otherEmp = await createEmployeeForUser(otherUser, { phone: "9876500604" });

  const lead = await Lead.create({
    leadId: await nextLeadId(),
    name: "Raj Kumar",
    companyName: "ABC Industries",
    email: "raj@abc.com",
    phone: "9876543210",
    source: "WEBSITE",
    assignedTo: rajEmp._id,
    status: "NEW",
    createdBy: adminUser._id,
    emailNormalized: "raj@abc.com",
    phoneNormalized: "9876543210",
  });

  const customer = await Customer.create({
    customerId: await nextCustomerId(),
    name: "ABC Industries",
    companyName: "ABC Industries Pvt Ltd",
    email: "contact@abc.com",
    phone: "9876543211",
    assignedTo: rajEmp._id,
    status: "ACTIVE",
    createdBy: adminUser._id,
    emailNormalized: "contact@abc.com",
    phoneNormalized: "9876543211",
  });

  const opportunity = await Opportunity.create({
    opportunityId: await nextOpportunityId(),
    title: "ABC Project",
    customerId: customer._id,
    assignedTo: rajEmp._id,
    stage: "PROPOSAL",
    probability: 50,
    estimatedValue: 5000000,
    createdBy: adminUser._id,
  });

  return {
    rajEmp,
    otherEmp,
    lead,
    customer,
    opportunity,
    admin: await loginAs("admin@example.com"),
    raj: await loginAs("raj@example.com"),
    other: await loginAs("other@example.com"),
  };
}

describe("Sales activity APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
    await SalesActivity.syncIndexes();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("creates an activity linked to lead, customer, or opportunity", async () => {
    const ctx = await seed();
    const response = await request(app).post("/api/v1/sales-activities").set(auth(ctx.admin.accessToken)).send({
      type: "CALL",
      title: "Intro call",
      leadId: String(ctx.lead._id),
      customerId: String(ctx.customer._id),
      opportunityId: String(ctx.opportunity._id),
      employeeId: String(ctx.rajEmp._id),
      scheduledAt: "2026-08-25T10:00:00.000Z",
    });
    expect(response.status).toBe(201);
    expect(response.body.data.activityId).toBe("ACT-000001");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.employeeId.id).toBe(String(ctx.rajEmp._id));
    expect(response.body.data.leadId).toBe(String(ctx.lead._id));
  });

  it("validates type, relationship, and employee", async () => {
    const ctx = await seed();
    const noLink = await request(app).post("/api/v1/sales-activities").set(auth(ctx.admin.accessToken)).send({
      type: "CALL",
      title: "Orphan",
    });
    expect(noLink.status).toBe(422);

    const badType = await request(app).post("/api/v1/sales-activities").set(auth(ctx.admin.accessToken)).send({
      type: "SMS",
      title: "Bad",
      leadId: String(ctx.lead._id),
      employeeId: String(ctx.rajEmp._id),
    });
    expect(badType.status).toBe(422);

    const missingLead = await request(app).post("/api/v1/sales-activities").set(auth(ctx.admin.accessToken)).send({
      type: "EMAIL",
      title: "Missing lead",
      leadId: new mongoose.Types.ObjectId().toString(),
      employeeId: String(ctx.rajEmp._id),
    });
    expect(missingLead.status).toBe(400);

    const missingCustomer = await request(app).post("/api/v1/sales-activities").set(auth(ctx.admin.accessToken)).send({
      type: "NOTE",
      title: "Missing customer",
      customerId: new mongoose.Types.ObjectId().toString(),
      employeeId: String(ctx.rajEmp._id),
    });
    expect(missingCustomer.status).toBe(400);

    const missingOpp = await request(app).post("/api/v1/sales-activities").set(auth(ctx.admin.accessToken)).send({
      type: "MEETING",
      title: "Missing opp",
      opportunityId: new mongoose.Types.ObjectId().toString(),
      employeeId: String(ctx.rajEmp._id),
    });
    expect(missingOpp.status).toBe(400);
  });

  it("enforces status transitions, date filtering, pagination, and soft delete", async () => {
    const ctx = await seed();
    const created = await request(app).post("/api/v1/sales-activities").set(auth(ctx.admin.accessToken)).send({
      type: "FOLLOW_UP",
      title: "Follow up",
      leadId: String(ctx.lead._id),
      employeeId: String(ctx.rajEmp._id),
      scheduledAt: "2026-08-25T10:00:00.000Z",
    });
    const id = created.body.data.id;

    await request(app).post("/api/v1/sales-activities").set(auth(ctx.admin.accessToken)).send({
      type: "SITE_VISIT",
      title: "Site visit",
      customerId: String(ctx.customer._id),
      employeeId: String(ctx.otherEmp._id),
      scheduledAt: "2026-09-01T10:00:00.000Z",
    });

    const completed = await request(app)
      .patch(`/api/v1/sales-activities/${id}/status`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "COMPLETED" });
    expect(completed.status).toBe(200);
    expect(completed.body.data.completedAt).toBeTruthy();

    const again = await request(app)
      .patch(`/api/v1/sales-activities/${id}/status`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "PENDING" });
    expect(again.status).toBe(409);

    const filtered = await request(app)
      .get(
        `/api/v1/sales-activities?leadId=${ctx.lead._id}&from=2026-08-01T00:00:00.000Z&to=2026-08-31T00:00:00.000Z`,
      )
      .set(auth(ctx.admin.accessToken));
    expect(filtered.body.data).toHaveLength(1);

    const paged = await request(app).get("/api/v1/sales-activities?page=1&limit=1").set(auth(ctx.admin.accessToken));
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBe(2);

    const removed = await request(app).delete(`/api/v1/sales-activities/${id}`).set(auth(ctx.admin.accessToken));
    expect(removed.status).toBe(200);

    const list = await request(app).get("/api/v1/sales-activities").set(auth(ctx.admin.accessToken));
    expect(list.body.data).toHaveLength(1);
  });

  it("does not let an employee impersonate another employee", async () => {
    const ctx = await seed();
    const created = await request(app).post("/api/v1/sales-activities").set(auth(ctx.raj.accessToken)).send({
      type: "CALL",
      title: "My call",
      leadId: String(ctx.lead._id),
      employeeId: String(ctx.otherEmp._id),
    });
    expect(created.status).toBe(403);
  });
});

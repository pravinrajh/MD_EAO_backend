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
import {
  nextActivityId,
  nextCustomerId,
  nextEmployeeCode,
  nextLeadId,
  nextOpportunityId,
} from "../src/utils/sequence";
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
  options: { phone?: string } = {},
) {
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName: user.email.split("@")[0],
    lastName: "Worker",
    displayName: `${user.email.split("@")[0]} Worker`,
    email: user.email,
    phone: options.phone ?? "9876500700",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500701");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500703");
  const otherUser = await createUser("EMPLOYEE", "other@example.com", "9876500704");
  const rajEmp = await createEmployeeForUser(employeeUser, { phone: "9876500703" });
  const otherEmp = await createEmployeeForUser(otherUser, { phone: "9876500704" });

  const lead = await Lead.create({
    leadId: await nextLeadId(),
    name: "Raj Kumar",
    companyName: "ABC Industries",
    email: "raj@abc.com",
    phone: "9876543210",
    source: "WEBSITE",
    assignedTo: rajEmp._id,
    status: "NEW",
    estimatedValue: 1000000,
    nextFollowUpAt: new Date("2026-08-20T10:00:00.000Z"),
    createdBy: adminUser._id,
    emailNormalized: "raj@abc.com",
    phoneNormalized: "9876543210",
  });

  await Lead.create({
    leadId: await nextLeadId(),
    name: "Other Lead",
    companyName: "XYZ",
    email: "xyz@xyz.com",
    phone: "9876543219",
    source: "REFERRAL",
    assignedTo: otherEmp._id,
    status: "QUALIFIED",
    estimatedValue: 2000000,
    createdBy: adminUser._id,
    emailNormalized: "xyz@xyz.com",
    phoneNormalized: "9876543219",
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
    expectedCloseDate: new Date("2026-12-30T00:00:00.000Z"),
    nextFollowUpAt: new Date("2026-08-21T10:00:00.000Z"),
    createdBy: adminUser._id,
  });

  await SalesActivity.create({
    activityId: await nextActivityId(),
    type: "CALL",
    title: "Pending call",
    leadId: lead._id,
    employeeId: rajEmp._id,
    status: "PENDING",
    scheduledAt: new Date("2026-08-25T10:00:00.000Z"),
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

describe("Sales summary, my sales, and follow-ups", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("does not treat summary, my, and follow-ups as ids", async () => {
    const ctx = await seed();

    const summary = await request(app).get("/api/v1/sales/summary").set(auth(ctx.admin.accessToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data.leads.total).toBe(2);
    expect(summary.body.data.leads.new).toBe(1);
    expect(summary.body.data.leads.qualified).toBe(1);
    expect(summary.body.data.customers.total).toBe(1);
    expect(summary.body.data.customers.active).toBe(1);
    expect(summary.body.data.opportunities.total).toBe(1);
    expect(summary.body.data.opportunities.open).toBe(1);
    expect(summary.body.data.pipeline.totalValue).toBe(5000000);
    expect(summary.body.data.pipeline.weightedValue).toBe(2500000);

    const mine = await request(app).get("/api/v1/sales/my").set(auth(ctx.raj.accessToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data.leads.total).toBe(1);
    expect(mine.body.data.customers.total).toBe(1);
    expect(mine.body.data.opportunities.total).toBe(1);
    expect(mine.body.data.pendingActivities.total).toBe(1);
    expect(mine.body.data.leads.items.length).toBeLessThanOrEqual(20);

    const bypass = await request(app)
      .get(`/api/v1/sales/my?employeeId=${ctx.otherEmp._id}`)
      .set(auth(ctx.raj.accessToken));
    expect(bypass.status).toBe(200);
    expect(bypass.body.data.leads.total).toBe(1);

    const followUps = await request(app)
      .get("/api/v1/sales/follow-ups?to=2026-08-31T00:00:00.000Z")
      .set(auth(ctx.admin.accessToken));
    expect(followUps.status).toBe(200);
    expect(followUps.body.data.leads.total).toBe(1);
    expect(followUps.body.data.opportunities.total).toBe(1);

    const scoped = await request(app)
      .get(`/api/v1/sales/follow-ups?assignedTo=${ctx.otherEmp._id}`)
      .set(auth(ctx.raj.accessToken));
    expect(scoped.status).toBe(403);
  });

  it("requires authentication", async () => {
    const summary = await request(app).get("/api/v1/sales/summary");
    expect(summary.status).toBe(401);
  });
});

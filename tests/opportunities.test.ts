import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Customer } from "../src/models/Customer";
import { Employee } from "../src/models/Employee";
import { Opportunity } from "../src/models/Opportunity";
import { Project } from "../src/models/Project";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { nextCustomerId, nextEmployeeCode, nextProjectId } from "../src/utils/sequence";
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
    phone: options.phone ?? "9876500500",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500501");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500502");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500503");
  const otherUser = await createUser("EMPLOYEE", "other@example.com", "9876500504");

  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500502" });
  const rajEmp = await createEmployeeForUser(employeeUser, {
    phone: "9876500503",
    managerId: String(managerEmp._id),
  });
  const otherEmp = await createEmployeeForUser(otherUser, { phone: "9876500504" });

  const customer = await Customer.create({
    customerId: await nextCustomerId(),
    name: "ABC Industries",
    companyName: "ABC Industries Pvt Ltd",
    email: "contact@abc.com",
    phone: "9876543210",
    assignedTo: rajEmp._id,
    status: "ACTIVE",
    createdBy: adminUser._id,
    emailNormalized: "contact@abc.com",
    phoneNormalized: "9876543210",
    companyNameNormalized: "abc industries pvt ltd",
  });

  const project = await Project.create({
    projectId: await nextProjectId(),
    name: "Chennai Tower",
    code: "CHN-1",
    projectType: "RESIDENTIAL",
    managerId: managerEmp._id,
    members: [rajEmp._id],
    status: "ACTIVE",
    createdBy: adminUser._id,
  });

  return {
    adminUser,
    managerEmp,
    rajEmp,
    otherEmp,
    customer,
    project,
    admin: await loginAs("admin@example.com"),
    manager: await loginAs("manager@example.com"),
    raj: await loginAs("raj@example.com"),
    other: await loginAs("other@example.com"),
  };
}

function opportunityBody(customerId: string, extra: Record<string, unknown> = {}) {
  return {
    title: extra.title ?? "ABC Industries Project",
    customerId,
    assignedTo: extra.assignedTo,
    stage: extra.stage ?? "PROPOSAL",
    probability: extra.probability ?? 60,
    estimatedValue: extra.estimatedValue ?? 5000000,
    expectedCloseDate: extra.expectedCloseDate ?? "2026-12-30T00:00:00.000Z",
    description: extra.description ?? "Infrastructure project opportunity",
    nextFollowUpAt: extra.nextFollowUpAt ?? "2026-08-25T10:00:00.000Z",
    ...extra,
  };
}

async function createOpportunity(token: string, customerId: string, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/opportunities").set(auth(token)).send(opportunityBody(customerId, extra));
}

describe("Opportunity APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
    await Opportunity.syncIndexes();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("creates an opportunity with generated id and default probability for stage", async () => {
    const ctx = await seed();
    const response = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      assignedTo: String(ctx.rajEmp._id),
      stage: "NEW",
      probability: undefined,
    });
    expect(response.status).toBe(201);
    expect(response.body.data.opportunityId).toBe("OPP-000001");
    expect(response.body.data.stage).toBe("NEW");
    expect(response.body.data.probability).toBe(10);
    expect(response.body.data.createdBy.id).toBe(ctx.admin.user.id);
    expect(response.body.data.customer.customerId).toBeDefined();
  });

  it("does not overwrite a supplied probability", async () => {
    const ctx = await seed();
    const response = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      stage: "PROPOSAL",
      probability: 60,
    });
    expect(response.status).toBe(201);
    expect(response.body.data.probability).toBe(60);
  });

  it("validates customer, employee, project, probability, and money", async () => {
    const ctx = await seed();
    const missingCustomer = await createOpportunity(ctx.admin.accessToken, new mongoose.Types.ObjectId().toString());
    expect(missingCustomer.status).toBe(400);

    const inactiveUser = await createUser("EMPLOYEE", "inactive@example.com", "9876500505");
    const inactiveEmp = await createEmployeeForUser(inactiveUser, { status: "INACTIVE", phone: "9876500505" });
    const inactive = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      assignedTo: String(inactiveEmp._id),
      title: "Inactive",
    });
    expect(inactive.status).toBe(400);

    const badProject = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      projectId: new mongoose.Types.ObjectId().toString(),
      title: "Bad project",
    });
    expect(badProject.status).toBe(400);

    const goodProject = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      projectId: String(ctx.project._id),
      title: "Linked project",
      estimatedValue: 100000,
    });
    expect(goodProject.status).toBe(201);

    const probability = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      probability: 140,
      title: "Bad probability",
    });
    expect(probability.status).toBe(422);

    const money = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      estimatedValue: 1.5,
      title: "Bad money",
    });
    expect(money.status).toBe(422);

    const employeeCreate = await createOpportunity(ctx.raj.accessToken, String(ctx.customer._id), {
      title: "Employee cannot create",
    });
    expect(employeeCreate.status).toBe(403);
  });

  it("enforces stage transitions, WON, LOST, and lostReason", async () => {
    const ctx = await seed();
    const created = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      stage: "NEW",
      assignedTo: String(ctx.rajEmp._id),
    });
    const id = created.body.data.id;

    const skip = await request(app)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set(auth(ctx.admin.accessToken))
      .send({ stage: "WON" });
    expect(skip.status).toBe(409);

    await request(app)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set(auth(ctx.admin.accessToken))
      .send({ stage: "QUALIFICATION" });
    await request(app)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set(auth(ctx.admin.accessToken))
      .send({ stage: "PROPOSAL" });
    await request(app)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set(auth(ctx.admin.accessToken))
      .send({ stage: "NEGOTIATION" });

    const lostNoReason = await request(app)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set(auth(ctx.admin.accessToken))
      .send({ stage: "LOST" });
    expect(lostNoReason.status).toBe(422);

    const won = await request(app)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set(auth(ctx.admin.accessToken))
      .send({ stage: "WON" });
    expect(won.status).toBe(200);
    expect(won.body.data.probability).toBe(100);
    expect(won.body.data.wonAt).toBeTruthy();

    const lostCreated = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      title: "To lose",
      stage: "PROPOSAL",
      estimatedValue: 1000000,
    });
    const lost = await request(app)
      .patch(`/api/v1/opportunities/${lostCreated.body.data.id}/stage`)
      .set(auth(ctx.admin.accessToken))
      .send({ stage: "LOST", lostReason: "Budget cancelled" });
    expect(lost.status).toBe(200);
    expect(lost.body.data.probability).toBe(0);
    expect(lost.body.data.lostAt).toBeTruthy();
    expect(lost.body.data.lostReason).toBe("Budget cancelled");
  });

  it("does not treat pipeline and forecast as ids and aggregates in MongoDB", async () => {
    const ctx = await seed();
    await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      title: "New deal",
      stage: "NEW",
      estimatedValue: 1000000,
      probability: 10,
    });
    await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      title: "Proposal deal",
      stage: "PROPOSAL",
      estimatedValue: 5000000,
      probability: 50,
    });
    await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      title: "Won deal",
      stage: "WON",
      estimatedValue: 6000000,
      probability: 100,
    });
    await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      title: "Lost deal",
      stage: "LOST",
      estimatedValue: 1000000,
      probability: 0,
    });

    const pipeline = await request(app).get("/api/v1/opportunities/pipeline").set(auth(ctx.admin.accessToken));
    expect(pipeline.status).toBe(200);
    expect(pipeline.body.data.NEW.count).toBe(1);
    expect(pipeline.body.data.NEW.totalValue).toBe(1000000);
    expect(pipeline.body.data.PROPOSAL.count).toBe(1);
    expect(pipeline.body.data.WON.count).toBe(1);
    expect(pipeline.body.data.LOST.count).toBe(1);
    expect(pipeline.body.data.QUALIFICATION.count).toBe(0);

    const forecast = await request(app).get("/api/v1/opportunities/forecast").set(auth(ctx.admin.accessToken));
    expect(forecast.status).toBe(200);
    expect(forecast.body.data.pipelineValue).toBe(6000000);
    expect(forecast.body.data.weightedPipelineValue).toBe(1000000 * 0.1 + 5000000 * 0.5);
    expect(forecast.body.data.wonValue).toBe(6000000);
  });

  it("supports search, pagination, and authorization", async () => {
    const ctx = await seed();
    await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      title: "ABC Industries Project",
      assignedTo: String(ctx.rajEmp._id),
    });
    await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id), {
      title: "Other Deal",
      assignedTo: String(ctx.otherEmp._id),
      estimatedValue: 1000,
    });

    const search = await request(app).get("/api/v1/opportunities?search=ABC").set(auth(ctx.admin.accessToken));
    expect(search.body.data).toHaveLength(1);

    const paged = await request(app).get("/api/v1/opportunities?page=1&limit=1").set(auth(ctx.admin.accessToken));
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBe(2);

    const employeeList = await request(app).get("/api/v1/opportunities").set(auth(ctx.raj.accessToken));
    expect(employeeList.body.data).toHaveLength(1);

    const impersonate = await request(app)
      .get(`/api/v1/opportunities?assignedTo=${ctx.otherEmp._id}`)
      .set(auth(ctx.raj.accessToken));
    expect(impersonate.status).toBe(403);
  });

  it("rejects direct stage updates on PATCH and invalid ids", async () => {
    const ctx = await seed();
    const created = await createOpportunity(ctx.admin.accessToken, String(ctx.customer._id));
    const blocked = await request(app)
      .patch(`/api/v1/opportunities/${created.body.data.id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ stage: "WON" });
    expect(blocked.status).toBe(422);

    const invalid = await request(app).get("/api/v1/opportunities/not-an-id").set(auth(ctx.admin.accessToken));
    expect(invalid.status).toBe(400);
  });
});

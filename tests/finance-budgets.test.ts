import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Project } from "../src/models/Project";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { nextEmployeeCode, nextProjectId } from "../src/utils/sequence";
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
    phone: options.phone ?? "9876500820",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500821");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500822");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500823");
  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500822" });
  const rajEmp = await createEmployeeForUser(employeeUser, { phone: "9876500823" });
  const project = await Project.create({
    projectId: await nextProjectId(),
    name: "Chennai Project",
    code: "CHN-BUD-1",
    projectType: "INFRASTRUCTURE",
    managerId: managerEmp._id,
    members: [rajEmp._id],
    budget: 15000000,
    createdBy: adminUser._id,
  });
  return {
    project,
    admin: await loginAs("admin@example.com"),
    manager: await loginAs("manager@example.com"),
    raj: await loginAs("raj@example.com"),
  };
}

async function financeSetup(token: string) {
  const account = await request(app)
    .post("/api/v1/finance/accounts")
    .set(auth(token))
    .send({ name: "Bank", code: "1100", type: "BANK", openingBalance: 10000000, currency: "INR" });
  const category = await request(app)
    .post("/api/v1/finance/categories")
    .set(auth(token))
    .send({ name: "Operating Expense", code: "5000", type: "EXPENSE" });
  return { account: account.body.data, category: category.body.data };
}

describe("Finance budgets", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("creates a budget and derives summary from completed expenses", async () => {
    const ctx = await seed();
    const { account, category } = await financeSetup(ctx.admin.accessToken);

    const created = await request(app)
      .post("/api/v1/finance/budgets")
      .set(auth(ctx.admin.accessToken))
      .send({
        name: "FY26 Opex",
        projectId: String(ctx.project._id),
        categoryId: category.id,
        amount: 5000000,
        currency: "INR",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T23:59:59.000Z",
      });
    expect(created.status).toBe(201);
    expect(created.body.data.budgetId).toMatch(/^BUD-000001$/);

    await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.id,
        categoryId: category.id,
        amount: 3500000,
        projectId: String(ctx.project._id),
        transactionDate: "2026-06-15T06:00:00.000Z",
      });

    const summary = await request(app)
      .get(`/api/v1/finance/budgets/${created.body.data.id}/summary`)
      .set(auth(ctx.admin.accessToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data).toEqual({
      budget: 5000000,
      actual: 3500000,
      remaining: 1500000,
      utilizationPercentage: 70,
      isOverBudget: false,
    });

    await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.id,
        categoryId: category.id,
        amount: 2000000,
        projectId: String(ctx.project._id),
        transactionDate: "2026-07-15T06:00:00.000Z",
      });

    const over = await request(app)
      .get(`/api/v1/finance/budgets/${created.body.data.id}/summary`)
      .set(auth(ctx.admin.accessToken));
    expect(over.body.data.actual).toBe(5500000);
    expect(over.body.data.remaining).toBe(-500000);
    expect(over.body.data.utilizationPercentage).toBe(110);
    expect(over.body.data.isOverBudget).toBe(true);

    const listed = await request(app).get("/api/v1/finance/budgets?search=FY26").set(auth(ctx.admin.accessToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
  });

  it("rejects invalid budget payloads", async () => {
    const ctx = await seed();
    const { category } = await financeSetup(ctx.admin.accessToken);

    const dates = await request(app)
      .post("/api/v1/finance/budgets")
      .set(auth(ctx.admin.accessToken))
      .send({
        name: "Bad dates",
        amount: 1000,
        currency: "INR",
        periodStart: "2026-12-31T00:00:00.000Z",
        periodEnd: "2026-01-01T00:00:00.000Z",
      });
    expect(dates.status).toBe(422);

    const amount = await request(app)
      .post("/api/v1/finance/budgets")
      .set(auth(ctx.admin.accessToken))
      .send({
        name: "Bad amount",
        amount: 0,
        currency: "INR",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T00:00:00.000Z",
      });
    expect(amount.status).toBe(422);

    const project = await request(app)
      .post("/api/v1/finance/budgets")
      .set(auth(ctx.admin.accessToken))
      .send({
        name: "Missing project",
        projectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        categoryId: category.id,
        amount: 1000,
        currency: "INR",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T00:00:00.000Z",
      });
    expect(project.status).toBe(400);
  });

  it("enforces budget authorization and soft delete", async () => {
    const ctx = await seed();
    const employeeCreate = await request(app)
      .post("/api/v1/finance/budgets")
      .set(auth(ctx.raj.accessToken))
      .send({
        name: "Emp budget",
        projectId: String(ctx.project._id),
        amount: 1000,
        currency: "INR",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T00:00:00.000Z",
      });
    expect(employeeCreate.status).toBe(403);

    const managerCreate = await request(app)
      .post("/api/v1/finance/budgets")
      .set(auth(ctx.manager.accessToken))
      .send({
        name: "Manager budget",
        projectId: String(ctx.project._id),
        amount: 1000,
        currency: "INR",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T00:00:00.000Z",
      });
    expect(managerCreate.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/v1/finance/budgets/${managerCreate.body.data.id}`)
      .set(auth(ctx.manager.accessToken));
    expect(removed.status).toBe(200);
    expect(removed.body.data.isDeleted).toBe(true);

    const list = await request(app).get("/api/v1/finance/budgets").set(auth(ctx.manager.accessToken));
    expect(list.body.data).toHaveLength(0);
  });
});

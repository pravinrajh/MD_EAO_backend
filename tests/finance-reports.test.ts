import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Customer } from "../src/models/Customer";
import { Employee } from "../src/models/Employee";
import { FinanceTransaction } from "../src/models/FinanceTransaction";
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
  options: { phone?: string; managerId?: string } = {},
) {
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName: user.email.split("@")[0],
    lastName: "Worker",
    displayName: `${user.email.split("@")[0]} Worker`,
    email: user.email,
    phone: options.phone ?? "9876500830",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500831");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500832");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500833");
  const outsiderUser = await createUser("EMPLOYEE", "out@example.com", "9876500834");
  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500832" });
  const rajEmp = await createEmployeeForUser(employeeUser, {
    phone: "9876500833",
    managerId: String(managerEmp._id),
  });
  await createEmployeeForUser(outsiderUser, { phone: "9876500834" });

  const project = await Project.create({
    projectId: await nextProjectId(),
    name: "Chennai Project",
    code: "CHN-RPT-1",
    projectType: "INFRASTRUCTURE",
    managerId: managerEmp._id,
    members: [rajEmp._id],
    budget: 15000000,
    createdBy: adminUser._id,
  });

  const customer = await Customer.create({
    customerId: await nextCustomerId(),
    name: "ABC Industries",
    assignedTo: rajEmp._id,
    status: "ACTIVE",
    createdBy: adminUser._id,
    emailNormalized: "abc@abc.com",
    phoneNormalized: "9876543299",
  });

  return {
    adminUser,
    project,
    customer,
    admin: await loginAs("admin@example.com"),
    manager: await loginAs("manager@example.com"),
    raj: await loginAs("raj@example.com"),
    out: await loginAs("out@example.com"),
  };
}

async function chart(token: string) {
  const bank = await request(app)
    .post("/api/v1/finance/accounts")
    .set(auth(token))
    .send({ name: "Bank", code: "1100", type: "BANK", openingBalance: 100000000, currency: "INR" });
  const income = await request(app)
    .post("/api/v1/finance/categories")
    .set(auth(token))
    .send({ name: "Sales", code: "4000", type: "INCOME" });
  const travel = await request(app)
    .post("/api/v1/finance/categories")
    .set(auth(token))
    .send({ name: "Travel", code: "5100", type: "EXPENSE" });
  const utilities = await request(app)
    .post("/api/v1/finance/categories")
    .set(auth(token))
    .send({ name: "Utilities", code: "5200", type: "EXPENSE" });
  return {
    bank: bank.body.data,
    income: income.body.data,
    travel: travel.body.data,
    utilities: utilities.body.data,
  };
}

describe("Finance reports and security", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("aggregates company, monthly, category, project, and customer finance", async () => {
    const ctx = await seed();
    const ids = await chart(ctx.admin.accessToken);

    await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: ids.bank.id,
        categoryId: ids.income.id,
        amount: 5000000,
        projectId: String(ctx.project._id),
        customerId: String(ctx.customer._id),
        transactionDate: "2026-01-15T06:00:00.000Z",
      });
    await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: ids.bank.id,
        categoryId: ids.travel.id,
        amount: 250000,
        projectId: String(ctx.project._id),
        customerId: String(ctx.customer._id),
        transactionDate: "2026-01-20T06:00:00.000Z",
      });
    await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: ids.bank.id,
        categoryId: ids.utilities.id,
        amount: 180000,
        projectId: String(ctx.project._id),
        transactionDate: "2026-02-10T06:00:00.000Z",
      });

    const summary = await request(app).get("/api/v1/finance/summary").set(auth(ctx.admin.accessToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data.income).toBe(5000000);
    expect(summary.body.data.expense).toBe(430000);
    expect(summary.body.data.net).toBe(4570000);
    expect(summary.body.data.transactionCount).toBe(3);
    expect(summary.body.data.incomeTransactionCount).toBe(1);
    expect(summary.body.data.expenseTransactionCount).toBe(2);

    const january = await request(app)
      .get("/api/v1/finance/summary?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.000Z")
      .set(auth(ctx.admin.accessToken));
    expect(january.body.data.income).toBe(5000000);
    expect(january.body.data.expense).toBe(250000);

    const monthly = await request(app)
      .get("/api/v1/finance/reports/monthly?year=2026")
      .set(auth(ctx.admin.accessToken));
    expect(monthly.status).toBe(200);
    expect(monthly.body.data).toHaveLength(12);
    expect(monthly.body.data[0]).toEqual({ month: "2026-01", income: 5000000, expense: 250000, net: 4750000 });
    expect(monthly.body.data[1]).toEqual({ month: "2026-02", income: 0, expense: 180000, net: -180000 });

    const byCategory = await request(app)
      .get(`/api/v1/finance/reports/expenses-by-category?projectId=${String(ctx.project._id)}`)
      .set(auth(ctx.admin.accessToken));
    expect(byCategory.status).toBe(200);
    expect(byCategory.body.data).toEqual([
      { category: "Travel", amount: 250000 },
      { category: "Utilities", amount: 180000 },
    ]);

    const project = await request(app)
      .get(`/api/v1/finance/projects/${String(ctx.project._id)}/summary`)
      .set(auth(ctx.admin.accessToken));
    expect(project.status).toBe(200);
    expect(project.body.data).toEqual({
      projectId: ctx.project.projectId,
      budget: 15000000,
      income: 5000000,
      expense: 430000,
      net: 4570000,
      remainingBudget: 14570000,
    });

    const customer = await request(app)
      .get(`/api/v1/finance/customers/${String(ctx.customer._id)}/summary`)
      .set(auth(ctx.admin.accessToken));
    expect(customer.status).toBe(200);
    expect(customer.body.data.customerId).toBe(ctx.customer.customerId);
    expect(customer.body.data.income).toBe(5000000);
    expect(customer.body.data.expense).toBe(250000);
    expect(customer.body.data.accountsReceivable).toBeUndefined();
  });

  it("hides company-wide finance from employees and outsiders", async () => {
    const ctx = await seed();
    const company = await request(app).get("/api/v1/finance/summary").set(auth(ctx.raj.accessToken));
    expect(company.status).toBe(403);

    const monthly = await request(app).get("/api/v1/finance/reports/monthly?year=2026").set(auth(ctx.raj.accessToken));
    expect(monthly.status).toBe(403);

    const projectOk = await request(app)
      .get(`/api/v1/finance/projects/${String(ctx.project._id)}/summary`)
      .set(auth(ctx.raj.accessToken));
    expect(projectOk.status).toBe(200);

    const projectDenied = await request(app)
      .get(`/api/v1/finance/projects/${String(ctx.project._id)}/summary`)
      .set(auth(ctx.out.accessToken));
    expect(projectDenied.status).toBe(403);

    const customerOk = await request(app)
      .get(`/api/v1/finance/customers/${String(ctx.customer._id)}/summary`)
      .set(auth(ctx.raj.accessToken));
    expect(customerOk.status).toBe(200);

    const customerDenied = await request(app)
      .get(`/api/v1/finance/customers/${String(ctx.customer._id)}/summary`)
      .set(auth(ctx.out.accessToken));
    expect(customerDenied.status).toBe(403);
  });

  it("aggregates a larger transaction set without loading the collection in Node", async () => {
    const ctx = await seed();
    const ids = await chart(ctx.admin.accessToken);
    const docs = [];
    for (let i = 0; i < 250; i += 1) {
      docs.push({
        transactionId: `TXN-B${String(i + 1).padStart(6, "0")}`,
        type: i % 2 === 0 ? "INCOME" : "EXPENSE",
        accountId: ids.bank.id,
        categoryId: i % 2 === 0 ? ids.income.id : ids.travel.id,
        amount: 1000,
        currency: "INR",
        transactionDate: new Date("2026-03-10T06:00:00.000Z"),
        status: "COMPLETED",
        createdBy: ctx.admin.user.id,
      });
    }
    await FinanceTransaction.insertMany(docs);

    const started = Date.now();
    const summary = await request(app)
      .get("/api/v1/finance/summary?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.000Z")
      .set(auth(ctx.admin.accessToken));
    const elapsed = Date.now() - started;
    expect(summary.status).toBe(200);
    expect(summary.body.data.income).toBe(125000);
    expect(summary.body.data.expense).toBe(125000);
    expect(summary.body.data.transactionCount).toBe(250);
    expect(elapsed).toBeLessThan(5000);

    const page = await request(app)
      .get("/api/v1/finance/transactions?limit=100")
      .set(auth(ctx.admin.accessToken));
    expect(page.body.data).toHaveLength(100);
    expect(page.body.meta.limit).toBe(100);
    expect(page.body.meta.total).toBe(250);

    const indexes = await FinanceTransaction.createIndexes().then(() => FinanceTransaction.collection.indexes());
    expect(indexes.some((index) => index.key.transactionId === 1 && index.unique)).toBe(true);
    expect(indexes.some((index) => index.key.idempotencyKey === 1 && index.unique)).toBe(true);
  });

  it("does not leak internals on invalid identifiers", async () => {
    const ctx = await seed();
    const response = await request(app)
      .get("/api/v1/finance/transactions/not-an-id")
      .set(auth(ctx.admin.accessToken));
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|stack|MongoServerError/i);
  });
});

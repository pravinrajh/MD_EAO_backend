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
    phone: options.phone ?? "9876500810",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500811");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500812");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500813");
  const outsiderUser = await createUser("EMPLOYEE", "out@example.com", "9876500814");

  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500812" });
  const rajEmp = await createEmployeeForUser(employeeUser, {
    phone: "9876500813",
    managerId: String(managerEmp._id),
  });
  await createEmployeeForUser(outsiderUser, { phone: "9876500814" });

  const project = await Project.create({
    projectId: await nextProjectId(),
    name: "Chennai Project",
    code: "CHN-FIN-1",
    projectType: "INFRASTRUCTURE",
    managerId: managerEmp._id,
    members: [rajEmp._id],
    budget: 15000000,
    createdBy: adminUser._id,
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

async function createAccount(
  token: string,
  extra: Record<string, unknown> = {},
) {
  return request(app)
    .post("/api/v1/finance/accounts")
    .set(auth(token))
    .send({
      name: extra.name ?? "HDFC Bank",
      code: extra.code ?? "1100",
      type: extra.type ?? "BANK",
      openingBalance: extra.openingBalance ?? 100000,
      currency: "INR",
      ...extra,
    });
}

async function createCategory(token: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/finance/categories")
    .set(auth(token))
    .send({
      name: extra.name ?? "Sales Income",
      code: extra.code ?? "4000",
      type: extra.type ?? "INCOME",
      ...extra,
    });
}

describe("Finance transactions", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("records income, updates the account balance, and is idempotent", async () => {
    const ctx = await seed();
    const account = await createAccount(ctx.admin.accessToken, { openingBalance: 100000 });
    const category = await createCategory(ctx.admin.accessToken);
    const body = {
      accountId: account.body.data.id,
      categoryId: category.body.data.id,
      amount: 500000,
      currency: "INR",
      description: "Customer project payment",
      projectId: String(ctx.project._id),
      customerId: String(ctx.customer._id),
      transactionDate: "2026-08-20T00:00:00.000Z",
      paymentMethod: "BANK_TRANSFER",
      externalReference: "PAY-2026-001",
    };

    const created = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set({ ...auth(ctx.admin.accessToken), "Idempotency-Key": "finance-payment-2026-001" })
      .send(body);
    expect(created.status).toBe(201);
    expect(created.body.data.transactionId).toBe("TXN-000001");
    expect(created.body.data.type).toBe("INCOME");
    expect(created.body.data.amount).toBe(500000);
    expect(created.body.data.createdBy).toBe(ctx.admin.user.id);
    expect(created.body.data.account.currentBalance).toBe(600000);

    const retry = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set({ ...auth(ctx.admin.accessToken), "Idempotency-Key": "finance-payment-2026-001" })
      .send(body);
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(created.body.data.id);

    const refreshed = await request(app)
      .get(`/api/v1/finance/accounts/${account.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(refreshed.body.data.currentBalance).toBe(600000);
    expect(await FinanceTransaction.countDocuments()).toBe(1);

    const typeChange = await request(app)
      .patch(`/api/v1/finance/categories/${category.body.data.id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ type: "EXPENSE" });
    expect(typeChange.status).toBe(409);
  });

  it("rejects invalid income payloads", async () => {
    const ctx = await seed();
    const account = await createAccount(ctx.admin.accessToken);
    const incomeCategory = await createCategory(ctx.admin.accessToken);
    const expenseCategory = await createCategory(ctx.admin.accessToken, {
      name: "Utilities",
      code: "5000",
      type: "EXPENSE",
    });
    const inactive = await createAccount(ctx.admin.accessToken, { name: "Old", code: "1190", openingBalance: 1000 });
    await request(app)
      .patch(`/api/v1/finance/accounts/${inactive.body.data.id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "INACTIVE" });

    const missingAccount = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        categoryId: incomeCategory.body.data.id,
        amount: 1000,
      });
    expect(missingAccount.status).toBe(400);

    const inactiveRes = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: inactive.body.data.id,
        categoryId: incomeCategory.body.data.id,
        amount: 1000,
      });
    expect(inactiveRes.status).toBe(409);

    const wrongCategory = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: expenseCategory.body.data.id,
        amount: 1000,
      });
    expect(wrongCategory.status).toBe(400);

    const zero = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: incomeCategory.body.data.id,
        amount: 0,
      });
    expect(zero.status).toBe(422);

    const negative = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: incomeCategory.body.data.id,
        amount: -1000,
      });
    expect(negative.status).toBe(422);

    const currency = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: incomeCategory.body.data.id,
        amount: 1000,
        currency: "USD",
      });
    expect(currency.status).toBe(422);

    const project = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: incomeCategory.body.data.id,
        amount: 1000,
        projectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      });
    expect(project.status).toBe(400);

    const customer = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: incomeCategory.body.data.id,
        amount: 1000,
        customerId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      });
    expect(customer.status).toBe(400);
  });

  it("records expense, updates balance, and rolls back when funds are insufficient", async () => {
    const ctx = await seed();
    const account = await createAccount(ctx.admin.accessToken, { openingBalance: 25000 });
    const incomeCategory = await createCategory(ctx.admin.accessToken);
    const expenseCategory = await createCategory(ctx.admin.accessToken, {
      name: "Equipment",
      code: "5000",
      type: "EXPENSE",
    });

    const created = await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set({ ...auth(ctx.admin.accessToken), "Idempotency-Key": "expense-2026-001" })
      .send({
        accountId: account.body.data.id,
        categoryId: expenseCategory.body.data.id,
        amount: 25000,
        currency: "INR",
        description: "Office equipment",
        projectId: String(ctx.project._id),
        transactionDate: "2026-08-20T00:00:00.000Z",
        paymentMethod: "BANK_TRANSFER",
      });
    expect(created.status).toBe(201);
    expect(created.body.data.account.currentBalance).toBe(0);

    const retry = await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set({ ...auth(ctx.admin.accessToken), "Idempotency-Key": "expense-2026-001" })
      .send({
        accountId: account.body.data.id,
        categoryId: expenseCategory.body.data.id,
        amount: 25000,
      });
    expect(retry.body.data.id).toBe(created.body.data.id);

    const wrongType = await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: incomeCategory.body.data.id,
        amount: 1,
      });
    expect(wrongType.status).toBe(400);

    const overdrawn = await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: expenseCategory.body.data.id,
        amount: 1,
      });
    expect(overdrawn.status).toBe(409);
    expect(await FinanceTransaction.countDocuments()).toBe(1);

    const refreshed = await request(app)
      .get(`/api/v1/finance/accounts/${account.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(refreshed.body.data.currentBalance).toBe(0);
  });

  it("transfers between accounts atomically", async () => {
    const ctx = await seed();
    const source = await createAccount(ctx.admin.accessToken, {
      name: "Account A",
      code: "1100",
      openingBalance: 100000,
    });
    const dest = await createAccount(ctx.admin.accessToken, {
      name: "Account B",
      code: "1200",
      openingBalance: 50000,
    });
    const inactive = await createAccount(ctx.admin.accessToken, {
      name: "Frozen",
      code: "1300",
      openingBalance: 10000,
    });
    await request(app)
      .patch(`/api/v1/finance/accounts/${inactive.body.data.id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "INACTIVE" });

    const transfer = await request(app)
      .post("/api/v1/finance/transactions/transfer")
      .set({ ...auth(ctx.admin.accessToken), "Idempotency-Key": "transfer-2026-001" })
      .send({
        fromAccountId: source.body.data.id,
        toAccountId: dest.body.data.id,
        amount: 20000,
        currency: "INR",
        description: "Transfer to operating account",
        transactionDate: "2026-08-20T00:00:00.000Z",
      });
    expect(transfer.status).toBe(201);
    expect(transfer.body.data.type).toBe("TRANSFER");

    const afterA = await request(app)
      .get(`/api/v1/finance/accounts/${source.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    const afterB = await request(app)
      .get(`/api/v1/finance/accounts/${dest.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(afterA.body.data.currentBalance).toBe(80000);
    expect(afterB.body.data.currentBalance).toBe(70000);

    const retry = await request(app)
      .post("/api/v1/finance/transactions/transfer")
      .set({ ...auth(ctx.admin.accessToken), "Idempotency-Key": "transfer-2026-001" })
      .send({
        fromAccountId: source.body.data.id,
        toAccountId: dest.body.data.id,
        amount: 20000,
      });
    expect(retry.body.data.id).toBe(transfer.body.data.id);

    const same = await request(app)
      .post("/api/v1/finance/transactions/transfer")
      .set(auth(ctx.admin.accessToken))
      .send({
        fromAccountId: source.body.data.id,
        toAccountId: source.body.data.id,
        amount: 1000,
      });
    expect(same.status).toBe(422);

    const short = await request(app)
      .post("/api/v1/finance/transactions/transfer")
      .set(auth(ctx.admin.accessToken))
      .send({
        fromAccountId: source.body.data.id,
        toAccountId: dest.body.data.id,
        amount: 200000,
      });
    expect(short.status).toBe(409);
    const stillA = await request(app)
      .get(`/api/v1/finance/accounts/${source.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(stillA.body.data.currentBalance).toBe(80000);

    const inactiveDest = await request(app)
      .post("/api/v1/finance/transactions/transfer")
      .set(auth(ctx.admin.accessToken))
      .send({
        fromAccountId: source.body.data.id,
        toAccountId: inactive.body.data.id,
        amount: 1000,
      });
    expect(inactiveDest.status).toBe(409);

    const missing = await request(app)
      .post("/api/v1/finance/transactions/transfer")
      .set(auth(ctx.admin.accessToken))
      .send({
        fromAccountId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        toAccountId: dest.body.data.id,
        amount: 1000,
      });
    expect(missing.status).toBe(400);

    const managerBlocked = await request(app)
      .post("/api/v1/finance/transactions/transfer")
      .set(auth(ctx.manager.accessToken))
      .send({
        fromAccountId: source.body.data.id,
        toAccountId: dest.body.data.id,
        amount: 1000,
      });
    expect(managerBlocked.status).toBe(403);
  });

  it("applies pending status transitions once and rejects illegal moves", async () => {
    const ctx = await seed();
    const account = await createAccount(ctx.admin.accessToken, { openingBalance: 10000 });
    const category = await createCategory(ctx.admin.accessToken);

    const pending = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: category.body.data.id,
        amount: 4000,
        status: "PENDING",
      });
    expect(pending.status).toBe(201);
    const before = await request(app)
      .get(`/api/v1/finance/accounts/${account.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(before.body.data.currentBalance).toBe(10000);

    const completed = await request(app)
      .patch(`/api/v1/finance/transactions/${pending.body.data.id}/status`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "COMPLETED" });
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe("COMPLETED");

    const again = await request(app)
      .patch(`/api/v1/finance/transactions/${pending.body.data.id}/status`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "COMPLETED" });
    expect(again.status).toBe(200);

    const after = await request(app)
      .get(`/api/v1/finance/accounts/${account.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(after.body.data.currentBalance).toBe(14000);

    const revert = await request(app)
      .patch(`/api/v1/finance/transactions/${pending.body.data.id}/status`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "PENDING" });
    expect(revert.status).toBe(409);

    const toCancel = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: category.body.data.id,
        amount: 500,
        status: "PENDING",
      });
    const cancelled = await request(app)
      .patch(`/api/v1/finance/transactions/${toCancel.body.data.id}/status`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "CANCELLED" });
    expect(cancelled.status).toBe(200);

    const resurrect = await request(app)
      .patch(`/api/v1/finance/transactions/${toCancel.body.data.id}/status`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "COMPLETED" });
    expect(resurrect.status).toBe(409);

    const unchanged = await request(app)
      .get(`/api/v1/finance/accounts/${account.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(unchanged.body.data.currentBalance).toBe(14000);
  });

  it("lists and hydrates transactions with filters and blocks unauthorized access", async () => {
    const ctx = await seed();
    const account = await createAccount(ctx.admin.accessToken, { openingBalance: 1000000 });
    const income = await createCategory(ctx.admin.accessToken);
    const expense = await createCategory(ctx.admin.accessToken, { name: "Travel", code: "5100", type: "EXPENSE" });

    await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: income.body.data.id,
        amount: 5000,
        projectId: String(ctx.project._id),
        transactionDate: "2026-01-15T06:00:00.000Z",
      });
    await request(app)
      .post("/api/v1/finance/transactions/expense")
      .set(auth(ctx.admin.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: expense.body.data.id,
        amount: 2000,
        projectId: String(ctx.project._id),
        transactionDate: "2026-02-15T06:00:00.000Z",
        paymentMethod: "UPI",
      });

    const list = await request(app)
      .get(
        `/api/v1/finance/transactions?type=EXPENSE&status=COMPLETED&projectId=${String(ctx.project._id)}&from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z&sortBy=transactionDate&sortOrder=desc`,
      )
      .set(auth(ctx.admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].category.name).toBe("Travel");

    const details = await request(app)
      .get(`/api/v1/finance/transactions/${list.body.data[0].id}`)
      .set(auth(ctx.admin.accessToken));
    expect(details.status).toBe(200);
    expect(details.body.data.project.projectId).toBe(ctx.project.projectId);
    expect(details.body.data.account.accountId).toBeDefined();

    const employeePost = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.raj.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: income.body.data.id,
        amount: 1000,
        projectId: String(ctx.project._id),
      });
    expect(employeePost.status).toBe(403);

    const managerCompany = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.manager.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: income.body.data.id,
        amount: 1000,
      });
    expect(managerCompany.status).toBe(403);

    const managerProject = await request(app)
      .post("/api/v1/finance/transactions/income")
      .set(auth(ctx.manager.accessToken))
      .send({
        accountId: account.body.data.id,
        categoryId: income.body.data.id,
        amount: 1000,
        projectId: String(ctx.project._id),
      });
    expect(managerProject.status).toBe(201);

    const outsider = await request(app)
      .get(`/api/v1/finance/transactions/${list.body.data[0].id}`)
      .set(auth(ctx.out.accessToken));
    expect(outsider.status).toBe(403);
  });
});

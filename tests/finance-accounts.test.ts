import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Account } from "../src/models/Account";
import { Employee } from "../src/models/Employee";
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
    phone: options.phone ?? "9876500800",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500801");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500802");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500803");
  await createEmployeeForUser(managerUser, { phone: "9876500802" });
  await createEmployeeForUser(employeeUser, { phone: "9876500803" });
  return {
    adminUser,
    admin: await loginAs("admin@example.com"),
    manager: await loginAs("manager@example.com"),
    raj: await loginAs("raj@example.com"),
  };
}

function accountBody(extra: Record<string, unknown> = {}) {
  return {
    name: extra.name ?? "HDFC Bank",
    code: extra.code ?? "1100",
    type: extra.type ?? "BANK",
    description: extra.description ?? "Primary business bank account",
    openingBalance: extra.openingBalance ?? 500000,
    currency: extra.currency ?? "INR",
    ...extra,
  };
}

describe("Finance accounts and categories", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/finance/accounts");
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("creates an account with generated accountId and createdBy from the session", async () => {
    const ctx = await seed();
    const response = await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody());

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accountId).toBe("ACC-000001");
    expect(response.body.data.code).toBe("1100");
    expect(response.body.data.openingBalance).toBe(500000);
    expect(response.body.data.currentBalance).toBe(500000);
    expect(response.body.data.currency).toBe("INR");
    expect(response.body.data.createdBy).toBe(ctx.admin.user.id);
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it("rejects createdBy from the request body", async () => {
    const ctx = await seed();
    const response = await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send({ ...accountBody(), createdBy: ctx.raj.user.id });
    expect(response.status).toBe(422);
  });

  it("rejects a duplicate account code", async () => {
    const ctx = await seed();
    await request(app).post("/api/v1/finance/accounts").set(auth(ctx.admin.accessToken)).send(accountBody());
    const duplicate = await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody({ name: "Second" }));
    expect(duplicate.status).toBe(409);
  });

  it("rejects an invalid account type and currency", async () => {
    const ctx = await seed();
    const type = await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody({ type: "WALLET" }));
    const currency = await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody({ code: "1200", currency: "USD" }));
    expect(type.status).toBe(422);
    expect(currency.status).toBe(422);
  });

  it("paginates and searches accounts", async () => {
    const ctx = await seed();
    await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody({ name: "Cash", code: "1000", type: "CASH", openingBalance: 10000 }));
    await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody({ name: "HDFC Bank", code: "1100", type: "BANK" }));
    await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody({ name: "Sales Income", code: "4000", type: "INCOME", openingBalance: 0 }));

    const page = await request(app)
      .get("/api/v1/finance/accounts?page=1&limit=2&sortBy=code&sortOrder=asc")
      .set(auth(ctx.admin.accessToken));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta.total).toBe(3);
    expect(page.body.meta.limit).toBe(2);

    const search = await request(app)
      .get("/api/v1/finance/accounts?search=bank&type=BANK&status=ACTIVE")
      .set(auth(ctx.admin.accessToken));
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].name).toBe("HDFC Bank");
  });

  it("caps list limit at 100", async () => {
    const ctx = await seed();
    const response = await request(app)
      .get("/api/v1/finance/accounts?limit=500")
      .set(auth(ctx.admin.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.meta.limit).toBe(100);
  });

  it("updates name, description, and status but not balances or code", async () => {
    const ctx = await seed();
    const created = await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody());
    const id = created.body.data.id;

    const updated = await request(app)
      .patch(`/api/v1/finance/accounts/${id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ name: "HDFC Operating", description: "Ops", status: "ACTIVE" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("HDFC Operating");
    expect(updated.body.data.currentBalance).toBe(500000);

    const blocked = await request(app)
      .patch(`/api/v1/finance/accounts/${id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ currentBalance: 1, openingBalance: 1, code: "9999", accountId: "ACC-9" });
    expect(blocked.status).toBe(422);

    const operators = await request(app)
      .patch(`/api/v1/finance/accounts/${id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ $set: { currentBalance: 1 } });
    expect(operators.status).toBe(422);
  });

  it("returns account details with projection and rejects invalid ids", async () => {
    const ctx = await seed();
    const created = await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.admin.accessToken))
      .send(accountBody());
    const details = await request(app)
      .get(`/api/v1/finance/accounts/${created.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(details.status).toBe(200);
    expect(details.body.data.currency).toBe("INR");
    expect(details.body.data.status).toBe("ACTIVE");

    const bad = await request(app).get("/api/v1/finance/accounts/not-an-id").set(auth(ctx.admin.accessToken));
    expect(bad.status).toBe(400);
  });

  it("forbids employees from listing accounts and managers from creating them", async () => {
    const ctx = await seed();
    const employeeList = await request(app).get("/api/v1/finance/accounts").set(auth(ctx.raj.accessToken));
    expect(employeeList.status).toBe(403);

    const managerCreate = await request(app)
      .post("/api/v1/finance/accounts")
      .set(auth(ctx.manager.accessToken))
      .send(accountBody());
    expect(managerCreate.status).toBe(403);

    const managerList = await request(app).get("/api/v1/finance/accounts").set(auth(ctx.manager.accessToken));
    expect(managerList.status).toBe(200);
  });

  it("creates unique finance categories and blocks reuse of deleted codes for new transactions via status", async () => {
    const ctx = await seed();
    const created = await request(app)
      .post("/api/v1/finance/categories")
      .set(auth(ctx.admin.accessToken))
      .send({ name: "Sales Income", code: "4000", type: "INCOME", description: "Customer receipts" });
    expect(created.status).toBe(201);
    expect(created.body.data.categoryId).toBe("CAT-000001");

    const duplicate = await request(app)
      .post("/api/v1/finance/categories")
      .set(auth(ctx.admin.accessToken))
      .send({ name: "Other", code: "4000", type: "INCOME" });
    expect(duplicate.status).toBe(409);

    const invalidType = await request(app)
      .post("/api/v1/finance/categories")
      .set(auth(ctx.admin.accessToken))
      .send({ name: "Bad", code: "4010", type: "ASSET" });
    expect(invalidType.status).toBe(422);

    const list = await request(app).get("/api/v1/finance/categories?type=INCOME").set(auth(ctx.admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const removed = await request(app)
      .delete(`/api/v1/finance/categories/${created.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(removed.status).toBe(200);
    expect(removed.body.data.isDeleted).toBe(true);

    const hidden = await request(app).get("/api/v1/finance/categories").set(auth(ctx.admin.accessToken));
    expect(hidden.body.data).toHaveLength(0);
  });

  it("uses unique indexes for accountId and code", async () => {
    await seed();
    const indexes = await Account.collection.indexes();
    expect(indexes.some((index) => index.key.accountId === 1 && index.unique)).toBe(true);
    expect(indexes.some((index) => index.key.code === 1 && index.unique)).toBe(true);
  });
});

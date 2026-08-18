import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Customer } from "../src/models/Customer";
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
    phone: options.phone ?? "9876500400",
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
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500402");
  await createUser("ADMIN", "admin@example.com", "9876500401");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500403");

  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500402" });
  const rajEmp = await createEmployeeForUser(employeeUser, {
    phone: "9876500403",
    managerId: String(managerEmp._id),
  });

  return {
    managerEmp,
    rajEmp,
    admin: await loginAs("admin@example.com"),
    manager: await loginAs("manager@example.com"),
    raj: await loginAs("raj@example.com"),
  };
}

function customerBody(extra: Record<string, unknown> = {}) {
  return {
    name: "ABC Industries",
    companyName: extra.companyName ?? "ABC Industries Pvt Ltd",
    email: extra.email ?? "contact@abc.com",
    phone: extra.phone ?? "9876543210",
    industry: "Manufacturing",
    location: "Chennai",
    status: "ACTIVE",
    ...extra,
  };
}

async function createCustomer(token: string, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/customers").set(auth(token)).send(customerBody(extra));
}

describe("Customer APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
    await Customer.syncIndexes();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("creates a customer with generated id", async () => {
    const ctx = await seed();
    const response = await createCustomer(ctx.admin.accessToken, { assignedTo: String(ctx.rajEmp._id) });
    expect(response.status).toBe(201);
    expect(response.body.data.customerId).toBe("CUST-000001");
    expect(response.body.data.status).toBe("ACTIVE");
    expect(response.body.data.createdBy.id).toBe(ctx.admin.user.id);
    expect(response.body.data.assignedTo.id).toBe(String(ctx.rajEmp._id));
  });

  it("rejects validation errors, operators, and employee creates", async () => {
    const ctx = await seed();
    const invalid = await createCustomer(ctx.admin.accessToken, { email: "bad", phone: "123" });
    expect(invalid.status).toBe(422);

    const created = await createCustomer(ctx.admin.accessToken, { email: "op@abc.com", phone: "9876543211" });
    const operators = await request(app)
      .patch(`/api/v1/customers/${created.body.data.id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ $set: { name: "hack" } });
    expect(operators.status).toBe(422);

    const employee = await createCustomer(ctx.raj.accessToken);
    expect(employee.status).toBe(403);

    const createdBy = await request(app).post("/api/v1/customers").set(auth(ctx.admin.accessToken)).send({
      ...customerBody({ email: "cb@abc.com", phone: "9876543212" }),
      createdBy: ctx.raj.user.id,
    });
    expect(createdBy.status).toBe(422);
  });

  it("prevents duplicate email, phone, or company", async () => {
    const ctx = await seed();
    const first = await createCustomer(ctx.admin.accessToken);
    expect(first.status).toBe(201);

    const emailDup = await createCustomer(ctx.admin.accessToken, {
      companyName: "Other Co",
      phone: "9876543290",
    });
    expect(emailDup.status).toBe(409);

    const companyDup = await createCustomer(ctx.admin.accessToken, {
      email: "unique@abc.com",
      phone: "9876543291",
    });
    expect(companyDup.status).toBe(409);
  });

  it("supports search, pagination, assignment, status, and update", async () => {
    const ctx = await seed();
    const created = await createCustomer(ctx.admin.accessToken, { assignedTo: String(ctx.rajEmp._id) });
    await createCustomer(ctx.admin.accessToken, {
      name: "XYZ",
      companyName: "XYZ Ltd",
      email: "xyz@xyz.com",
      phone: "9876543220",
      location: "Madurai",
    });

    const search = await request(app).get("/api/v1/customers?search=ABC").set(auth(ctx.admin.accessToken));
    expect(search.body.data).toHaveLength(1);

    const paged = await request(app).get("/api/v1/customers?page=1&limit=1").set(auth(ctx.admin.accessToken));
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBe(2);

    const status = await request(app)
      .patch(`/api/v1/customers/${created.body.data.id}/status`)
      .set(auth(ctx.admin.accessToken))
      .send({ status: "BLOCKED" });
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe("BLOCKED");

    const updated = await request(app)
      .patch(`/api/v1/customers/${created.body.data.id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ location: "Coimbatore", notes: "Key account" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.location).toBe("Coimbatore");

    const blockedId = await request(app)
      .patch(`/api/v1/customers/${created.body.data.id}`)
      .set(auth(ctx.admin.accessToken))
      .send({ customerId: "CUST-999999", createdBy: ctx.raj.user.id });
    expect(blockedId.status).toBe(422);
  });

  it("soft-deletes customers and hides them", async () => {
    const ctx = await seed();
    const created = await createCustomer(ctx.admin.accessToken);
    const removed = await request(app)
      .delete(`/api/v1/customers/${created.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(removed.status).toBe(200);

    const list = await request(app).get("/api/v1/customers").set(auth(ctx.admin.accessToken));
    expect(list.body.data).toHaveLength(0);

    const get = await request(app)
      .get(`/api/v1/customers/${created.body.data.id}`)
      .set(auth(ctx.admin.accessToken));
    expect(get.status).toBe(404);
  });

  it("requires authentication", async () => {
    const unauth = await request(app).get("/api/v1/customers");
    expect(unauth.status).toBe(401);
  });
});

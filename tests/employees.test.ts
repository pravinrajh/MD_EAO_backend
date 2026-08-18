import bcrypt from "bcrypt";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { clearCollections, setupTestDb, teardownTestDb } from "./helpers";

const app = createApp();

async function createPrivilegedUser(role: Role, email: string) {
  return User.create({
    name: `${role} User`,
    email,
    phone: "9876543299",
    passwordHash: await bcrypt.hash("SecurePassword123", 4),
    role,
    status: "ACTIVE",
    isActive: true,
  });
}

async function loginAs(email: string, password = "SecurePassword123") {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  return response.body.data as {
    accessToken: string;
    user: { id: string; role: string };
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createAccountUser(email: string, phone: string) {
  return User.create({
    name: email.split("@")[0],
    email,
    phone,
    passwordHash: await bcrypt.hash("SecurePassword123", 4),
    role: "EMPLOYEE",
    status: "ACTIVE",
    isActive: true,
  });
}

describe("Employee management APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("creates an employee with a unique employee code", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");

    const response = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      displayName: "Raj Kumar",
      phone: "9876543210",
      department: "Engineering",
      designation: "Project Manager",
      joiningDate: "2026-08-18",
      employmentType: "FULL_TIME",
      location: "Chennai",
      status: "ACTIVE",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.employeeCode).toBe("EMP-000001");
    expect(response.body.data.user.email).toBe("raj@example.com");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
  });

  it("requires the linked user to exist", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    const response = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: new mongoose.Types.ObjectId().toString(),
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
    });

    expect(response.status).toBe(404);
  });

  it("rejects linking the same user to two employees", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");

    const payload = {
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
    };

    const first = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send(payload);
    expect(second.status).toBe(409);
  });

  it("assigns unique employee codes", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const firstUser = await createAccountUser("one@example.com", "9876543210");
    const secondUser = await createAccountUser("two@example.com", "9876543211");

    const first = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(firstUser._id),
      firstName: "One",
      lastName: "Employee",
      employmentType: "FULL_TIME",
    });
    const second = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(secondUser._id),
      firstName: "Two",
      lastName: "Employee",
      employmentType: "FULL_TIME",
    });

    expect(first.body.data.employeeCode).toBe("EMP-000001");
    expect(second.body.data.employeeCode).toBe("EMP-000002");
    expect(first.body.data.employeeCode).not.toBe(second.body.data.employeeCode);
  });

  it("gets an employee with related user data", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");
    const created = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
    });

    const response = await request(app)
      .get(`/api/v1/employees/${created.body.data.id}`)
      .set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.firstName).toBe("Raj");
    expect(response.body.data.user.email).toBe("raj@example.com");
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  it("updates an employee", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");
    const created = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      department: "Engineering",
      employmentType: "FULL_TIME",
    });

    const response = await request(app)
      .patch(`/api/v1/employees/${created.body.data.id}`)
      .set(auth(admin.accessToken))
      .send({ designation: "Tech Lead", location: "Chennai" });

    expect(response.status).toBe(200);
    expect(response.body.data.designation).toBe("Tech Lead");
    expect(response.body.data.location).toBe("Chennai");
  });

  it("searches employees", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");
    await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
    });

    const response = await request(app)
      .get("/api/v1/employees?search=raj")
      .set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].firstName).toBe("Raj");
  });

  it("filters employees by department and employment type", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const engineering = await createAccountUser("eng@example.com", "9876543210");
    const sales = await createAccountUser("sales@example.com", "9876543211");

    await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(engineering._id),
      firstName: "Eng",
      lastName: "One",
      department: "Engineering",
      employmentType: "FULL_TIME",
    });
    await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(sales._id),
      firstName: "Sales",
      lastName: "One",
      department: "Sales",
      employmentType: "CONTRACT",
    });

    const response = await request(app)
      .get("/api/v1/employees?department=Engineering&employmentType=FULL_TIME")
      .set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].department).toBe("Engineering");
  });

  it("paginates employees", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    for (let i = 0; i < 3; i += 1) {
      const user = await createAccountUser(`emp${i}@example.com`, `987654321${i}`);
      await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
        userId: String(user._id),
        firstName: `Emp${i}`,
        lastName: "Test",
        employmentType: "FULL_TIME",
      });
    }

    const response = await request(app).get("/api/v1/employees?page=1&limit=2").set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it("validates that a manager exists", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");

    const response = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
      managerId: new mongoose.Types.ObjectId().toString(),
    });

    expect(response.status).toBe(400);
  });

  it("prevents an employee from becoming their own manager", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");
    const created = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
    });

    const response = await request(app)
      .patch(`/api/v1/employees/${created.body.data.id}`)
      .set(auth(admin.accessToken))
      .send({ managerId: created.body.data.id });

    expect(response.status).toBe(400);
  });

  it("changes employee status", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");
    const created = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
    });

    const response = await request(app)
      .patch(`/api/v1/employees/${created.body.data.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "ON_LEAVE" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ON_LEAVE");
  });

  it("keeps a terminated employee stored", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const user = await createAccountUser("raj@example.com", "9876543210");
    const created = await request(app).post("/api/v1/employees").set(auth(admin.accessToken)).send({
      userId: String(user._id),
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
    });

    await request(app)
      .patch(`/api/v1/employees/${created.body.data.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "TERMINATED" });

    const stored = await Employee.findById(created.body.data.id).lean();
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("TERMINATED");

    const fetched = await request(app)
      .get(`/api/v1/employees/${created.body.data.id}`)
      .set(auth(admin.accessToken));

    expect(fetched.status).toBe(200);
    expect(fetched.body.data.status).toBe("TERMINATED");
  });

  it("rejects unauthorized employee management", async () => {
    await request(app).post("/api/v1/auth/register").send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
    });
    const employee = await loginAs("raj@example.com");

    const response = await request(app).get("/api/v1/employees").set(auth(employee.accessToken));
    expect(response.status).toBe(403);

    const create = await request(app).post("/api/v1/employees").set(auth(employee.accessToken)).send({
      userId: employee.user.id,
      firstName: "Raj",
      lastName: "Kumar",
      employmentType: "FULL_TIME",
    });
    expect(create.status).toBe(403);
  });
});

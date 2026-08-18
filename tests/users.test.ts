import bcrypt from "bcrypt";
import request from "supertest";
import { createApp } from "../src/app";
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
    refreshToken: string;
    user: { id: string; role: string };
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("User management APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("allows an admin to list users with pagination metadata", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    const response = await request(app).get("/api/v1/users?page=1&limit=20").set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Users fetched successfully");
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
  });

  it("rejects an unauthorized user with 401", async () => {
    const response = await request(app).get("/api/v1/users");
    expect(response.status).toBe(401);
  });

  it("rejects employee access to user management", async () => {
    await request(app).post("/api/v1/auth/register").send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
    });
    const employee = await loginAs("raj@example.com");

    const list = await request(app).get("/api/v1/users").set(auth(employee.accessToken));
    expect(list.status).toBe(403);

    const create = await request(app)
      .post("/api/v1/users")
      .set(auth(employee.accessToken))
      .send({
        name: "Other",
        email: "other@example.com",
        phone: "9876543211",
        password: "SecurePassword123",
        role: "ADMIN",
      });
    expect(create.status).toBe(403);
  });

  it("creates a user successfully without returning passwordHash", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    const response = await request(app)
      .post("/api/v1/users")
      .set(auth(admin.accessToken))
      .send({
        name: "Raj Kumar",
        email: "raj@example.com",
        phone: "9876543210",
        password: "SecurePassword123",
        role: "EMPLOYEE",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe("raj@example.com");
    expect(response.body.data.role).toBe("EMPLOYEE");
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
  });

  it("returns conflict for a duplicate email", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
      role: "EMPLOYEE",
    });

    const response = await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Two",
      email: "raj@example.com",
      phone: "9876543211",
      password: "SecurePassword123",
      role: "EMPLOYEE",
    });

    expect(response.status).toBe(409);
  });

  it("returns a validation error for an invalid email", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    const response = await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Kumar",
      email: "not-an-email",
      phone: "9876543210",
      password: "SecurePassword123",
      role: "EMPLOYEE",
    });

    expect(response.status).toBe(422);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.errors[0].field).toBe("email");
  });

  it("returns a validation error for a weak password", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    const response = await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "weak",
      role: "EMPLOYEE",
    });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
  });

  it("fetches a user by valid id", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const created = await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
      role: "EMPLOYEE",
    });

    const response = await request(app)
      .get(`/api/v1/users/${created.body.data.id}`)
      .set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe("raj@example.com");
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it("returns 400 for an invalid ObjectId", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    const response = await request(app).get("/api/v1/users/not-an-id").set(auth(admin.accessToken));
    expect(response.status).toBe(400);
  });

  it("returns 404 for a missing user", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    const response = await request(app)
      .get("/api/v1/users/64b7f1c2e1a2b3c4d5e6f7a8")
      .set(auth(admin.accessToken));

    expect(response.status).toBe(404);
  });

  it("updates allowed user fields", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const created = await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
      role: "EMPLOYEE",
    });

    const response = await request(app)
      .patch(`/api/v1/users/${created.body.data.id}`)
      .set(auth(admin.accessToken))
      .send({ name: "Raj K", phone: "9876543212" });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Raj K");
    expect(response.body.data.phone).toBe("9876543212");
  });

  it("prevents an employee from escalating their own role", async () => {
    await request(app).post("/api/v1/auth/register").send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
    });
    const employee = await loginAs("raj@example.com");

    const response = await request(app)
      .patch(`/api/v1/users/${employee.user.id}`)
      .set(auth(employee.accessToken))
      .send({ role: "ADMIN" });

    expect(response.status).toBe(403);
  });

  it("suspends a user", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const created = await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
      role: "EMPLOYEE",
    });

    const response = await request(app)
      .patch(`/api/v1/users/${created.body.data.id}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "SUSPENDED" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("SUSPENDED");
    expect(response.body.data.isActive).toBe(false);
  });

  it("deactivates a user with DELETE", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    const created = await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
      role: "EMPLOYEE",
    });

    const response = await request(app)
      .delete(`/api/v1/users/${created.body.data.id}`)
      .set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("User deactivated successfully");
    expect(response.body.data.status).toBe("INACTIVE");
    expect(response.body.data.isActive).toBe(false);
  });

  it("prevents an inactive user from authenticating", async () => {
    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");
    await request(app).post("/api/v1/users").set(auth(admin.accessToken)).send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
      role: "EMPLOYEE",
    });

    const listed = await request(app).get("/api/v1/users?search=raj").set(auth(admin.accessToken));
    const userId = listed.body.data.find((user: { email: string }) => user.email === "raj@example.com").id;

    await request(app)
      .patch(`/api/v1/users/${userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "INACTIVE" });

    const login = await request(app).post("/api/v1/auth/login").send({
      email: "raj@example.com",
      password: "SecurePassword123",
    });

    expect(login.status).toBe(401);
    expect(login.body.message).toBe("Account is not active");
  });
});

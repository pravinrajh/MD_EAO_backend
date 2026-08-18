import bcrypt from "bcrypt";
import request from "supertest";
import { createApp } from "../src/app";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { clearCollections, setupTestDb, teardownTestDb } from "./helpers";

const app = createApp();

const validUser = {
  name: "Raj Kumar",
  email: "raj@example.com",
  phone: "9876543210",
  password: "SecurePassword123",
};

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

describe("Authentication APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("registers a public user as EMPLOYEE without passwordHash", async () => {
    const response = await request(app).post("/api/v1/auth/register").send(validUser);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe("EMPLOYEE");
    expect(response.body.data.user.email).toBe("raj@example.com");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();
  });

  it("rejects duplicate email", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const response = await request(app).post("/api/v1/auth/register").send(validUser);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("rejects invalid email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validUser, email: "not-an-email" });

    expect(response.status).toBe(422);
    expect(response.body.message).toBe("Validation failed");
  });

  it("rejects a weak password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validUser, password: "weak" });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
  });

  it("rejects public registration as MD or ADMIN", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validUser, role: "MD" });

    expect(response.status).toBe(422);
  });

  it("logs in with valid credentials", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "raj@example.com",
      password: "SecurePassword123",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("raj@example.com");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();
  });

  it("rejects a wrong password", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "raj@example.com",
      password: "WrongPassword123",
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("rejects login for a non-existent user", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "missing@example.com",
      password: "SecurePassword123",
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("rejects a protected endpoint without a token", async () => {
    const response = await request(app).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
  });

  it("rejects a protected endpoint with an invalid token", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not-a-real-token");

    expect(response.status).toBe(401);
  });

  it("allows a protected endpoint with a valid token", async () => {
    const registered = await request(app).post("/api/v1/auth/register").send(validUser);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${registered.body.data.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe("raj@example.com");
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it("enforces role authorization", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const employee = await loginAs("raj@example.com");

    const forbidden = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${employee.accessToken}`)
      .send({
        name: "Manager",
        email: "manager@example.com",
        phone: "9876543211",
        password: "SecurePassword123",
        role: "MANAGER",
      });

    expect(forbidden.status).toBe(403);

    await createPrivilegedUser("ADMIN", "admin@example.com");
    const admin = await loginAs("admin@example.com");

    const allowed = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        name: "Manager",
        email: "manager@example.com",
        phone: "9876543211",
        password: "SecurePassword123",
        role: "MANAGER",
      });

    expect(allowed.status).toBe(201);
    expect(allowed.body.data.role).toBe("MANAGER");
  });

  it("invalidates refresh tokens after logout", async () => {
    const registered = await request(app).post("/api/v1/auth/register").send(validUser);
    const { accessToken, refreshToken } = registered.body.data;

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(logout.status).toBe(200);

    const refreshed = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(refreshed.status).toBe(401);
  });
});

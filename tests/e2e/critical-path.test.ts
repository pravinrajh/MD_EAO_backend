import request from "supertest";
import { createApp } from "../../src/app";
import { Employee } from "../../src/models/Employee";
import { Task } from "../../src/models/Task";
import { nextEmployeeCode } from "../../src/utils/sequence";
import { authHeader, clearCollections, createTestUser, setupTestDb, teardownTestDb } from "../helpers";

const app = createApp();

describe("E2E critical path", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("registers, authenticates, creates work, and reads live dashboard plus assistant answers", async () => {
    const registered = await request(app).post("/api/v1/auth/register").send({
      name: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      password: "SecurePassword123",
    });
    expect(registered.status).toBe(201);
    expect(registered.body.data.user.passwordHash).toBeUndefined();

    const adminUser = await createTestUser("ADMIN", "admin@example.com", "9876500401");
    const emp = await Employee.create({
      employeeId: "emp-e2e",
      userId: registered.body.data.user.id,
      employeeCode: await nextEmployeeCode(),
      firstName: "Raj",
      lastName: "Kumar",
      displayName: "Raj Kumar",
      email: "raj@example.com",
      phone: "9876543210",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
    });

    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "SecurePassword123" });
    expect(adminLogin.status).toBe(200);
    const token = adminLogin.body.data.accessToken as string;

    const task = await request(app)
      .post("/api/v1/tasks")
      .set(authHeader(token))
      .send({
        title: "Call ABC tomorrow",
        assignedTo: String(emp._id),
        priority: "HIGH",
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    expect(task.status).toBe(201);

    const listed = await request(app).get("/api/v1/tasks").set(authHeader(token));
    expect(listed.body.meta.total).toBeGreaterThanOrEqual(1);

    const dashboard = await request(app).get("/api/v1/dashboard").set(authHeader(token));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data).toBeTruthy();

    const pending = await request(app)
      .post("/api/v1/assistant/query")
      .set(authHeader(token))
      .send({ message: "What tasks are pending?" });
    expect(pending.status).toBe(200);
    expect(pending.body.data.intent).toBe("PENDING_TASKS");
    expect(pending.body.data.data.count).toBeGreaterThanOrEqual(1);

    const action = await request(app)
      .post("/api/v1/assistant/action")
      .set(authHeader(token))
      .send({ message: "Create a reminder to follow up ABC tomorrow" });
    expect(action.status).toBe(200);
    expect(["COMPLETED", "REQUIRES_CONFIRMATION", "CLARIFICATION_REQUIRED"]).toContain(action.body.data.status);

    expect(await Task.countDocuments({ title: "Call ABC tomorrow" })).toBe(1);
    expect(adminUser.role).toBe("ADMIN");
  });
});

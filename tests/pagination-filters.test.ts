import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Notification } from "../src/models/Notification";
import { Task } from "../src/models/Task";
import { PAGINATION } from "../src/utils/constants";
import { nextEmployeeCode, nextNotificationId } from "../src/utils/sequence";
import { getZonedDayRange } from "../src/utils/timezone";
import { authHeader, clearCollections, createTestUser, setupTestDb, teardownTestDb } from "./helpers";

const app = createApp();

async function login(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "SecurePassword123",
  });
  return response.body.data as { accessToken: string; user: { id: string } };
}

describe("Pagination, filters, dates, and unread counts", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  async function seedTasks() {
    const adminUser = await createTestUser("ADMIN", "admin@example.com", "9876500201");
    const employeeUser = await createTestUser("EMPLOYEE", "raj@example.com", "9876500202");
    const emp = await Employee.create({
      employeeId: "emp-page",
      userId: employeeUser._id,
      employeeCode: await nextEmployeeCode(),
      firstName: "Raj",
      lastName: "Kumar",
      displayName: "Raj Kumar",
      email: employeeUser.email,
      phone: "9876500202",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
    });
    const admin = await login("admin@example.com");
    const day = getZonedDayRange(new Date(), "Asia/Kolkata");
    await Task.create(
      Array.from({ length: 25 }, (_, index) => ({
        taskId: `TASK-P${String(index + 1).padStart(6, "0")}`,
        title: `Paged task ${index + 1}`,
        assignedTo: emp._id,
        createdBy: adminUser._id,
        priority: index % 2 === 0 ? "HIGH" : "LOW",
        status: index < 5 ? "COMPLETED" : "PENDING",
        dueDate: new Date(day.start.getTime() + index * 60 * 60 * 1000),
      })),
    );
    return { admin, emp };
  }

  it("pages task lists and caps limit at the maximum", async () => {
    const ctx = await seedTasks();
    const page1 = await request(app)
      .get("/api/v1/tasks")
      .query({ page: 1, limit: 10, sortBy: "taskId", sortOrder: "asc" })
      .set(authHeader(ctx.admin.accessToken));
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(10);
    expect(page1.body.meta).toMatchObject({ page: 1, limit: 10, total: 25, hasNextPage: true });

    const page2 = await request(app)
      .get("/api/v1/tasks")
      .query({ page: 2, limit: 10, sortBy: "taskId", sortOrder: "asc" })
      .set(authHeader(ctx.admin.accessToken));
    expect(page2.body.data).toHaveLength(10);
    expect(page2.body.meta.page).toBe(2);
    const page1Ids = new Set(page1.body.data.map((item: { id: string }) => item.id));
    expect(page2.body.data.every((item: { id: string }) => !page1Ids.has(item.id))).toBe(true);

    const capped = await request(app)
      .get("/api/v1/tasks")
      .query({ page: 1, limit: 1000 })
      .set(authHeader(ctx.admin.accessToken));
    expect(capped.status).toBe(200);
    expect(capped.body.meta.limit).toBeLessThanOrEqual(PAGINATION.maxLimit);
    expect(capped.body.data.length).toBeLessThanOrEqual(PAGINATION.maxLimit);
    expect(capped.body.data.length).toBeLessThan(25 + 1);
  });

  it("rejects non-positive page and limit values", async () => {
    const ctx = await seedTasks();
    const page = await request(app)
      .get("/api/v1/tasks")
      .query({ page: 0, limit: 10 })
      .set(authHeader(ctx.admin.accessToken));
    expect(page.status).toBe(422);

    const limit = await request(app)
      .get("/api/v1/tasks")
      .query({ page: 1, limit: 0 })
      .set(authHeader(ctx.admin.accessToken));
    expect(limit.status).toBe(422);
  });

  it("applies status and priority filters to the MongoDB result set", async () => {
    const ctx = await seedTasks();
    const pending = await request(app)
      .get("/api/v1/tasks")
      .query({ status: "PENDING", limit: 100 })
      .set(authHeader(ctx.admin.accessToken));
    expect(pending.body.data.every((item: { status: string }) => item.status === "PENDING")).toBe(true);
    expect(pending.body.meta.total).toBe(20);

    const high = await request(app)
      .get("/api/v1/tasks")
      .query({ priority: "HIGH", limit: 100 })
      .set(authHeader(ctx.admin.accessToken));
    expect(high.body.data.every((item: { priority: string }) => item.priority === "HIGH")).toBe(true);
    expect(high.body.meta.total).toBeGreaterThan(0);
    expect(high.body.meta.total).toBeLessThan(25);
  });

  it("filters due dates using Asia/Kolkata day bounds", async () => {
    const ctx = await seedTasks();
    const day = getZonedDayRange(new Date(), "Asia/Kolkata");
    const ranged = await request(app)
      .get("/api/v1/tasks")
      .query({ dueFrom: day.start.toISOString(), dueTo: day.end.toISOString(), limit: 100 })
      .set(authHeader(ctx.admin.accessToken));
    expect(ranged.status).toBe(200);
    expect(ranged.body.meta.total).toBeGreaterThan(0);
    for (const item of ranged.body.data as Array<{ dueDate: string }>) {
      const due = new Date(item.dueDate).getTime();
      expect(due).toBeGreaterThanOrEqual(day.start.getTime());
      expect(due).toBeLessThanOrEqual(day.end.getTime());
    }
  });

  it("returns an exact unread count for 100 notifications without leaking other users", async () => {
    const adminUser = await createTestUser("ADMIN", "admin@example.com", "9876500201");
    const otherUser = await createTestUser("EMPLOYEE", "other@example.com", "9876500209");
    const admin = await login("admin@example.com");
    await Notification.insertMany(
      Array.from({ length: 100 }, (_, index) => ({
        notificationId: `NOTIF-U${String(index + 1).padStart(6, "0")}`,
        recipientId: adminUser._id,
        type: "SYSTEM_ALERT",
        category: "system",
        title: `N ${index + 1}`,
        message: "Unread",
        priority: "NORMAL",
        isRead: false,
        status: "SENT",
      })),
    );
    await Notification.create({
      notificationId: await nextNotificationId(),
      recipientId: otherUser._id,
      type: "SYSTEM_ALERT",
      category: "system",
      title: "Other",
      message: "Other",
      priority: "NORMAL",
      isRead: false,
      status: "SENT",
    });

    const count = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set(authHeader(admin.accessToken));
    expect(count.status).toBe(200);
    expect(count.body.data.count).toBe(100);

    const page = await request(app)
      .get("/api/v1/notifications")
      .query({ page: 1, limit: 20 })
      .set(authHeader(admin.accessToken));
    expect(page.body.data).toHaveLength(20);
    expect(page.body.meta.total).toBe(100);
  });
});

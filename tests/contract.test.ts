import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { nextEmployeeCode } from "../src/utils/sequence";
import { authHeader, clearCollections, createTestUser, setupTestDb, teardownTestDb } from "./helpers";

const app = createApp();

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  nullable?: boolean;
  $ref?: string;
};

function assertMatchesSchema(name: string, schema: JsonSchema | undefined, data: Record<string, unknown>) {
  expect(schema).toBeDefined();
  const properties = schema!.properties ?? {};
  for (const key of Object.keys(properties)) {
    if (!(key in data) || data[key] === undefined) continue;
    const declared = properties[key];
    const value = data[key];
    if (value === null) continue;
    if (typeof value === "object") continue;
    if (declared.type === "string" || declared.$ref) expect(typeof value).toBe("string");
    if (declared.type === "boolean") expect(typeof value).toBe("boolean");
    if (declared.type === "number" || declared.type === "integer") expect(typeof value).toBe("number");
    if (declared.type === "array") expect(Array.isArray(value)).toBe(true);
  }
  if (properties.id) expect(data.id).toBeDefined();
  expect(data).not.toHaveProperty("passwordHash");
  expect(JSON.stringify(data)).not.toMatch(/JWT_SECRET/);
}

describe("OpenAPI contract vs live responses", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("returns Task, Project, Meeting, Dashboard, Assistant, Reminder, and Notification shapes from the spec", async () => {
    const specResponse = await request(app).get("/api-docs.json");
    expect(specResponse.status).toBe(200);
    const schemas = specResponse.body.components.schemas as Record<string, JsonSchema>;

    const adminUser = await createTestUser("ADMIN", "admin@example.com", "9876500301");
    const employeeUser = await createTestUser("EMPLOYEE", "raj@example.com", "9876500302");
    const emp = await Employee.create({
      employeeId: "emp-contract",
      userId: employeeUser._id,
      employeeCode: await nextEmployeeCode(),
      firstName: "Raj",
      lastName: "Kumar",
      displayName: "Raj Kumar",
      email: employeeUser.email,
      phone: "9876500302",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "SecurePassword123" });
    const token = login.body.data.accessToken as string;
    const headers = authHeader(token);

    const task = await request(app).post("/api/v1/tasks").set(headers).send({
      title: "Contract task",
      assignedTo: String(emp._id),
      priority: "HIGH",
    });
    expect(task.status).toBe(201);
    expect(task.body.success).toBe(true);
    assertMatchesSchema("Task", schemas.Task, task.body.data);

    const project = await request(app).post("/api/v1/projects").set(headers).send({
      name: "Contract Project",
      projectType: "OTHER",
      managerId: String(emp._id),
      budget: 100000,
    });
    expect(project.status).toBe(201);
    assertMatchesSchema("Project", schemas.Project, project.body.data);

    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const meeting = await request(app)
      .post("/api/v1/meetings")
      .set(headers)
      .send({
        title: "Contract meeting",
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
        timezone: "Asia/Kolkata",
        meetingType: "INTERNAL",
        participants: [String(emp._id)],
      });
    expect(meeting.status).toBe(201);
    assertMatchesSchema("Meeting", schemas.Meeting, meeting.body.data);
    expect(typeof meeting.body.data.timezone).toBe("string");

    const reminder = await request(app)
      .post("/api/v1/reminders")
      .set(headers)
      .send({
        title: "Contract reminder",
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        timezone: "Asia/Kolkata",
      });
    expect(reminder.status).toBe(201);
    assertMatchesSchema("Reminder", schemas.Reminder, reminder.body.data);

    const dashboard = await request(app).get("/api/v1/dashboard/md").set(headers);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.success).toBe(true);
    expect(dashboard.body.data).toBeTruthy();
    expect(typeof dashboard.body.data).toBe("object");

    const query = await request(app)
      .post("/api/v1/assistant/query")
      .set(headers)
      .send({ message: "What tasks are pending?" });
    expect(query.status).toBe(200);
    assertMatchesSchema("AssistantQueryResponse", schemas.AssistantQueryResponse, query.body.data);
    expect(query.body.data).toMatchObject({
      intent: expect.any(String),
      answer: expect.any(String),
      confidence: expect.any(Number),
    });
    expect(Array.isArray(query.body.data.sources)).toBe(true);

    const action = await request(app)
      .post("/api/v1/assistant/action")
      .set(headers)
      .send({ message: "Create a task to call Contract Co tomorrow" });
    expect(action.status).toBe(200);
    assertMatchesSchema("AssistantActionResponse", schemas.AssistantActionResponse, action.body.data);

    const notifications = await request(app).get("/api/v1/notifications").set(headers);
    expect(notifications.status).toBe(200);
    if (notifications.body.data.length > 0) {
      assertMatchesSchema("Notification", schemas.Notification, notifications.body.data[0]);
    }

    expect(adminUser.email).toBe("admin@example.com");
    expect(employeeUser.email).toBe("raj@example.com");
  });
});

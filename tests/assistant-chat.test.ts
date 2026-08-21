import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Project } from "../src/models/Project";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import { setLlmProviderForTests } from "../src/services/assistant/gemini.provider";
import type { Role } from "../src/utils/constants";
import { nextEmployeeCode, nextProjectId, nextTaskId } from "../src/utils/sequence";
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

async function loginAs(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "SecurePassword123",
  });
  return response.body.data as { accessToken: string };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Assistant chat API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    setLlmProviderForTests(null);
  });

  it("requires authentication", async () => {
    const response = await request(app).post("/api/v1/assistant/chat").send({ message: "Hello" });
    expect(response.status).toBe(401);
  });

  it("answers a query and an action through one chatbot endpoint", async () => {
    const adminUser = await createUser("ADMIN", "admin-chat@example.com", "9876500901");
    const empUser = await createUser("EMPLOYEE", "raj-chat@example.com", "9876500902");
    const employee = await Employee.create({
      employeeId: randomUUID(),
      userId: empUser._id,
      employeeCode: await nextEmployeeCode(),
      firstName: "Raj",
      lastName: "Iyer",
      displayName: "Raj Iyer",
      email: empUser.email,
      phone: "9876500902",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
    });
    await Project.create({
      projectId: await nextProjectId(),
      name: "Chennai Project",
      code: "CHN-CHAT-1",
      projectType: "INFRASTRUCTURE",
      managerId: employee._id,
      members: [employee._id],
      status: "ACTIVE",
      progress: 62,
      budget: 1000000,
      actualExpense: 100000,
      createdBy: adminUser._id,
    });
    await Task.create({
      taskId: await nextTaskId(),
      title: "Site check",
      assignedTo: employee._id,
      createdBy: adminUser._id,
      priority: "HIGH",
      status: "PENDING",
    });

    const session = await loginAs("admin-chat@example.com");
    const query = await request(app)
      .post("/api/v1/assistant/chat")
      .set(auth(session.accessToken))
      .send({ message: "What projects are going?", conversationId: "CHAT-TEST-1" });
    expect(query.status).toBe(200);
    expect(query.body.data.mode).toBe("QUERY");
    expect(query.body.data.conversationId).toBe("CHAT-TEST-1");
    expect(query.body.data.reply).toBeTruthy();
    expect(query.body.data.intent).not.toBe("UNSUPPORTED");
    expect(typeof query.body.data.geminiConnected).toBe("boolean");
    expect(JSON.stringify(query.body.data.data)).toMatch(/Chennai/i);

    const alias = await request(app)
      .post("/api/v1/ai/chat")
      .set(auth(session.accessToken))
      .send({ message: "What are my pending tasks?", conversationId: "CHAT-TEST-1" });
    expect(alias.status).toBe(200);
    expect(alias.body.data.mode).toBe("QUERY");
    expect(alias.body.data.reply).toMatch(/pending/i);

    const action = await request(app)
      .post("/api/v1/assistant/chat")
      .set(auth(session.accessToken))
      .send({
        message: "Create a task called Electrical Verification and assign it to Raj.",
        conversationId: "CHAT-TEST-1",
      });
    expect(action.status).toBe(200);
    expect(action.body.data.mode).toBe("ACTION");
    expect(action.body.data.intent).toBe("CREATE_TASK");
    expect(["COMPLETED", "REQUIRES_CONFIRMATION", "CLARIFICATION_REQUIRED"]).toContain(action.body.data.status);
    expect(action.body.data.reply).toBeTruthy();
  });

  it("replies friendly to a greeting instead of UNSUPPORTED", async () => {
    await createUser("ADMIN", "admin-hi@example.com", "9876500911");
    const session = await loginAs("admin-hi@example.com");
    const response = await request(app)
      .post("/api/v1/assistant/chat")
      .set(auth(session.accessToken))
      .send({ message: "hii", conversationId: "CHAT-HI-1" });
    expect(response.status).toBe(200);
    expect(response.body.data.intent).toBe("SMALLTALK");
    expect(response.body.data.status).toBe("SUCCESS");
    expect(response.body.data.reply).not.toMatch(/can't answer that yet/i);
    expect(response.body.data.reply).toMatch(/hi|hello|assistant|help|gemini/i);
    expect(typeof response.body.data.geminiConnected).toBe("boolean");
  });

  it("uses Gemini wording for greetings when the model is connected", async () => {
    await createUser("ADMIN", "admin-gemini-hi@example.com", "9876500912");
    const session = await loginAs("admin-gemini-hi@example.com");
    setLlmProviderForTests({
      isEnabled: () => true,
      async understand() {
        return null;
      },
      async summarize() {
        return null;
      },
      async chat() {
        return "Hello! I am your office assistant. Ask me about projects or tasks whenever you are ready.";
      },
    });
    const response = await request(app)
      .post("/api/v1/assistant/chat")
      .set(auth(session.accessToken))
      .send({ message: "hii" });
    expect(response.status).toBe(200);
    expect(response.body.data.intent).toBe("SMALLTALK");
    expect(response.body.data.geminiConnected).toBe(true);
    expect(response.body.data.data.geminiReplied).toBe(true);
    expect(response.body.data.reply).toMatch(/Hello! I am your office assistant/i);
  });

  it("answers an assigned-task question instead of treating it as ASSIGN_TASK", async () => {
    const adminUser = await createUser("ADMIN", "admin-meena@example.com", "9876500913");
    const empUser = await createUser("EMPLOYEE", "meena-chat@example.com", "9876500914");
    const employee = await Employee.create({
      employeeId: randomUUID(),
      userId: empUser._id,
      employeeCode: await nextEmployeeCode(),
      firstName: "Meena",
      lastName: "Krishnan",
      displayName: "Meena Krishnan",
      email: empUser.email,
      phone: "9876500914",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
    });
    await Task.create({
      taskId: await nextTaskId(),
      title: "Site inspection",
      assignedTo: employee._id,
      createdBy: adminUser._id,
      priority: "HIGH",
      status: "PENDING",
    });
    const session = await loginAs("admin-meena@example.com");
    const response = await request(app)
      .post("/api/v1/assistant/chat")
      .set(auth(session.accessToken))
      .send({ message: "MENNA KRSINAKU ENNA TASK ASSIGN TODAY?", conversationId: "CHAT-MEENA-1" });
    expect(response.status).toBe(200);
    expect(response.body.data.mode).toBe("QUERY");
    expect(response.body.data.intent).not.toBe("ASSIGN_TASK");
    expect(response.body.data.intent).not.toBe("UNSUPPORTED");
    expect(response.body.data.gemini).toBeDefined();
    expect(response.body.data.reply).not.toMatch(/can't answer that yet/i);
  });
});

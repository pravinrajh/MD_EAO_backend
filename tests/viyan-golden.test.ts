import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Employee } from "../src/models/Employee";
import { Meeting } from "../src/models/Meeting";
import { Project } from "../src/models/Project";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { nextEmployeeCode, nextMeetingId, nextProjectId, nextTaskId } from "../src/utils/sequence";
import { getZonedDayRange } from "../src/utils/timezone";
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

describe("Viyan golden Chief of Staff queries", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  async function seed() {
    const adminUser = await createUser("ADMIN", "md-golden@example.com", "9876500801");
    const sathishUser = await createUser("EMPLOYEE", "sathish-golden@example.com", "9876500802");
    const sathish = await Employee.create({
      employeeId: randomUUID(),
      userId: sathishUser._id,
      employeeCode: await nextEmployeeCode(),
      firstName: "Sathish",
      lastName: "Kumar",
      displayName: "Sathish Kumar",
      email: sathishUser.email,
      phone: "9876500802",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
      managerId: null,
    });
    const omr = await Project.create({
      projectId: await nextProjectId(),
      name: "OMR Commercial Project",
      code: "AN-OMR-GOLD",
      projectType: "COMMERCIAL",
      managerId: sathish._id,
      members: [sathish._id],
      status: "AT_RISK",
      progress: 42,
      budget: 80000000,
      actualExpense: 62000000,
      createdBy: adminUser._id,
    });
    const now = new Date();
    const day = getZonedDayRange(now, "Asia/Kolkata");
    await Task.create({
      taskId: await nextTaskId(),
      title: "Confirm OMR steel delivery",
      assignedTo: sathish._id,
      createdBy: adminUser._id,
      projectId: omr._id,
      priority: "HIGH",
      status: "PENDING",
      dueDate: new Date(day.end.getTime() - 1000),
    });
    await Task.create({
      taskId: await nextTaskId(),
      title: "Resolve material delay at OMR basement",
      assignedTo: sathish._id,
      createdBy: adminUser._id,
      projectId: omr._id,
      priority: "CRITICAL",
      status: "PENDING",
      dueDate: new Date(day.start.getTime() - 12 * 60 * 60 * 1000),
    });
    await Meeting.create({
      meetingId: await nextMeetingId(),
      title: "OMR site review",
      meetingType: "PROJECT_REVIEW",
      organizerId: adminUser._id,
      participants: [sathish._id],
      projectId: omr._id,
      location: "OMR site office",
      startTime: new Date(day.start.getTime() + 10 * 60 * 60 * 1000),
      endTime: new Date(day.start.getTime() + 11 * 60 * 60 * 1000),
      status: "SCHEDULED",
      createdBy: adminUser._id,
    });
    const session = await loginAs("md-golden@example.com");
    return { token: session.accessToken, sathish, omr };
  }

  async function ask(token: string, message: string, conversationId = "GOLD-1") {
    return request(app)
      .post("/api/v1/assistant/query")
      .set(auth(token))
      .send({ message, conversationId });
  }

  it("answers golden live-data questions using existing services", async () => {
    const { token } = await seed();

    const overall = await ask(token, "Give me today's overall business status.");
    expect(overall.status).toBe(200);
    expect(overall.body.data.intent).toBe("MORNING_REPORT");
    expect(overall.body.data.answer).not.toMatch(/MongoDB|aggregate/i);
    expect(overall.body.data.data.evaluation.status).toBe("PASS");

    const attention = await ask(token, "What needs my attention today?");
    expect(attention.body.data.intent).toBe("ATTENTION_ITEMS");
    expect(attention.body.data.answer).toMatch(/Bottom line/i);

    const status = await ask(token, "What is Sathish's status today?");
    expect(status.body.data.intent).toBe("EMPLOYEE_DAILY_STATUS");
    expect(status.body.data.answer).toMatch(/Sathish/i);
    expect(status.body.data.answer).not.toMatch(/attendance marked|leave balance/i);
    expect(status.body.data.data.unavailable).toEqual(expect.arrayContaining(["attendance", "leave"]));
    expect(status.body.data.data.evaluation.serviceCalled).toBe("get_employee_daily_status");

    const overdue = await ask(token, "Which tasks are overdue?");
    expect(overdue.body.data.intent).toBe("OVERDUE_TASKS");
    expect(overdue.body.data.data.count).toBeGreaterThan(0);

    const omr = await ask(token, "How is the OMR project doing?", "GOLD-OMR");
    expect(omr.body.data.intent).toBe("PROJECT_STATUS");
    expect(omr.body.data.answer).toMatch(/OMR/i);

    const why = await ask(token, "Why?", "GOLD-OMR");
    expect(why.body.data.intent).toBe("PROJECT_HEALTH");
    expect(why.body.data.answer).toMatch(/OMR|risk|overdue|progress/i);

    const who = await ask(token, "Who is responsible?", "GOLD-OMR");
    expect(who.body.data.intent).toBe("PROJECT_STATUS");
    expect(who.body.data.answer).toMatch(/Sathish/i);

    const pending = await ask(token, "What is pending?", "GOLD-OMR");
    expect(pending.body.data.intent).toBe("PENDING_TASKS");
    expect(pending.body.data.data.count).toBeGreaterThan(0);

    const cross = await ask(token, "Which projects have high expenses and overdue tasks?");
    expect(cross.body.data.intent).toBe("DELAYED_PROJECT_WORKLOAD");
    expect(JSON.stringify(cross.body.data.data)).toMatch(/OMR/i);

    const pipeline = await ask(token, "How is our sales pipeline?");
    expect(pipeline.body.data.intent).toBe("SALES_PIPELINE");

    const meetings = await ask(token, "What meetings does the MD have today?");
    expect(meetings.body.data.intent).toBe("TODAY_MEETINGS");
  });

  it("creates a task through the existing action service", async () => {
    const { token } = await seed();
    const response = await request(app)
      .post("/api/v1/assistant/action")
      .set(auth(token))
      .send({
        message: "Create a task for Sathish to follow up on the OMR project tomorrow.",
        conversationId: "GOLD-ACT",
      });
    expect(response.status).toBe(200);
    expect(response.body.data.intent).toBe("CREATE_TASK");
    expect(["COMPLETED", "CLARIFICATION_REQUIRED"]).toContain(response.body.data.status);
    if (response.body.data.status === "COMPLETED") {
      expect(response.body.data.message).toMatch(/created|task/i);
      expect(response.body.data.result).toBeTruthy();
    }
  });

  it("asks for clarification instead of guessing or hallucinating", async () => {
    const { token } = await seed();
    const missing = await ask(token, "What is Ramesh's status today?");
    expect(missing.body.data.intent).toBe("EMPLOYEE_DAILY_STATUS");
    expect(missing.body.data.data.status).toBe("NOT_FOUND");
    expect(missing.body.data.answer).not.toMatch(/Ramesh is on leave|attendance/i);

    const vendor = await ask(token, "Show vendor settlements");
    expect(vendor.body.data.intent).toBe("UNSUPPORTED");
    expect(vendor.body.data.answer).toMatch(/vendor/i);
    expect(vendor.body.data.data.evaluation.failureType).toBe("DATA_FAILURE");

    const assign = await request(app)
      .post("/api/v1/assistant/action")
      .set(auth(token))
      .send({ message: "Give it to Sathish", conversationId: "GOLD-ASSIGN" });
    expect(assign.body.data.intent).toBe("ASSIGN_TASK");
    expect(assign.body.data.status).toBe("CLARIFICATION_REQUIRED");
    expect(assign.body.data.message).toMatch(/which task/i);
  });
});

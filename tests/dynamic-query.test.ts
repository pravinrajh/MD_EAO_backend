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
import { normalizeQuery } from "../src/services/assistant/intentRouter.service";
import { planFromSchema, looksLikeMissingDomain } from "../src/services/assistant/dynamicQueryPlanner.service";
import { validateBqlPlan } from "../src/services/assistant/bql";
import { QueryPlanValidationError } from "../src/services/assistant/queryPlan.types";
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

async function ask(token: string, message: string) {
  return request(app).post("/api/v1/ai/query").set(auth(token)).send({ message });
}

describe("dynamic business query planner", () => {
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

  it("builds a schema-backed plan for unseen wording without a question list", () => {
    const plan = planFromSchema({
      original: "What projects are going?",
      normalized: normalizeQuery("What projects are going?").normalized,
      extracted: {},
    });
    expect(plan?.sources).toContain("projects");
    expect(plan?.filters.some((item) => item.field === "status" && item.value === "ACTIVE")).toBe(true);
  });

  it("rejects Mongo operators and unknown domains in BQL", () => {
    expect(() => validateBqlPlan({ $match: {} })).toThrow(QueryPlanValidationError);
    expect(() =>
      validateBqlPlan({
        operation: "LIST",
        sources: ["inventory"],
        filters: [],
        limit: 10,
      }),
    ).toThrow(/dataset/);
    expect(looksLikeMissingDomain(normalizeQuery("What is our inventory turnover?").normalized)).toBe("inventory");
    expect(looksLikeMissingDomain(normalizeQuery("Show vendor settlements").normalized)).toBe("vendor");
    expect(looksLikeMissingDomain(normalizeQuery("Did Sathish take leave today?").normalized)).toBe("leave");
    expect(looksLikeMissingDomain(normalizeQuery("What is the collection amount?").normalized)).toBe("collection");
    expect(looksLikeMissingDomain(normalizeQuery("Meena Krishnan WORKING WHAT").normalized)).toBeNull();
  });

  it("answers a previously unsupported project wording from MongoDB", async () => {
    const adminUser = await createUser("ADMIN", "admin-dyn@example.com", "9876500801");
    const empUser = await createUser("EMPLOYEE", "raj-dyn@example.com", "9876500802");
    const employee = await Employee.create({
      employeeId: randomUUID(),
      userId: empUser._id,
      employeeCode: await nextEmployeeCode(),
      firstName: "Raj",
      lastName: "Iyer",
      displayName: "Raj Iyer",
      email: empUser.email,
      phone: "9876500802",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
    });
    await Project.create({
      projectId: await nextProjectId(),
      name: "Chennai Project",
      code: "CHN-DYN-1",
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

    const session = await loginAs("admin-dyn@example.com");
    const going = await ask(session.accessToken, "What projects are going?");
    expect(going.status).toBe(200);
    expect(going.body.data.intent).not.toBe("UNSUPPORTED");
    expect(going.body.data.intent).toBe("DYNAMIC_QUERY");
    expect(JSON.stringify(going.body.data.data)).toMatch(/Chennai/i);
    expect(going.body.data.answer).toMatch(/Chennai|project/i);

    const happening = await ask(session.accessToken, "What is happening with our current work?");
    expect(happening.body.data.intent).not.toBe("UNSUPPORTED");

    const behind = await ask(session.accessToken, "Where are we falling behind?");
    expect(behind.body.data.intent).not.toBe("UNSUPPORTED");

    const inventory = await ask(session.accessToken, "What is our inventory turnover?");
    expect(inventory.body.data.intent).toBe("UNSUPPORTED");
    expect(inventory.body.data.answer).toMatch(/inventory/i);
    expect(inventory.body.data.answer).toMatch(/don['’]t have|do not have/i);
  });

  it("uses a Gemini BQL plan when provided and still hits domain services", async () => {
    const adminUser = await createUser("ADMIN", "admin-bql@example.com", "9876500803");
    const empUser = await createUser("EMPLOYEE", "meena-dyn@example.com", "9876500804");
    const employee = await Employee.create({
      employeeId: randomUUID(),
      userId: empUser._id,
      employeeCode: await nextEmployeeCode(),
      firstName: "Meena",
      lastName: "K",
      displayName: "Meena K",
      email: empUser.email,
      phone: "9876500804",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
    });
    await Project.create({
      projectId: await nextProjectId(),
      name: "Bangalore Project",
      code: "BLR-DYN-1",
      projectType: "COMMERCIAL",
      managerId: employee._id,
      members: [employee._id],
      status: "ACTIVE",
      progress: 40,
      budget: 2000000,
      actualExpense: 500000,
      createdBy: adminUser._id,
    });
    const session = await loginAs("admin-bql@example.com");
    setLlmProviderForTests({
      isEnabled: () => true,
      async understand() {
        return { kind: "query", intent: "DYNAMIC_QUERY", entities: {}, confidence: 0.9 };
      },
      async summarize() {
        return null;
      },
      async plan() {
        return {
          type: "QUERY",
          operation: "LIST",
          sources: ["projects"],
          filters: [{ source: "projects", field: "status", operator: "equals", value: "ACTIVE" }],
          relationships: [],
          groupBy: [],
          sort: [{ field: "createdAt", direction: "DESC" }],
          limit: 20,
        };
      },
    });

    const response = await ask(session.accessToken, "Give me a read on live sites right now.");
    expect(response.body.data.intent).toBe("DYNAMIC_QUERY");
    expect(JSON.stringify(response.body.data.data)).toMatch(/Bangalore/i);
  });
});

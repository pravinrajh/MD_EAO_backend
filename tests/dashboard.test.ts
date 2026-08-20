import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { Account } from "../src/models/Account";
import { Customer } from "../src/models/Customer";
import { Employee } from "../src/models/Employee";
import { FinanceCategory } from "../src/models/FinanceCategory";
import { FinanceTransaction } from "../src/models/FinanceTransaction";
import { Lead } from "../src/models/Lead";
import { Meeting } from "../src/models/Meeting";
import { Opportunity } from "../src/models/Opportunity";
import { Project } from "../src/models/Project";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import {
  nextAccountId,
  nextCustomerId,
  nextEmployeeCode,
  nextFinanceCategoryId,
  nextLeadId,
  nextMeetingId,
  nextOpportunityId,
  nextProjectId,
  nextTaskId,
  nextTransactionId,
} from "../src/utils/sequence";
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
  options: { phone?: string; firstName?: string; managerId?: string } = {},
) {
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName: options.firstName ?? user.email.split("@")[0],
    lastName: "Worker",
    displayName: `${options.firstName ?? user.email.split("@")[0]} Worker`,
    email: user.email,
    phone: options.phone ?? "9876500900",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
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
  const adminUser = await createUser("ADMIN", "admin@example.com", "9876500901");
  const managerUser = await createUser("MANAGER", "manager@example.com", "9876500902");
  const employeeUser = await createUser("EMPLOYEE", "raj@example.com", "9876500903");
  const outsiderUser = await createUser("EMPLOYEE", "out@example.com", "9876500904");

  const managerEmp = await createEmployeeForUser(managerUser, { phone: "9876500902", firstName: "Kumar" });
  const rajEmp = await createEmployeeForUser(employeeUser, {
    phone: "9876500903",
    firstName: "Raj",
    managerId: String(managerEmp._id),
  });
  await createEmployeeForUser(outsiderUser, { phone: "9876500904", firstName: "Priya" });

  const chennai = await Project.create({
    projectId: await nextProjectId(),
    name: "Chennai Project",
    code: "CHN-DASH-1",
    projectType: "INFRASTRUCTURE",
    managerId: managerEmp._id,
    members: [rajEmp._id],
    status: "ACTIVE",
    progress: 72,
    budget: 15000000,
    actualExpense: 13200000,
    createdBy: adminUser._id,
  });

  await Project.create({
    projectId: await nextProjectId(),
    name: "Bangalore Project",
    code: "BLR-DASH-1",
    projectType: "COMMERCIAL",
    managerId: managerEmp._id,
    members: [],
    status: "PLANNING",
    progress: 10,
    budget: 8000000,
    actualExpense: 0,
    createdBy: adminUser._id,
  });

  await Task.create({
    taskId: await nextTaskId(),
    title: "Electrical material verification",
    assignedTo: rajEmp._id,
    createdBy: adminUser._id,
    projectId: chennai._id,
    priority: "HIGH",
    status: "PENDING",
    dueDate: new Date("2026-08-18T00:00:00.000Z"),
  });
  await Task.create({
    taskId: await nextTaskId(),
    title: "Vendor follow-up",
    assignedTo: rajEmp._id,
    createdBy: adminUser._id,
    projectId: chennai._id,
    priority: "MEDIUM",
    status: "PENDING",
    dueDate: new Date("2026-08-20T12:00:00.000Z"),
  });
  await Task.create({
    taskId: await nextTaskId(),
    title: "Project review",
    assignedTo: rajEmp._id,
    createdBy: adminUser._id,
    projectId: chennai._id,
    priority: "LOW",
    status: "COMPLETED",
    dueDate: new Date("2026-08-20T12:00:00.000Z"),
    completedAt: new Date("2026-08-20T05:00:00.000Z"),
  });

  await Meeting.create({
    meetingId: await nextMeetingId(),
    title: "Chennai Project Review",
    meetingType: "PROJECT_REVIEW",
    organizerId: adminUser._id,
    participants: [rajEmp._id, managerEmp._id],
    projectId: chennai._id,
    location: "Office",
    startTime: new Date("2026-08-20T04:30:00.000Z"),
    endTime: new Date("2026-08-20T05:30:00.000Z"),
    timezone: "Asia/Kolkata",
    status: "SCHEDULED",
    createdBy: adminUser._id,
  });
  await Meeting.create({
    meetingId: await nextMeetingId(),
    title: "Next week planning",
    meetingType: "INTERNAL",
    organizerId: adminUser._id,
    participants: [managerEmp._id],
    location: "Office",
    startTime: new Date("2026-08-22T04:30:00.000Z"),
    endTime: new Date("2026-08-22T05:30:00.000Z"),
    timezone: "Asia/Kolkata",
    status: "SCHEDULED",
    createdBy: adminUser._id,
  });

  await Lead.create({
    leadId: await nextLeadId(),
    name: "ABC Industries",
    companyName: "ABC Industries",
    email: "abc@abc.com",
    phone: "9876543210",
    source: "WEBSITE",
    assignedTo: rajEmp._id,
    status: "NEW",
    estimatedValue: 1000000,
    nextFollowUpAt: new Date("2026-08-18T00:00:00.000Z"),
    createdBy: adminUser._id,
    emailNormalized: "abc@abc.com",
    phoneNormalized: "9876543210",
  });
  await Lead.create({
    leadId: await nextLeadId(),
    name: "XYZ Builders",
    companyName: "XYZ Builders",
    email: "xyz@xyz.com",
    phone: "9876543218",
    source: "REFERRAL",
    assignedTo: rajEmp._id,
    status: "QUALIFIED",
    estimatedValue: 2000000,
    createdBy: adminUser._id,
    emailNormalized: "xyz@xyz.com",
    phoneNormalized: "9876543218",
  });

  const customer = await Customer.create({
    customerId: await nextCustomerId(),
    name: "ABC Industries",
    assignedTo: rajEmp._id,
    status: "ACTIVE",
    createdBy: adminUser._id,
  });

  await Opportunity.create({
    opportunityId: await nextOpportunityId(),
    title: "ABC Project",
    customerId: customer._id,
    assignedTo: rajEmp._id,
    stage: "PROPOSAL",
    probability: 50,
    estimatedValue: 5000000,
    expectedCloseDate: new Date("2026-12-30T00:00:00.000Z"),
    nextFollowUpAt: new Date("2026-08-18T00:00:00.000Z"),
    createdBy: adminUser._id,
  });

  const bank = await Account.create({
    accountId: await nextAccountId(),
    name: "HDFC Bank",
    code: "1100",
    type: "BANK",
    openingBalance: 100000000,
    currentBalance: 110000000,
    currency: "INR",
    status: "ACTIVE",
    createdBy: adminUser._id,
  });
  const incomeCat = await FinanceCategory.create({
    categoryId: await nextFinanceCategoryId(),
    name: "Sales",
    code: "4000",
    type: "INCOME",
    createdBy: adminUser._id,
  });
  const expenseCat = await FinanceCategory.create({
    categoryId: await nextFinanceCategoryId(),
    name: "Vendor",
    code: "5000",
    type: "EXPENSE",
    createdBy: adminUser._id,
  });

  await FinanceTransaction.create({
    transactionId: await nextTransactionId(),
    type: "INCOME",
    accountId: bank._id,
    categoryId: incomeCat._id,
    amount: 25000000,
    currency: "INR",
    transactionDate: new Date("2026-08-18T06:00:00.000Z"),
    status: "COMPLETED",
    createdBy: adminUser._id,
  });
  await FinanceTransaction.create({
    transactionId: await nextTransactionId(),
    type: "EXPENSE",
    accountId: bank._id,
    categoryId: expenseCat._id,
    amount: 15000000,
    currency: "INR",
    projectId: chennai._id,
    transactionDate: new Date("2026-08-18T07:00:00.000Z"),
    status: "COMPLETED",
    createdBy: adminUser._id,
  });

  return {
    chennai,
    admin: await loginAs("admin@example.com"),
    manager: await loginAs("manager@example.com"),
    raj: await loginAs("raj@example.com"),
    out: await loginAs("out@example.com"),
  };
}

describe("Executive dashboard APIs", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/dashboard");
    expect(response.status).toBe(401);
  });

  it("returns zeros from live aggregations on an empty database", async () => {
    const adminUser = await createUser("ADMIN", "admin@example.com", "9876500911");
    void adminUser;
    const session = await loginAs("admin@example.com");
    const response = await request(app).get("/api/v1/dashboard?date=2026-08-20").set(auth(session.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.data.overview.activeProjects).toBe(0);
    expect(response.body.data.overview.pendingTasks).toBe(0);
    expect(response.body.data.overview.pipelineValue).toBe(0);
    expect(response.body.data.finance.income).toBe(0);
    expect(response.body.data.finance.expense).toBe(0);
  });

  it("builds the MD dashboard from live module data", async () => {
    const ctx = await seed();
    const response = await request(app)
      .get("/api/v1/dashboard/md?date=2026-08-20")
      .set(auth(ctx.admin.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.date).toBe("2026-08-20");
    expect(response.body.data.timezone).toBe("Asia/Kolkata");
    expect(response.body.data.overview.activeProjects).toBe(1);
    expect(response.body.data.overview.pendingTasks).toBe(2);
    expect(response.body.data.overview.overdueTasks).toBe(1);
    expect(response.body.data.overview.todayMeetings).toBe(1);
    expect(response.body.data.overview.openOpportunities).toBe(1);
    expect(response.body.data.overview.pipelineValue).toBe(5000000);
    expect(response.body.data.overview.monthlyIncome).toBe(25000000);
    expect(response.body.data.overview.monthlyExpense).toBe(15000000);
    expect(response.body.data.overview.netCashFlow).toBe(10000000);
    expect(response.body.data.tasks.today.total).toBe(2);
    expect(response.body.data.tasks.today.pending).toBe(1);
    expect(response.body.data.tasks.today.completed).toBe(1);
    expect(response.body.data.tasks.overdue[0].title).toBe("Electrical material verification");
    expect(response.body.data.tasks.overdue[0].assignedTo.name).toContain("Raj");
    expect(response.body.data.meetings.today[0].title).toBe("Chennai Project Review");
    expect(response.body.data.meetings.today[0].participantsCount).toBe(2);
    expect(response.body.data.sales.openOpportunities).toBe(1);
    expect(response.body.data.sales.pipeline[0].stage).toBe("NEW");
    expect(response.body.data.finance.income).toBe(25000000);
    expect(response.body.data.finance.accountBalance).toBe(110000000);
    expect(response.body.data.attention.length).toBeGreaterThan(0);
  });

  it("scopes the employee dashboard and hides company finance", async () => {
    const ctx = await seed();
    const denied = await request(app).get("/api/v1/dashboard/md").set(auth(ctx.raj.accessToken));
    expect(denied.status).toBe(403);

    const mine = await request(app).get("/api/v1/dashboard/me?date=2026-08-20").set(auth(ctx.raj.accessToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data.finance.available).toBe(false);
    expect(mine.body.data.overview.monthlyIncome).toBeNull();
    expect(mine.body.data.tasks.overdue[0].title).toBe("Electrical material verification");

    const outsider = await request(app).get("/api/v1/dashboard/me?date=2026-08-20").set(auth(ctx.out.accessToken));
    expect(outsider.status).toBe(200);
    expect(outsider.body.data.tasks.overdue).toHaveLength(0);
    expect(outsider.body.data.projects.total).toBe(0);
  });

  it("rejects unknown query keys such as employeeId", async () => {
    const ctx = await seed();
    const response = await request(app)
      .get(`/api/v1/dashboard?employeeId=${ctx.chennai._id}`)
      .set(auth(ctx.raj.accessToken));
    expect(response.status).toBe(422);
  });

  it("rejects an invalid calendar date", async () => {
    const ctx = await seed();
    const bad = await request(app).get("/api/v1/dashboard?date=2026-13-40").set(auth(ctx.admin.accessToken));
    expect(bad.status).toBe(422);
    const impossible = await request(app).get("/api/v1/dashboard?date=2026-02-31").set(auth(ctx.admin.accessToken));
    expect(impossible.status).toBe(422);
  });

  it("returns project health, weekly finance, activity, and morning report", async () => {
    const ctx = await seed();
    const health = await request(app)
      .get("/api/v1/dashboard/project-health?limit=10&date=2026-08-20")
      .set(auth(ctx.admin.accessToken));
    expect(health.status).toBe(200);
    expect(health.body.data.total).toBe(2);
    const chennai = health.body.data.items.find((item: { name: string }) => item.name === "Chennai Project");
    expect(chennai.health).toBe("YELLOW");
    expect(chennai.remainingBudget).toBe(1800000);
    expect(chennai.overdueTasks).toBe(1);

    const weekly = await request(app)
      .get("/api/v1/dashboard/weekly-financial-requirement?date=2026-08-20")
      .set(auth(ctx.admin.accessToken));
    expect(weekly.status).toBe(200);
    expect(weekly.body.data.expectedIncome).toBe(25000000);
    expect(weekly.body.data.plannedExpenses).toBe(15000000);
    expect(weekly.body.data.netRequirement).toBe(10000000);
    expect(weekly.body.data.items[0].category).toBe("Vendor");
    expect(weekly.body.data.basis).toMatch(/not modeled/);

    const employeeWeekly = await request(app)
      .get("/api/v1/dashboard/weekly-financial-requirement")
      .set(auth(ctx.raj.accessToken));
    expect(employeeWeekly.status).toBe(403);

    const activity = await request(app).get("/api/v1/dashboard/activity").set(auth(ctx.admin.accessToken));
    expect(activity.status).toBe(200);
    expect(activity.body.data.length).toBeGreaterThan(0);

    const morning = await request(app)
      .get("/api/v1/dashboard/morning-report?date=2026-08-20")
      .set(auth(ctx.admin.accessToken));
    expect(morning.status).toBe(200);
    expect(morning.body.data.date).toBe("2026-08-20");
    expect(morning.body.data.summary).toMatch(/attention today/);
    expect(morning.body.data.meetings[0].title).toBe("Chennai Project Review");

    const upcoming = await request(app)
      .get("/api/v1/dashboard/upcoming-meetings?days=7&date=2026-08-20")
      .set(auth(ctx.admin.accessToken));
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.data.items.length).toBeGreaterThan(0);
  });

  it("paginates project health and filters by health", async () => {
    const ctx = await seed();
    const page = await request(app)
      .get("/api/v1/dashboard/project-health?page=1&limit=1&date=2026-08-20")
      .set(auth(ctx.admin.accessToken));
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.meta.total).toBe(2);
    expect(page.body.meta.limit).toBe(1);

    const yellow = await request(app)
      .get("/api/v1/dashboard/project-health?health=YELLOW&date=2026-08-20")
      .set(auth(ctx.admin.accessToken));
    expect(yellow.body.data.items.every((item: { health: string }) => item.health === "YELLOW")).toBe(true);
  });

  it("aggregates a larger task set without loading the collection into Node", async () => {
    const ctx = await seed();
    const docs = [];
    for (let i = 0; i < 250; i += 1) {
      docs.push({
        taskId: `TASK-B${String(i + 1).padStart(6, "0")}`,
        title: `Bulk task ${i}`,
        assignedTo: ctx.chennai.members[0],
        createdBy: ctx.chennai.createdBy,
        projectId: ctx.chennai._id,
        priority: "LOW",
        status: "PENDING",
        dueDate: new Date("2026-09-01T00:00:00.000Z"),
      });
    }
    await Task.insertMany(docs);
    const started = Date.now();
    const response = await request(app).get("/api/v1/dashboard?date=2026-08-20").set(auth(ctx.admin.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.data.overview.pendingTasks).toBe(252);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(JSON.stringify(response.body).length).toBeLessThan(200_000);
  });
});

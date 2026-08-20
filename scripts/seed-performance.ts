import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { Account } from "../src/models/Account";
import { Customer } from "../src/models/Customer";
import { Employee } from "../src/models/Employee";
import { FinanceCategory } from "../src/models/FinanceCategory";
import { FinanceTransaction } from "../src/models/FinanceTransaction";
import { Lead } from "../src/models/Lead";
import { Meeting } from "../src/models/Meeting";
import { Notification } from "../src/models/Notification";
import { Opportunity } from "../src/models/Opportunity";
import { Project } from "../src/models/Project";
import { Reminder } from "../src/models/Reminder";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import { logger } from "../src/config/logger";
import { assertPerformanceMongoUri, performanceMongoUri } from "./lib/perfGuard";

type ScaleName = "small" | "medium" | "large";

type Scale = {
  users: number;
  projects: number;
  tasks: number;
  meetings: number;
  leads: number;
  opportunities: number;
  notifications: number;
  reminders: number;
  transactions: number;
};

const SCALES: Record<ScaleName, Scale> = {
  small: {
    users: 50,
    projects: 20,
    tasks: 1_000,
    meetings: 200,
    leads: 200,
    opportunities: 100,
    notifications: 1_000,
    reminders: 200,
    transactions: 200,
  },
  medium: {
    users: 500,
    projects: 500,
    tasks: 50_000,
    meetings: 10_000,
    leads: 10_000,
    opportunities: 5_000,
    notifications: 50_000,
    reminders: 5_000,
    transactions: 10_000,
  },
  large: {
    users: 5_000,
    projects: 10_000,
    tasks: 1_000_000,
    meetings: 500_000,
    leads: 500_000,
    opportunities: 250_000,
    notifications: 1_000_000,
    reminders: 250_000,
    transactions: 100_000,
  },
};

const BATCH = 1_000;
const PASSWORD = "PerfPassword123!";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function parseScale(): ScaleName {
  const value = (argValue("scale") || process.env.PERF_SCALE || "small").toLowerCase();
  if (value === "small" || value === "medium" || value === "large") return value;
  throw new Error("scale must be small, medium, or large");
}

function resolveCounts(scale: ScaleName): Scale {
  const base = SCALES[scale];
  return {
    users: envInt("PERF_USERS", base.users),
    projects: envInt("PERF_PROJECTS", base.projects),
    tasks: envInt("PERF_TASKS", base.tasks),
    meetings: envInt("PERF_MEETINGS", base.meetings),
    leads: envInt("PERF_LEADS", base.leads),
    opportunities: envInt("PERF_OPPORTUNITIES", base.opportunities),
    notifications: envInt("PERF_NOTIFICATIONS", base.notifications),
    reminders: envInt("PERF_REMINDERS", base.reminders),
    transactions: envInt("PERF_TRANSACTIONS", base.transactions),
  };
}

function pad(prefix: string, n: number, width = 7): string {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

function pick<T>(items: T[], index: number): T {
  return items[index % items.length];
}

async function insertInBatches<T>(
  label: string,
  total: number,
  build: (index: number) => T,
  write: (docs: T[]) => Promise<unknown>,
): Promise<void> {
  if (total === 0) return;
  let inserted = 0;
  while (inserted < total) {
    const size = Math.min(BATCH, total - inserted);
    const docs = Array.from({ length: size }, (_, offset) => build(inserted + offset));
    await write(docs);
    inserted += size;
    if (inserted === total || inserted % 10_000 === 0) {
      logger.info({ inserted, total, label }, "Performance seed progress");
    }
  }
}

async function seedPerformance(): Promise<void> {
  const scale = parseScale();
  if (scale === "large" && process.env.CONFIRM_PERF_SEED !== "YES") {
    throw new Error("Refusing large seed. Re-run with CONFIRM_PERF_SEED=YES --scale=large");
  }

  const uri = performanceMongoUri();
  const dbName = assertPerformanceMongoUri(uri, "Performance seed");
  const counts = resolveCounts(scale);

  logger.info({ dbName, scale, counts }, "Starting performance seed");
  await mongoose.connect(uri, { maxPoolSize: 50, minPoolSize: 5 });

  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const now = Date.now();
  const userIds = Array.from({ length: Math.max(counts.users, 1) }, () => new mongoose.Types.ObjectId());
  const employeeIds = userIds.map(() => new mongoose.Types.ObjectId());

  await insertInBatches(
    "users",
    userIds.length,
    (index) => {
      const role = index === 0 ? "MD" : index === 1 ? "ADMIN" : index < 8 ? "MANAGER" : "EMPLOYEE";
      return {
        _id: userIds[index],
        name: `Perf User ${index + 1}`,
        email: `perf.user${index + 1}@example.com`,
        phone: `98${String(10000000 + index).slice(-8)}`,
        passwordHash,
        role,
        status: "ACTIVE",
        isActive: true,
      };
    },
    (docs) => User.insertMany(docs, { ordered: false }),
  );

  await insertInBatches(
    "employees",
    employeeIds.length,
    (index) => ({
      _id: employeeIds[index],
      employeeId: pad("PEMP", index + 1),
      userId: userIds[index],
      employeeCode: pad("EMP", index + 1),
      firstName: "Perf",
      lastName: `User${index + 1}`,
      displayName: `Perf User ${index + 1}`,
      email: `perf.user${index + 1}@example.com`,
      phone: `98${String(10000000 + index).slice(-8)}`,
      department: index % 3 === 0 ? "Sales" : "Operations",
      designation: "Staff",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
      location: index % 2 === 0 ? "Chennai" : "Bengaluru",
    }),
    (docs) => Employee.insertMany(docs, { ordered: false }),
  );

  const projectIds = Array.from({ length: Math.max(counts.projects, 1) }, () => new mongoose.Types.ObjectId());
  await insertInBatches(
    "projects",
    counts.projects,
    (index) => ({
      _id: projectIds[index],
      projectId: pad("PROJ", index + 1),
      name: `${index % 17 === 0 ? "At Risk " : ""}Site ${index + 1}`,
      code: pad("P", index + 1, 6),
      projectType: index % 2 === 0 ? "RESIDENTIAL" : "OTHER",
      managerId: pick(employeeIds, index),
      members: [pick(employeeIds, index), pick(employeeIds, index + 1)],
      status: index % 20 === 0 ? "ON_HOLD" : "ACTIVE",
      progress: index % 101,
      budget: 1_000_000 + (index % 50) * 10_000,
      actualExpense: (index % 40) * 5_000,
      createdBy: userIds[0],
      isDeleted: false,
    }),
    (docs) => Project.insertMany(docs, { ordered: false }),
  );

  await insertInBatches(
    "tasks",
    counts.tasks,
    (index) => {
      const dueOffsetDays = (index % 40) - 10;
      return {
        taskId: pad("TASK", index + 1),
        title: `Performance task ${index + 1}`,
        assignedTo: pick(employeeIds, index),
        createdBy: pick(userIds, index),
        projectId: pick(projectIds, index),
        priority: index % 20 === 0 ? "HIGH" : "LOW",
        status: index % 15 === 0 ? "COMPLETED" : "PENDING",
        dueDate: new Date(now + dueOffsetDays * 24 * 60 * 60 * 1000),
        isDeleted: false,
      };
    },
    (docs) => Task.insertMany(docs, { ordered: false }),
  );

  await insertInBatches(
    "meetings",
    counts.meetings,
    (index) => {
      const start = new Date(now + (index % 14) * 60 * 60 * 1000 + Math.floor(index / 14) * 24 * 60 * 60 * 1000);
      return {
        meetingId: pad("MTG", index + 1),
        title: `Perf meeting ${index + 1}`,
        meetingType: "INTERNAL",
        organizerId: pick(userIds, index),
        createdBy: pick(userIds, index),
        participants: [pick(employeeIds, index)],
        projectId: pick(projectIds, index),
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60 * 1000),
        timezone: "Asia/Kolkata",
        status: "SCHEDULED",
        isDeleted: false,
      };
    },
    (docs) => Meeting.insertMany(docs, { ordered: false }),
  );

  const leadIds = Array.from({ length: Math.max(counts.leads, 1) }, () => new mongoose.Types.ObjectId());
  await insertInBatches(
    "leads",
    counts.leads,
    (index) => ({
      _id: leadIds[index],
      leadId: pad("LEAD", index + 1),
      name: `Lead ${index + 1}`,
      companyName: `Company ${index + 1}`,
      email: `lead${index + 1}@example.com`,
      emailNormalized: `lead${index + 1}@example.com`,
      phone: `97${String(10000000 + index).slice(-8)}`,
      phoneNormalized: `97${String(10000000 + index).slice(-8)}`,
      companyNameNormalized: `company ${index + 1}`,
      source: "WEBSITE",
      assignedTo: pick(employeeIds, index),
      status: index % 9 === 0 ? "CONVERTED" : "NEW",
      priority: "MEDIUM",
      estimatedValue: 50_000 + (index % 20) * 1_000,
      createdBy: userIds[0],
      isDeleted: false,
    }),
    (docs) => Lead.insertMany(docs, { ordered: false }),
  );

  const customerIds = Array.from({ length: Math.max(counts.opportunities, 1) }, () => new mongoose.Types.ObjectId());
  await insertInBatches(
    "customers",
    customerIds.length,
    (index) => ({
      _id: customerIds[index],
      customerId: pad("CUST", index + 1),
      name: `Customer ${index + 1}`,
      companyName: `Customer Co ${index + 1}`,
      email: `customer${index + 1}@example.com`,
      emailNormalized: `customer${index + 1}@example.com`,
      phone: `96${String(10000000 + index).slice(-8)}`,
      phoneNormalized: `96${String(10000000 + index).slice(-8)}`,
      assignedTo: pick(employeeIds, index),
      status: "ACTIVE",
      createdBy: userIds[0],
      isDeleted: false,
    }),
    (docs) => Customer.insertMany(docs, { ordered: false }),
  );

  await insertInBatches(
    "opportunities",
    counts.opportunities,
    (index) => ({
      opportunityId: pad("OPP", index + 1),
      title: `Opportunity ${index + 1}`,
      customerId: pick(customerIds, index),
      leadId: pick(leadIds, index),
      projectId: pick(projectIds, index),
      assignedTo: pick(employeeIds, index),
      stage: index % 11 === 0 ? "WON" : "NEW",
      probability: index % 11 === 0 ? 100 : 10,
      estimatedValue: 100_000 + (index % 30) * 5_000,
      createdBy: userIds[0],
      isDeleted: false,
    }),
    (docs) => Opportunity.insertMany(docs, { ordered: false }),
  );

  const bankId = new mongoose.Types.ObjectId();
  const incomeCat = new mongoose.Types.ObjectId();
  const expenseCat = new mongoose.Types.ObjectId();
  await Account.create({
    _id: bankId,
    accountId: "ACC-PERF1",
    name: "Performance Bank",
    code: "PERFBANK",
    type: "BANK",
    openingBalance: 1_000_000,
    currentBalance: 1_000_000,
    createdBy: userIds[0],
  });
  await FinanceCategory.insertMany([
    {
      _id: incomeCat,
      categoryId: "CAT-PERF1",
      name: "Sales Income",
      code: "SALESIN",
      type: "INCOME",
      createdBy: userIds[0],
    },
    {
      _id: expenseCat,
      categoryId: "CAT-PERF2",
      name: "Site Expense",
      code: "SITEEXP",
      type: "EXPENSE",
      createdBy: userIds[0],
    },
  ]);

  await insertInBatches(
    "transactions",
    counts.transactions,
    (index) => ({
      transactionId: pad("TXN", index + 1),
      type: index % 2 === 0 ? "INCOME" : "EXPENSE",
      accountId: bankId,
      categoryId: index % 2 === 0 ? incomeCat : expenseCat,
      amount: 1_000 + (index % 50) * 100,
      currency: "INR",
      projectId: pick(projectIds, index),
      transactionDate: new Date(now - (index % 40) * 24 * 60 * 60 * 1000),
      status: "COMPLETED",
      createdBy: userIds[0],
      isDeleted: false,
    }),
    (docs) => FinanceTransaction.insertMany(docs, { ordered: false }),
  );

  await insertInBatches(
    "notifications",
    counts.notifications,
    (index) => ({
      notificationId: pad("NOTIF", index + 1),
      recipientId: pick(userIds, index),
      type: "SYSTEM_ALERT",
      category: "system",
      title: `Perf notification ${index + 1}`,
      message: "Seeded notification",
      priority: "NORMAL",
      isRead: index % 4 === 0,
      status: "SENT",
      isDeleted: false,
    }),
    (docs) => Notification.insertMany(docs, { ordered: false }),
  );

  const dueCount = Math.min(counts.reminders, Math.max(Math.floor(counts.reminders * 0.04), counts.reminders > 0 ? 1 : 0));
  await insertInBatches(
    "reminders",
    counts.reminders,
    (index) => {
      const due = index < dueCount;
      const when = new Date(now + (due ? -60_000 : (index + 1) * 60 * 60 * 1000));
      return {
        reminderId: pad("REM", index + 1),
        userId: pick(userIds, index),
        createdBy: pick(userIds, index),
        title: `Perf reminder ${index + 1}`,
        reminderType: "CUSTOM",
        sourceType: "CUSTOM",
        scheduledAt: when,
        nextRunAt: when,
        timezone: "Asia/Kolkata",
        status: "SCHEDULED",
        priority: "NORMAL",
      };
    },
    (docs) => Reminder.insertMany(docs, { ordered: false }),
  );

  logger.info(
    {
      dbName,
      scale,
      loginEmail: "perf.user1@example.com",
      dueReminders: dueCount,
      counts,
    },
    "Performance seed completed",
  );
  await mongoose.disconnect();
}

seedPerformance().catch((error) => {
  logger.fatal({ err: error }, "Performance seed failed");
  process.exit(1);
});

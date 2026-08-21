/**
 * Validates ArchNova seeded demo data: orphans, finance consistency, golden scenarios.
 */
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../../src/config/database";
import { env } from "../../src/config/env";
import { Account } from "../../src/models/Account";
import { Budget } from "../../src/models/Budget";
import { Customer } from "../../src/models/Customer";
import { Employee } from "../../src/models/Employee";
import { FinanceCategory } from "../../src/models/FinanceCategory";
import { FinanceTransaction } from "../../src/models/FinanceTransaction";
import { Lead } from "../../src/models/Lead";
import { Meeting } from "../../src/models/Meeting";
import { Notification } from "../../src/models/Notification";
import { Opportunity } from "../../src/models/Opportunity";
import { Project } from "../../src/models/Project";
import { Reminder } from "../../src/models/Reminder";
import { SalesActivity } from "../../src/models/SalesActivity";
import { Task } from "../../src/models/Task";
import { User } from "../../src/models/User";
import { databaseNameFromUri } from "../../scripts/lib/perfGuard";
import { ARCHNOVA, EXPECTED_COUNTS, GOLDEN } from "./demo_data/golden";

type Issue = { level: "ERROR" | "WARN"; message: string };

function oid(value: unknown): string | null {
  if (!value) return null;
  return String(value);
}

async function validate(): Promise<number> {
  const dbName = databaseNameFromUri(env.MONGODB_URI);
  console.log(`Validating ArchNova data in database: ${dbName}`);
  await connectDatabase();

  const issues: Issue[] = [];
  const [
    users,
    employees,
    customers,
    leads,
    opportunities,
    activities,
    projects,
    tasks,
    meetings,
    accounts,
    categories,
    transactions,
    budgets,
    notifications,
    reminders,
  ] = await Promise.all([
    User.find({ email: { $regex: /@archnova\.com$/i } }).lean(),
    Employee.find({ employeeCode: { $regex: /^AN-/ } }).lean(),
    Customer.find({ customerId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Lead.find({ leadId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Opportunity.find({ opportunityId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    SalesActivity.find({ activityId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Project.find({ projectId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Task.find({ taskId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Meeting.find({ meetingId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Account.find({ accountId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    FinanceCategory.find({ categoryId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    FinanceTransaction.find({ transactionId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Budget.find({ budgetId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Notification.find({ notificationId: { $regex: /^AN-/ }, isDeleted: false }).lean(),
    Reminder.find({ reminderId: { $regex: /^AN-/ } }).lean(),
  ]);

  const counts = {
    users: users.length,
    employees: employees.length,
    customers: customers.length,
    leads: leads.length,
    opportunities: opportunities.length,
    salesActivities: activities.length,
    projects: projects.length,
    tasks: tasks.length,
    meetings: meetings.length,
    accounts: accounts.length,
    financeCategories: categories.length,
    financeTransactions: transactions.length,
    budgets: budgets.length,
    notifications: notifications.length,
    reminders: reminders.length,
  };
  console.log("Counts:", counts);

  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = counts[key as keyof typeof counts] ?? 0;
    if (actual < expected * 0.95) {
      issues.push({ level: "ERROR", message: `Count low for ${key}: expected ~${expected}, got ${actual}` });
    }
  }

  const userIdSet = new Set(users.map((u) => String(u._id)));
  const employeeIdSet = new Set(employees.map((e) => String(e._id)));
  const customerIdSet = new Set(customers.map((c) => String(c._id)));
  const leadIdSet = new Set(leads.map((l) => String(l._id)));
  const opportunityIdSet = new Set(opportunities.map((o) => String(o._id)));
  const projectIdSet = new Set(projects.map((p) => String(p._id)));
  const meetingIdSet = new Set(meetings.map((m) => String(m._id)));
  const accountIdSet = new Set(accounts.map((a) => String(a._id)));
  const categoryIdSet = new Set(categories.map((c) => String(c._id)));

  // Office.local untouched check
  const officeUsers = await User.countDocuments({ email: /@office\.local$/i });
  if (officeUsers === 0) {
    issues.push({ level: "WARN", message: "No @office.local users found (may be fine if never seeded)." });
  }

  for (const employee of employees) {
    if (!userIdSet.has(String(employee.userId))) {
      issues.push({ level: "ERROR", message: `Employee ${employee.employeeCode} orphan userId` });
    }
    if (employee.managerId && !employeeIdSet.has(String(employee.managerId))) {
      issues.push({ level: "ERROR", message: `Employee ${employee.employeeCode} orphan managerId` });
    }
  }

  for (const project of projects) {
    if (!employeeIdSet.has(String(project.managerId))) {
      issues.push({ level: "ERROR", message: `Project ${project.projectId} orphan managerId` });
    }
    for (const member of project.members ?? []) {
      if (!employeeIdSet.has(String(member))) {
        issues.push({ level: "ERROR", message: `Project ${project.projectId} orphan member` });
      }
    }
    if (project.customerId && !customerIdSet.has(String(project.customerId))) {
      issues.push({ level: "ERROR", message: `Project ${project.projectId} orphan customerId` });
    }
  }

  for (const task of tasks) {
    if (!employeeIdSet.has(String(task.assignedTo))) {
      issues.push({ level: "ERROR", message: `Task ${task.taskId} orphan assignedTo` });
    }
    if (task.projectId && !projectIdSet.has(String(task.projectId))) {
      issues.push({ level: "ERROR", message: `Task ${task.taskId} orphan projectId` });
    }
    if (task.customerId && !customerIdSet.has(String(task.customerId))) {
      issues.push({ level: "ERROR", message: `Task ${task.taskId} orphan customerId` });
    }
    if (task.meetingId && !meetingIdSet.has(String(task.meetingId))) {
      issues.push({ level: "ERROR", message: `Task ${task.taskId} orphan meetingId` });
    }
  }

  for (const meeting of meetings) {
    if (!userIdSet.has(String(meeting.organizerId))) {
      issues.push({ level: "ERROR", message: `Meeting ${meeting.meetingId} orphan organizerId` });
    }
    for (const participant of meeting.participants ?? []) {
      if (!employeeIdSet.has(String(participant))) {
        issues.push({ level: "ERROR", message: `Meeting ${meeting.meetingId} orphan participant` });
      }
    }
  }

  for (const lead of leads) {
    if (lead.assignedTo && !employeeIdSet.has(String(lead.assignedTo))) {
      issues.push({ level: "ERROR", message: `Lead ${lead.leadId} orphan assignedTo` });
    }
    if (lead.convertedCustomerId && !customerIdSet.has(String(lead.convertedCustomerId))) {
      issues.push({ level: "ERROR", message: `Lead ${lead.leadId} orphan convertedCustomerId` });
    }
    if (lead.convertedOpportunityId && !opportunityIdSet.has(String(lead.convertedOpportunityId))) {
      issues.push({ level: "ERROR", message: `Lead ${lead.leadId} orphan convertedOpportunityId` });
    }
  }

  for (const opportunity of opportunities) {
    if (!customerIdSet.has(String(opportunity.customerId))) {
      issues.push({ level: "ERROR", message: `Opportunity ${opportunity.opportunityId} orphan customerId` });
    }
    if (opportunity.leadId && !leadIdSet.has(String(opportunity.leadId))) {
      issues.push({ level: "ERROR", message: `Opportunity ${opportunity.opportunityId} orphan leadId` });
    }
    if (opportunity.projectId && !projectIdSet.has(String(opportunity.projectId))) {
      issues.push({ level: "ERROR", message: `Opportunity ${opportunity.opportunityId} orphan projectId` });
    }
  }

  for (const activity of activities) {
    if (!employeeIdSet.has(String(activity.employeeId))) {
      issues.push({ level: "ERROR", message: `SalesActivity ${activity.activityId} orphan employeeId` });
    }
  }

  // Finance consistency
  const expenseByProject = new Map<string, number>();
  const balanceDelta = new Map<string, number>();
  for (const account of accounts) balanceDelta.set(String(account._id), 0);

  for (const txn of transactions) {
    if (!accountIdSet.has(String(txn.accountId))) {
      issues.push({ level: "ERROR", message: `Txn ${txn.transactionId} orphan accountId` });
    }
    if (txn.counterpartyAccountId && !accountIdSet.has(String(txn.counterpartyAccountId))) {
      issues.push({ level: "ERROR", message: `Txn ${txn.transactionId} orphan counterpartyAccountId` });
    }
    if (txn.categoryId && !categoryIdSet.has(String(txn.categoryId))) {
      issues.push({ level: "ERROR", message: `Txn ${txn.transactionId} orphan categoryId` });
    }
    if (txn.projectId && !projectIdSet.has(String(txn.projectId))) {
      issues.push({ level: "ERROR", message: `Txn ${txn.transactionId} orphan projectId` });
    }
    if (txn.status !== "COMPLETED") continue;
    const accountKey = String(txn.accountId);
    if (txn.type === "INCOME") balanceDelta.set(accountKey, (balanceDelta.get(accountKey) ?? 0) + Number(txn.amount));
    if (txn.type === "EXPENSE") {
      balanceDelta.set(accountKey, (balanceDelta.get(accountKey) ?? 0) - Number(txn.amount));
      if (txn.projectId) {
        const pk = String(txn.projectId);
        expenseByProject.set(pk, (expenseByProject.get(pk) ?? 0) + Number(txn.amount));
      }
    }
    if (txn.type === "TRANSFER") {
      balanceDelta.set(accountKey, (balanceDelta.get(accountKey) ?? 0) - Number(txn.amount));
      if (txn.counterpartyAccountId) {
        const ck = String(txn.counterpartyAccountId);
        balanceDelta.set(ck, (balanceDelta.get(ck) ?? 0) + Number(txn.amount));
      }
    }
  }

  for (const project of projects) {
    const expectedExpense = expenseByProject.get(String(project._id)) ?? 0;
    if (Number(project.actualExpense) !== expectedExpense) {
      issues.push({
        level: "ERROR",
        message: `Project ${project.projectId} actualExpense=${project.actualExpense} != completed expenses ${expectedExpense}`,
      });
    }
  }

  for (const account of accounts) {
    const expected = Number(account.openingBalance) + (balanceDelta.get(String(account._id)) ?? 0);
    if (Number(account.currentBalance) !== expected) {
      issues.push({
        level: "ERROR",
        message: `Account ${account.accountId} currentBalance=${account.currentBalance} != expected ${expected}`,
      });
    }
  }

  for (const budget of budgets) {
    if (budget.projectId && !projectIdSet.has(String(budget.projectId))) {
      issues.push({ level: "ERROR", message: `Budget ${budget.budgetId} orphan projectId` });
    }
    if (budget.categoryId && !categoryIdSet.has(String(budget.categoryId))) {
      issues.push({ level: "ERROR", message: `Budget ${budget.budgetId} orphan categoryId` });
    }
  }

  for (const notification of notifications) {
    if (!userIdSet.has(String(notification.recipientId))) {
      issues.push({ level: "ERROR", message: `Notification ${notification.notificationId} orphan recipientId` });
    }
  }

  for (const reminder of reminders) {
    if (!userIdSet.has(String(reminder.userId))) {
      issues.push({ level: "ERROR", message: `Reminder ${reminder.reminderId} orphan userId` });
    }
  }

  // Golden scenarios
  const sathish = employees.find((e) => e.employeeCode === GOLDEN.sathish.employeeCode);
  if (!sathish) issues.push({ level: "ERROR", message: "Golden Sathish employee missing" });
  else {
    const sathishTasks = tasks.filter((t) => String(t.assignedTo) === String(sathish._id));
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const hasPending = sathishTasks.some((t) => t.taskId === GOLDEN.tasks.sathishTodayPending && t.status === "PENDING");
    const hasDone = sathishTasks.some((t) => t.taskId === GOLDEN.tasks.sathishTodayCompleted && t.status === "COMPLETED");
    const hasOverdue = sathishTasks.some(
      (t) => t.taskId === GOLDEN.tasks.sathishOverdue && ["PENDING", "IN_PROGRESS"].includes(String(t.status)) && t.dueDate && new Date(t.dueDate) < now,
    );
    const hasMeeting = meetings.some(
      (m) => m.meetingId === GOLDEN.meetings.sathishToday && (m.participants ?? []).some((p) => String(p) === String(sathish._id)),
    );
    if (!hasPending) issues.push({ level: "ERROR", message: "Sathish missing today pending task" });
    if (!hasDone) issues.push({ level: "ERROR", message: "Sathish missing completed task" });
    if (!hasOverdue) issues.push({ level: "ERROR", message: "Sathish missing overdue task" });
    if (!hasMeeting) issues.push({ level: "ERROR", message: "Sathish missing today meeting" });
  }

  for (const gp of Object.values(GOLDEN.projects)) {
    const project = projects.find((p) => p.projectId === gp.projectId);
    if (!project) issues.push({ level: "ERROR", message: `Golden project missing ${gp.projectId}` });
    else if (project.status !== gp.status) {
      issues.push({ level: "WARN", message: `Golden project ${gp.projectId} status ${project.status} != ${gp.status}` });
    }
  }

  const md = users.find((u) => u.email === GOLDEN.mdEmail);
  if (!md) issues.push({ level: "ERROR", message: "Golden MD user missing" });

  const errors = issues.filter((i) => i.level === "ERROR");
  const warns = issues.filter((i) => i.level === "WARN");
  console.log("------------------------------------------------------------");
  console.log(`Company: ${ARCHNOVA.companyName}`);
  console.log(`Errors: ${errors.length}  Warnings: ${warns.length}`);
  for (const issue of issues) console.log(`[${issue.level}] ${issue.message}`);
  if (errors.length === 0) console.log("VALIDATION PASSED");
  else console.log("VALIDATION FAILED");
  return errors.length;
}

validate()
  .then((errorCount) => {
    process.exitCode = errorCount > 0 ? 1 : 0;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
  });

/**
 * ArchNova Technologies LLP — synthetic demo seed (data-only).
 *
 * Upserts by ArchNova deterministic IDs / @archnova.com emails.
 * Does NOT delete unrelated data and does NOT overwrite @office.local / SEED-* identities.
 */
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../../src/config/database";
import { env } from "../../src/config/env";
import { logger } from "../../src/config/logger";
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
import { normalizeCompanyName, normalizeEmail, normalizePhone } from "../../src/utils/normalize";
import { databaseNameFromUri } from "../../scripts/lib/perfGuard";
import { buildArchNovaDataset, countDataset } from "./demo_data/buildDataset";
import { dayOffset } from "./demo_data/catalog";
import { ARCHNOVA, EXPECTED_COUNTS, expectedTotal, GOLDEN } from "./demo_data/golden";

async function upsert(
  model: mongoose.Model<mongoose.Document>,
  query: Record<string, unknown>,
  doc: Record<string, unknown>,
): Promise<mongoose.Types.ObjectId> {
  const updated = await model.findOneAndUpdate(query, { $set: doc }, { new: true, upsert: true, setDefaultsOnInsert: true });
  if (!updated) throw new Error(`Failed to upsert ${model.modelName}`);
  return updated._id as mongoose.Types.ObjectId;
}

function assertSafeDatabase(uri: string): string {
  if (env.NODE_ENV === "production") {
    throw new Error("ArchNova seed refuses to run when NODE_ENV is production");
  }
  const name = databaseNameFromUri(uri);
  if (!name) throw new Error("Could not parse database name from MONGODB_URI");
  if (/performance/i.test(name)) {
    throw new Error(`ArchNova seed refused database "${name}". Use npm run seed:performance for that DB.`);
  }
  if (name === "ai_md_test") {
    throw new Error("ArchNova seed refused the automated test database");
  }
  return name;
}

function hourOffset(hours: number): Date {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(date.getUTCHours() + hours);
  return date;
}

async function seed(): Promise<void> {
  const dbName = assertSafeDatabase(env.MONGODB_URI);
  const uriRedacted = env.MONGODB_URI.replace(/:\/\/([^:/]+):([^@]+)@/, "://$1:***@");
  const dataset = buildArchNovaDataset();
  const counts = countDataset(dataset);

  console.log("============================================================");
  console.log("ARCHNOVA DEMO SEED — PRE-INSERT SUMMARY");
  console.log("============================================================");
  console.log(`Company narrative : ${ARCHNOVA.companyName}`);
  console.log(`NODE_ENV          : ${env.NODE_ENV}`);
  console.log(`Target URI        : ${uriRedacted}`);
  console.log(`Target database   : ${dbName}`);
  console.log(`Mode              : upsert (no deletes; preserves @office.local)`);
  console.log(`Expected totals   : ${JSON.stringify(EXPECTED_COUNTS)}`);
  console.log(`Generated totals  : ${JSON.stringify(counts)}`);
  console.log(`Approx upserts    : ${expectedTotal()} (~${Object.values(counts).reduce((a, b) => a + b, 0)} generated)`);
  console.log(`Golden MD email   : ${GOLDEN.mdEmail}`);
  console.log(`Golden Sathish    : ${GOLDEN.sathish.email}`);
  console.log("============================================================");

  await connectDatabase();
  const passwordHash = await bcrypt.hash(ARCHNOVA.password, 10);

  const userIds = new Map<string, mongoose.Types.ObjectId>();
  for (const user of dataset.users) {
    if (!user.email.endsWith(`@${ARCHNOVA.emailDomain}`)) {
      throw new Error(`Refusing non-ArchNova email: ${user.email}`);
    }
    const id = await upsert(User, { email: user.email.toLowerCase() }, {
      name: user.name,
      email: user.email.toLowerCase(),
      phone: user.phone,
      passwordHash,
      role: user.role,
      status: "ACTIVE",
      isActive: true,
    });
    userIds.set(user.key, id);
  }

  const employeeIds = new Map<string, mongoose.Types.ObjectId>();
  for (const employee of dataset.employees.filter((e) => !e.managerKey)) {
    const userId = userIds.get(employee.userKey);
    if (!userId) throw new Error(`Unknown user ${employee.userKey}`);
    const user = dataset.users.find((u) => u.key === employee.userKey)!;
    const id = await upsert(Employee, { employeeCode: employee.employeeCode }, {
      employeeId: employee.employeeId,
      userId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName: `${employee.firstName} ${employee.lastName}`,
      email: user.email.toLowerCase(),
      phone: user.phone,
      department: employee.department,
      designation: employee.designation,
      location: employee.location,
      employmentType: "FULL_TIME",
      status: "ACTIVE",
      managerId: null,
      joiningDate: dayOffset(-400),
    });
    employeeIds.set(employee.key, id);
  }
  for (const employee of dataset.employees.filter((e) => e.managerKey)) {
    const userId = userIds.get(employee.userKey);
    const managerId = employee.managerKey ? employeeIds.get(employee.managerKey) : null;
    if (!userId) throw new Error(`Unknown user ${employee.userKey}`);
    if (employee.managerKey && !managerId) throw new Error(`Unknown manager ${employee.managerKey}`);
    const user = dataset.users.find((u) => u.key === employee.userKey)!;
    const id = await upsert(Employee, { employeeCode: employee.employeeCode }, {
      employeeId: employee.employeeId,
      userId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName: `${employee.firstName} ${employee.lastName}`,
      email: user.email.toLowerCase(),
      phone: user.phone,
      department: employee.department,
      designation: employee.designation,
      location: employee.location,
      employmentType: "FULL_TIME",
      status: "ACTIVE",
      managerId: managerId ?? null,
      joiningDate: dayOffset(-300),
    });
    employeeIds.set(employee.key, id);
  }

  const createdBy = userIds.get("admin") ?? userIds.get("md");
  if (!createdBy) throw new Error("Missing admin/md user");

  const categoryIds = new Map<string, mongoose.Types.ObjectId>();
  for (const category of dataset.categories) {
    const id = await upsert(FinanceCategory, { categoryId: category.categoryId }, {
      categoryId: category.categoryId,
      name: category.name,
      code: category.code,
      type: category.type,
      description: category.description,
      status: "ACTIVE",
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    categoryIds.set(category.code, id);
  }

  const accountIds = new Map<string, mongoose.Types.ObjectId>();
  for (const account of dataset.accounts) {
    const id = await upsert(Account, { accountId: account.accountId }, {
      accountId: account.accountId,
      name: account.name,
      code: account.code,
      type: account.type,
      description: account.description,
      openingBalance: account.openingBalance,
      currentBalance: account.currentBalance,
      currency: "INR",
      status: "ACTIVE",
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    accountIds.set(account.accountId, id);
  }

  // Leads first (without conversion refs), then customers, then opportunities, then backfill lead conversion
  const leadIds = new Map<string, mongoose.Types.ObjectId>();
  for (const lead of dataset.leads) {
    const assignedTo = employeeIds.get(lead.assigneeKey) ?? null;
    const id = await upsert(Lead, { leadId: lead.leadId }, {
      leadId: lead.leadId,
      name: lead.name,
      companyName: lead.companyName,
      email: lead.email,
      phone: lead.phone,
      alternatePhone: "",
      source: lead.source,
      industry: lead.industry,
      location: lead.location,
      description: lead.description,
      assignedTo,
      status: lead.status,
      priority: lead.priority,
      estimatedValue: lead.estimatedValue,
      expectedCloseDate: dayOffset(lead.closeOffsetDays),
      nextFollowUpAt: dayOffset(lead.followUpOffsetDays),
      convertedAt: lead.status === "CONVERTED" ? dayOffset(-20) : null,
      convertedCustomerId: null,
      convertedOpportunityId: null,
      emailNormalized: normalizeEmail(lead.email),
      phoneNormalized: normalizePhone(lead.phone),
      companyNameNormalized: normalizeCompanyName(lead.companyName),
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    leadIds.set(lead.leadId, id);
  }

  const customerIds = new Map<string, mongoose.Types.ObjectId>();
  for (const customer of dataset.customers) {
    const assignedTo = employeeIds.get(customer.assigneeKey) ?? null;
    const sourceLeadId = customer.sourceLeadId ? leadIds.get(customer.sourceLeadId) ?? null : null;
    const id = await upsert(Customer, { customerId: customer.customerId }, {
      customerId: customer.customerId,
      name: customer.name,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      alternatePhone: "",
      industry: customer.industry,
      location: customer.location,
      address: customer.address,
      taxIdentifier: "",
      assignedTo,
      sourceLeadId,
      status: customer.status,
      notes: customer.notes,
      emailNormalized: normalizeEmail(customer.email),
      phoneNormalized: normalizePhone(customer.phone),
      companyNameNormalized: normalizeCompanyName(customer.companyName),
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    customerIds.set(customer.customerId, id);
  }

  // Projects before opportunities that reference them
  const projectIds = new Map<string, mongoose.Types.ObjectId>();
  for (const project of dataset.projects) {
    const managerId = employeeIds.get(project.managerKey);
    if (!managerId) throw new Error(`Unknown project manager ${project.managerKey}`);
    const members = project.memberKeys.map((key) => {
      const id = employeeIds.get(key);
      if (!id) throw new Error(`Unknown project member ${key}`);
      return id;
    });
    const customerId = project.customerId ? customerIds.get(project.customerId) ?? null : null;
    const id = await upsert(Project, { projectId: project.projectId }, {
      projectId: project.projectId,
      code: project.code,
      name: project.name,
      description: project.description,
      location: project.location,
      projectType: project.projectType,
      managerId,
      members,
      customerId,
      status: project.status,
      progress: project.progress,
      budget: project.budget,
      actualExpense: project.actualExpense,
      startDate: dayOffset(project.startOffsetDays),
      expectedEndDate: dayOffset(project.endOffsetDays),
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    projectIds.set(project.projectId, id);
  }

  const opportunityIds = new Map<string, mongoose.Types.ObjectId>();
  for (const opportunity of dataset.opportunities) {
    const customerId = customerIds.get(opportunity.customerId);
    if (!customerId) throw new Error(`Unknown customer ${opportunity.customerId}`);
    const leadId = opportunity.leadId ? leadIds.get(opportunity.leadId) ?? null : null;
    const projectId = opportunity.projectId ? projectIds.get(opportunity.projectId) ?? null : null;
    const assignedTo = employeeIds.get(opportunity.assigneeKey) ?? null;
    const id = await upsert(Opportunity, { opportunityId: opportunity.opportunityId }, {
      opportunityId: opportunity.opportunityId,
      title: opportunity.title,
      customerId,
      leadId,
      projectId,
      assignedTo,
      stage: opportunity.stage,
      probability: opportunity.probability,
      estimatedValue: opportunity.estimatedValue,
      expectedCloseDate: dayOffset(opportunity.closeOffsetDays),
      description: opportunity.description,
      nextFollowUpAt: dayOffset(opportunity.followUpOffsetDays),
      lostReason: opportunity.lostReason ?? "",
      wonAt: opportunity.stage === "WON" ? dayOffset(-5) : null,
      lostAt: opportunity.stage === "LOST" ? dayOffset(-3) : null,
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    opportunityIds.set(opportunity.opportunityId, id);
  }

  // Backfill converted leads
  for (const lead of dataset.leads.filter((l) => l.status === "CONVERTED")) {
    const leadObjectId = leadIds.get(lead.leadId);
    const customerObjectId = lead.convertedCustomerId ? customerIds.get(lead.convertedCustomerId) : null;
    const opportunityObjectId = lead.convertedOpportunityId ? opportunityIds.get(lead.convertedOpportunityId) : null;
    if (!leadObjectId) continue;
    await Lead.updateOne(
      { _id: leadObjectId },
      {
        $set: {
          status: "CONVERTED",
          convertedAt: dayOffset(-20),
          convertedCustomerId: customerObjectId ?? null,
          convertedOpportunityId: opportunityObjectId ?? null,
        },
      },
    );
  }

  for (const activity of dataset.salesActivities) {
    const employeeId = employeeIds.get(activity.employeeKey);
    if (!employeeId) throw new Error(`Unknown sales employee ${activity.employeeKey}`);
    await upsert(SalesActivity, { activityId: activity.activityId }, {
      activityId: activity.activityId,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      leadId: activity.leadId ? leadIds.get(activity.leadId) ?? null : null,
      customerId: activity.customerId ? customerIds.get(activity.customerId) ?? null : null,
      opportunityId: activity.opportunityId ? opportunityIds.get(activity.opportunityId) ?? null : null,
      employeeId,
      scheduledAt: dayOffset(activity.scheduledOffsetDays),
      completedAt: activity.status === "COMPLETED" ? dayOffset(activity.scheduledOffsetDays) : null,
      status: activity.status,
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
  }

  const meetingIds = new Map<string, mongoose.Types.ObjectId>();
  for (const meeting of dataset.meetings) {
    const organizerId = userIds.get(meeting.organizerKey);
    if (!organizerId) throw new Error(`Unknown organizer ${meeting.organizerKey}`);
    const participants = meeting.participantKeys.map((key) => {
      const id = employeeIds.get(key);
      if (!id) throw new Error(`Unknown participant ${key}`);
      return id;
    });
    const startTime = hourOffset(meeting.startOffsetHours);
    const endTime = new Date(startTime.getTime() + meeting.durationHours * 60 * 60 * 1000);
    const id = await upsert(Meeting, { meetingId: meeting.meetingId }, {
      meetingId: meeting.meetingId,
      title: meeting.title,
      description: meeting.description,
      meetingType: meeting.meetingType,
      organizerId,
      participants,
      projectId: meeting.projectId ? projectIds.get(meeting.projectId) ?? null : null,
      customerId: meeting.customerId ? customerIds.get(meeting.customerId) ?? null : null,
      location: meeting.location,
      startTime,
      endTime,
      timezone: "Asia/Kolkata",
      status: meeting.status,
      notes: "",
      cancellationReason: "",
      cancelledAt: meeting.status === "CANCELLED" ? startTime : null,
      completedAt: meeting.status === "COMPLETED" ? endTime : null,
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    meetingIds.set(meeting.meetingId, id);
  }

  for (const task of dataset.tasks) {
    const assignedTo = employeeIds.get(task.assigneeKey);
    if (!assignedTo) throw new Error(`Unknown assignee ${task.assigneeKey}`);
    const dueDate = dayOffset(task.dueOffsetDays);
    await upsert(Task, { taskId: task.taskId }, {
      taskId: task.taskId,
      title: task.title,
      description: task.description,
      assignedTo,
      createdBy,
      projectId: task.projectId ? projectIds.get(task.projectId) ?? null : null,
      customerId: task.customerId ? customerIds.get(task.customerId) ?? null : null,
      meetingId: task.meetingId ? meetingIds.get(task.meetingId) ?? null : null,
      priority: task.priority,
      status: task.status,
      dueDate,
      reminderAt: null,
      startedAt: task.status === "IN_PROGRESS" || task.status === "COMPLETED" ? dayOffset(task.dueOffsetDays - 1) : null,
      completedAt: task.status === "COMPLETED" ? dayOffset(task.completedOffsetDays ?? task.dueOffsetDays) : null,
      cancelledAt: task.status === "CANCELLED" ? dueDate : null,
      completionNote: task.status === "COMPLETED" ? "Completed in ArchNova demo seed" : "",
      cancellationReason: task.status === "CANCELLED" ? "Cancelled in demo seed" : "",
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
  }

  // Link golden meeting -> task after both exist
  const goldenMeeting = meetingIds.get(GOLDEN.meetings.sathishToday);
  const goldenTask = await Task.findOne({ taskId: GOLDEN.tasks.sathishTodayPending });
  if (goldenMeeting && goldenTask) {
    await Task.updateOne({ _id: goldenTask._id }, { $set: { meetingId: goldenMeeting } });
  }

  for (const txn of dataset.transactions) {
    const accountId = accountIds.get(txn.accountId);
    if (!accountId) throw new Error(`Unknown account ${txn.accountId}`);
    await upsert(FinanceTransaction, { transactionId: txn.transactionId }, {
      transactionId: txn.transactionId,
      type: txn.type,
      accountId,
      counterpartyAccountId: txn.counterpartyAccountId ? accountIds.get(txn.counterpartyAccountId) ?? null : null,
      categoryId: txn.categoryCode ? categoryIds.get(txn.categoryCode) ?? null : null,
      amount: txn.amount,
      currency: "INR",
      description: txn.description,
      referenceType: txn.projectId ? "PROJECT" : txn.type === "TRANSFER" ? "TRANSFER" : "MANUAL",
      referenceId: txn.projectId ?? "",
      projectId: txn.projectId ? projectIds.get(txn.projectId) ?? null : null,
      customerId: txn.customerId ? customerIds.get(txn.customerId) ?? null : null,
      opportunityId: txn.opportunityId ? opportunityIds.get(txn.opportunityId) ?? null : null,
      transactionDate: dayOffset(txn.dayOffset),
      status: txn.status,
      paymentMethod: txn.paymentMethod,
      externalReference: "",
      idempotencyKey: txn.idempotencyKey,
      notes: "ArchNova synthetic finance",
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
  }

  for (const budget of dataset.budgets) {
    const projectId = projectIds.get(budget.projectId);
    const categoryId = categoryIds.get(budget.categoryCode);
    if (!projectId || !categoryId) throw new Error(`Budget refs missing for ${budget.budgetId}`);
    await upsert(Budget, { budgetId: budget.budgetId }, {
      budgetId: budget.budgetId,
      name: budget.name,
      projectId,
      categoryId,
      amount: budget.amount,
      currency: "INR",
      periodStart: dayOffset(budget.periodStartOffset),
      periodEnd: dayOffset(budget.periodEndOffset),
      status: "ACTIVE",
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
  }

  for (const notification of dataset.notifications) {
    const recipientId = userIds.get(notification.recipientKey);
    if (!recipientId) throw new Error(`Unknown recipient ${notification.recipientKey}`);
    await upsert(Notification, { notificationId: notification.notificationId }, {
      notificationId: notification.notificationId,
      recipientId,
      type: notification.type,
      category: notification.category,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      isRead: notification.isRead,
      readAt: notification.isRead ? dayOffset(-1) : null,
      status: "SENT",
      sourceType: notification.sourceType,
      sourceId: null,
      actionUrl: "",
      metadata: { company: ARCHNOVA.companyName },
      reminderId: "",
      occurrenceKey: "",
      sentAt: dayOffset(-1),
      expiresAt: null,
      deliveryAttempts: 1,
      lastAttemptAt: dayOffset(-1),
      failureReason: "",
      isDeleted: false,
      deletedAt: null,
    });
  }

  for (const reminder of dataset.reminders) {
    const userId = userIds.get(reminder.userKey);
    const createdByUser = userIds.get(reminder.createdByKey) ?? createdBy;
    if (!userId) throw new Error(`Unknown reminder user ${reminder.userKey}`);
    const scheduledAt = dayOffset(reminder.scheduledOffsetDays, 9, 30);
    await upsert(Reminder, { reminderId: reminder.reminderId }, {
      reminderId: reminder.reminderId,
      userId,
      createdBy: createdByUser,
      title: reminder.title,
      description: reminder.description,
      reminderType: reminder.reminderType,
      sourceType: reminder.sourceType,
      sourceId: null,
      scheduledAt,
      timezone: "Asia/Kolkata",
      priority: reminder.priority,
      status: reminder.status,
      recurrence: { enabled: false, frequency: "WEEKLY", interval: 1, daysOfWeek: [], endAt: null },
      actionUrl: "",
      metadata: { company: ARCHNOVA.companyName },
      triggeredAt: reminder.status === "TRIGGERED" || reminder.status === "COMPLETED" ? scheduledAt : null,
      completedAt: reminder.status === "COMPLETED" ? scheduledAt : null,
      cancelledAt: reminder.status === "CANCELLED" ? scheduledAt : null,
      lastProcessedAt: null,
      nextRunAt: scheduledAt,
      processingAttempts: 0,
      failureReason: "",
    });
  }

  logger.info(
    {
      dbName,
      counts,
      passwordHint: ARCHNOVA.password,
      login: [GOLDEN.mdEmail, GOLDEN.adminEmail, GOLDEN.sathish.email],
    },
    "ArchNova demo seed completed",
  );
  console.log("Seed insert/upsert finished successfully.");
  console.log(`Login password for all ArchNova users: ${ARCHNOVA.password}`);
}

seed()
  .catch((error) => {
    logger.error({ err: error }, "ArchNova demo seed failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => undefined);
  });

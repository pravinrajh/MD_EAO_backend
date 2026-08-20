import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../src/config/database";
import { env } from "../src/config/env";
import { logger } from "../src/config/logger";
import { Customer } from "../src/models/Customer";
import { Employee } from "../src/models/Employee";
import { Lead } from "../src/models/Lead";
import { Meeting } from "../src/models/Meeting";
import { Opportunity } from "../src/models/Opportunity";
import { Project } from "../src/models/Project";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { databaseNameFromUri } from "./lib/perfGuard";
import { normalizeCompanyName, normalizeEmail, normalizePhone } from "../src/utils/normalize";

type SeedFile = {
  password: string;
  users: Array<{ key: string; name: string; email: string; phone: string; role: Role }>;
  employees: Array<{
    key: string;
    user: string;
    employeeId: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department: string;
    designation: string;
    location: string;
    manager?: string;
  }>;
  projects: Array<{
    projectId: string;
    code: string;
    name: string;
    description: string;
    location: string;
    projectType: string;
    manager: string;
    members: string[];
    status: string;
    progress: number;
    budget: number;
    actualExpense: number;
    startOffsetDays: number;
    endOffsetDays: number;
    customer?: string;
  }>;
  tasks: Array<{
    taskId: string;
    title: string;
    description: string;
    assignee: string;
    project: string;
    priority: string;
    status: string;
    dueOffsetDays: number;
  }>;
  leads: Array<{
    leadId: string;
    name: string;
    companyName: string;
    email: string;
    phone: string;
    source: string;
    industry: string;
    location: string;
    description: string;
    assignee: string;
    status: string;
    priority: string;
    estimatedValue: number;
    closeOffsetDays: number;
    followUpOffsetDays: number;
  }>;
  customers: Array<{
    customerId: string;
    name: string;
    companyName: string;
    email: string;
    phone: string;
    industry: string;
    location: string;
    address: string;
    assignee: string;
    sourceLead?: string;
    status: string;
    notes: string;
  }>;
  opportunities: Array<{
    opportunityId: string;
    title: string;
    customer: string;
    lead?: string;
    project?: string;
    assignee: string;
    stage: string;
    probability: number;
    estimatedValue: number;
    closeOffsetDays: number;
    followUpOffsetDays: number;
    description: string;
  }>;
  meetings: Array<{
    meetingId: string;
    title: string;
    description: string;
    meetingType: string;
    organizer: string;
    participants: string[];
    project?: string;
    customer?: string;
    location: string;
    startOffsetHours: number;
    durationHours: number;
    status: string;
    linkedTask?: string;
  }>;
};

function offsetDate(days: number): Date {
  const date = new Date();
  date.setUTCHours(10, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function assertDemoDatabase(uri: string): string {
  if (env.NODE_ENV === "production") {
    throw new Error("Demo seed refuses to run when NODE_ENV is production");
  }
  const name = databaseNameFromUri(uri);
  if (!name) {
    throw new Error("Could not parse database name from MONGODB_URI");
  }
  if (/performance/i.test(name)) {
    throw new Error(`Demo seed refused database "${name}". Use npm run seed:performance for that DB.`);
  }
  if (name === "ai_md_test") {
    throw new Error("Demo seed refused the automated test database");
  }
  return name;
}

async function upsert<T extends Record<string, unknown>>(
  model: mongoose.Model<mongoose.Document>,
  query: Record<string, unknown>,
  doc: T,
): Promise<mongoose.Types.ObjectId> {
  const updated = await model.findOneAndUpdate(query, { $set: doc }, { new: true, upsert: true, setDefaultsOnInsert: true });
  if (!updated) throw new Error(`Failed to upsert ${model.modelName}`);
  return updated._id as mongoose.Types.ObjectId;
}

async function seedDemo(): Promise<void> {
  const dbName = assertDemoDatabase(env.MONGODB_URI);
  const file = path.resolve(process.cwd(), "seed/demo.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as SeedFile;

  await connectDatabase();
  const passwordHash = await bcrypt.hash(data.password, 10);
  const now = new Date();

  const userIds = new Map<string, mongoose.Types.ObjectId>();
  for (const user of data.users) {
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
  for (const employee of data.employees.filter((item) => !item.manager)) {
    const userId = userIds.get(employee.user);
    if (!userId) throw new Error(`Unknown user key ${employee.user}`);
    const id = await upsert(Employee, { employeeCode: employee.employeeCode }, {
      employeeId: employee.employeeId,
      userId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName: `${employee.firstName} ${employee.lastName}`,
      email: data.users.find((item) => item.key === employee.user)?.email.toLowerCase(),
      phone: data.users.find((item) => item.key === employee.user)?.phone ?? "",
      department: employee.department,
      designation: employee.designation,
      location: employee.location,
      employmentType: "FULL_TIME",
      status: "ACTIVE",
      managerId: null,
    });
    employeeIds.set(employee.key, id);
  }
  for (const employee of data.employees.filter((item) => item.manager)) {
    const userId = userIds.get(employee.user);
    const managerId = employee.manager ? employeeIds.get(employee.manager) : null;
    if (!userId) throw new Error(`Unknown user key ${employee.user}`);
    const id = await upsert(Employee, { employeeCode: employee.employeeCode }, {
      employeeId: employee.employeeId,
      userId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName: `${employee.firstName} ${employee.lastName}`,
      email: data.users.find((item) => item.key === employee.user)?.email.toLowerCase(),
      phone: data.users.find((item) => item.key === employee.user)?.phone ?? "",
      department: employee.department,
      designation: employee.designation,
      location: employee.location,
      employmentType: "FULL_TIME",
      status: "ACTIVE",
      managerId: managerId ?? null,
    });
    employeeIds.set(employee.key, id);
  }

  const createdBy = userIds.get("admin") ?? userIds.get("md");
  if (!createdBy) throw new Error("Seed file must include an admin or md user");

  const projectIds = new Map<string, mongoose.Types.ObjectId>();
  for (const project of data.projects) {
    const managerId = employeeIds.get(project.manager);
    if (!managerId) throw new Error(`Unknown project manager ${project.manager}`);
    const members = project.members.map((key) => {
      const id = employeeIds.get(key);
      if (!id) throw new Error(`Unknown project member ${key}`);
      return id;
    });
    const id = await upsert(Project, { projectId: project.projectId }, {
      projectId: project.projectId,
      code: project.code,
      name: project.name,
      description: project.description,
      location: project.location,
      projectType: project.projectType,
      managerId,
      members,
      status: project.status,
      progress: project.progress,
      budget: project.budget,
      actualExpense: project.actualExpense,
      startDate: offsetDate(project.startOffsetDays),
      expectedEndDate: offsetDate(project.endOffsetDays),
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    projectIds.set(project.code, id);
  }

  for (const task of data.tasks) {
    const assignedTo = employeeIds.get(task.assignee);
    const projectId = projectIds.get(task.project);
    if (!assignedTo) throw new Error(`Unknown task assignee ${task.assignee}`);
    if (!projectId) throw new Error(`Unknown task project ${task.project}`);
    const dueDate = offsetDate(task.dueOffsetDays);
    await upsert(Task, { taskId: task.taskId }, {
      taskId: task.taskId,
      title: task.title,
      description: task.description,
      assignedTo,
      createdBy,
      projectId,
      priority: task.priority,
      status: task.status,
      dueDate,
      startedAt: task.status === "IN_PROGRESS" || task.status === "COMPLETED" ? offsetDate(task.dueOffsetDays - 3) : null,
      completedAt: task.status === "COMPLETED" ? now : null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
  }

  const leadIds = new Map<string, mongoose.Types.ObjectId>();
  for (const lead of data.leads) {
    const assignedTo = employeeIds.get(lead.assignee);
    if (!assignedTo) throw new Error(`Unknown lead assignee ${lead.assignee}`);
    const id = await upsert(Lead, { leadId: lead.leadId }, {
      leadId: lead.leadId,
      name: lead.name,
      companyName: lead.companyName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      industry: lead.industry,
      location: lead.location,
      description: lead.description,
      assignedTo,
      status: lead.status,
      priority: lead.priority,
      estimatedValue: lead.estimatedValue,
      expectedCloseDate: offsetDate(lead.closeOffsetDays),
      nextFollowUpAt: offsetDate(lead.followUpOffsetDays),
      convertedAt: lead.status === "CONVERTED" ? now : null,
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
  for (const customer of data.customers) {
    const assignedTo = employeeIds.get(customer.assignee);
    if (!assignedTo) throw new Error(`Unknown customer assignee ${customer.assignee}`);
    const id = await upsert(Customer, { customerId: customer.customerId }, {
      customerId: customer.customerId,
      name: customer.name,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      industry: customer.industry,
      location: customer.location,
      address: customer.address,
      assignedTo,
      sourceLeadId: customer.sourceLead ? leadIds.get(customer.sourceLead) ?? null : null,
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

  const opportunityIds = new Map<string, mongoose.Types.ObjectId>();
  for (const opportunity of data.opportunities) {
    const customerId = customerIds.get(opportunity.customer);
    const assignedTo = employeeIds.get(opportunity.assignee);
    if (!customerId) throw new Error(`Unknown opportunity customer ${opportunity.customer}`);
    if (!assignedTo) throw new Error(`Unknown opportunity assignee ${opportunity.assignee}`);
    const id = await upsert(Opportunity, { opportunityId: opportunity.opportunityId }, {
      opportunityId: opportunity.opportunityId,
      title: opportunity.title,
      customerId,
      leadId: opportunity.lead ? leadIds.get(opportunity.lead) ?? null : null,
      projectId: opportunity.project ? projectIds.get(opportunity.project) ?? null : null,
      assignedTo,
      stage: opportunity.stage,
      probability: opportunity.probability,
      estimatedValue: opportunity.estimatedValue,
      expectedCloseDate: offsetDate(opportunity.closeOffsetDays),
      nextFollowUpAt: offsetDate(opportunity.followUpOffsetDays),
      description: opportunity.description,
      createdBy,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    opportunityIds.set(opportunity.opportunityId, id);

    if (opportunity.project) {
      const projectObjectId = projectIds.get(opportunity.project);
      if (projectObjectId) {
        await Project.updateOne(
          { _id: projectObjectId, $or: [{ customerId: null }, { customerId: { $exists: false } }] },
          { $set: { customerId } },
        );
      }
    }
  }

  for (const customer of data.customers) {
    if (!customer.sourceLead) continue;
    const lead = data.leads.find((item) => item.leadId === customer.sourceLead);
    if (lead?.status !== "CONVERTED") continue;
    const opportunity = data.opportunities.find((item) => item.lead === customer.sourceLead);
    await Lead.updateOne(
      { leadId: customer.sourceLead },
      {
        $set: {
          convertedCustomerId: customerIds.get(customer.customerId) ?? null,
          convertedOpportunityId: opportunity ? opportunityIds.get(opportunity.opportunityId) ?? null : null,
          convertedAt: now,
        },
      },
    );
  }

  for (const projectObjectId of projectIds.values()) {
    const project = await Project.findById(projectObjectId).select("customerId").lean();
    if (!project?.customerId) continue;
    await Task.updateMany({ projectId: projectObjectId }, { $set: { customerId: project.customerId } });
  }

  const meetingIds = new Map<string, mongoose.Types.ObjectId>();
  for (const meeting of data.meetings ?? []) {
    const organizerId = userIds.get(meeting.organizer);
    if (!organizerId) throw new Error(`Unknown meeting organizer ${meeting.organizer}`);
    const participants = meeting.participants.map((key) => {
      const id = employeeIds.get(key);
      if (!id) throw new Error(`Unknown meeting participant ${key}`);
      return id;
    });
    const startTime = new Date(Date.now() + meeting.startOffsetHours * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + meeting.durationHours * 60 * 60 * 1000);
    const id = await upsert(Meeting, { meetingId: meeting.meetingId }, {
      meetingId: meeting.meetingId,
      title: meeting.title,
      description: meeting.description,
      meetingType: meeting.meetingType,
      organizerId,
      createdBy,
      participants,
      projectId: meeting.project ? projectIds.get(meeting.project) ?? null : null,
      customerId: meeting.customer ? customerIds.get(meeting.customer) ?? null : null,
      location: meeting.location,
      startTime,
      endTime,
      timezone: "Asia/Kolkata",
      status: meeting.status,
      notes: "",
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
    meetingIds.set(meeting.meetingId, id);
    if (meeting.linkedTask) {
      await Task.updateOne({ taskId: meeting.linkedTask }, { $set: { meetingId: id } });
    }
  }

  logger.info(
    {
      dbName,
      users: data.users.length,
      employees: data.employees.length,
      projects: data.projects.length,
      tasks: data.tasks.length,
      leads: data.leads.length,
      customers: data.customers.length,
      opportunities: data.opportunities.length,
      meetings: data.meetings?.length ?? 0,
      login: "md@office.local / admin@office.local / raj@office.local",
    },
    "Demo seed completed",
  );
  await disconnectDatabase();
}

seedDemo().catch((error) => {
  logger.fatal({ err: error }, "Demo seed failed");
  process.exit(1);
});

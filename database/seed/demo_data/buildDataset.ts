import { ARCHNOVA, EXPECTED_COUNTS, GOLDEN } from "./golden";
import {
  ACCOUNTS,
  COMPANY_SUFFIXES,
  CUSTOMER_FIRST,
  EXPENSE_CATEGORIES,
  FIRST_NAMES,
  INCOME_CATEGORIES,
  LAST_NAMES,
  createRng,
  dayOffset,
  pad,
  pick,
  pickCity,
  syntheticPhone,
} from "./catalog";

export type Role = "MD" | "ADMIN" | "MANAGER" | "EMPLOYEE";

export type SeedUser = {
  key: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
};

export type SeedEmployee = {
  key: string;
  userKey: string;
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string;
  designation: string;
  location: string;
  managerKey?: string;
};

export type SeedCustomer = {
  customerId: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  industry: string;
  location: string;
  address: string;
  assigneeKey: string;
  sourceLeadId?: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  notes: string;
};

export type SeedLead = {
  leadId: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  source: string;
  industry: string;
  location: string;
  description: string;
  assigneeKey: string;
  status: string;
  priority: string;
  estimatedValue: number;
  closeOffsetDays: number;
  followUpOffsetDays: number;
  convertedCustomerId?: string;
  convertedOpportunityId?: string;
};

export type SeedOpportunity = {
  opportunityId: string;
  title: string;
  customerId: string;
  leadId?: string;
  projectId?: string;
  assigneeKey: string;
  stage: string;
  probability: number;
  estimatedValue: number;
  closeOffsetDays: number;
  followUpOffsetDays: number;
  description: string;
  lostReason?: string;
};

export type SeedSalesActivity = {
  activityId: string;
  type: string;
  title: string;
  description: string;
  leadId?: string;
  customerId?: string;
  opportunityId?: string;
  employeeKey: string;
  scheduledOffsetDays: number;
  status: string;
};

export type SeedProject = {
  projectId: string;
  code: string;
  name: string;
  description: string;
  location: string;
  projectType: string;
  managerKey: string;
  memberKeys: string[];
  customerId?: string;
  status: string;
  progress: number;
  budget: number;
  actualExpense: number;
  startOffsetDays: number;
  endOffsetDays: number;
};

export type SeedTask = {
  taskId: string;
  title: string;
  description: string;
  assigneeKey: string;
  projectId?: string;
  customerId?: string;
  meetingId?: string;
  priority: string;
  status: string;
  dueOffsetDays: number;
  completedOffsetDays?: number;
};

export type SeedMeeting = {
  meetingId: string;
  title: string;
  description: string;
  meetingType: string;
  organizerKey: string;
  participantKeys: string[];
  projectId?: string;
  customerId?: string;
  location: string;
  startOffsetHours: number;
  durationHours: number;
  status: string;
  linkedTaskId?: string;
};

export type SeedAccount = {
  accountId: string;
  name: string;
  code: string;
  type: string;
  description: string;
  openingBalance: number;
  currentBalance: number;
};

export type SeedCategory = {
  categoryId: string;
  name: string;
  code: string;
  type: "INCOME" | "EXPENSE";
  description: string;
};

export type SeedTxn = {
  transactionId: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  accountId: string;
  counterpartyAccountId?: string;
  categoryCode?: string;
  amount: number;
  description: string;
  projectId?: string;
  customerId?: string;
  opportunityId?: string;
  dayOffset: number;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  paymentMethod: string;
  idempotencyKey: string;
};

export type SeedBudget = {
  budgetId: string;
  name: string;
  projectId: string;
  categoryCode: string;
  amount: number;
  periodStartOffset: number;
  periodEndOffset: number;
};

export type SeedNotification = {
  notificationId: string;
  recipientKey: string;
  type: string;
  category: string;
  title: string;
  message: string;
  priority: string;
  sourceType: string;
  isRead: boolean;
};

export type SeedReminder = {
  reminderId: string;
  userKey: string;
  createdByKey: string;
  title: string;
  description: string;
  reminderType: string;
  sourceType: string;
  scheduledOffsetDays: number;
  priority: string;
  status: string;
};

export type ArchNovaDataset = {
  users: SeedUser[];
  employees: SeedEmployee[];
  customers: SeedCustomer[];
  leads: SeedLead[];
  opportunities: SeedOpportunity[];
  salesActivities: SeedSalesActivity[];
  projects: SeedProject[];
  tasks: SeedTask[];
  meetings: SeedMeeting[];
  accounts: SeedAccount[];
  categories: SeedCategory[];
  transactions: SeedTxn[];
  budgets: SeedBudget[];
  notifications: SeedNotification[];
  reminders: SeedReminder[];
};

const LEAD_SOURCES = ["WEBSITE", "REFERRAL", "PHONE", "EMAIL", "SOCIAL_MEDIA", "ADVERTISEMENT", "EVENT", "DIRECT", "OTHER"] as const;
const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED", "LOST"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const OPP_STAGES = ["NEW", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
const OPP_PROB: Record<string, number> = {
  NEW: 10,
  QUALIFICATION: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};
const PROJECT_TYPES = ["RESIDENTIAL", "COMMERCIAL", "INFRASTRUCTURE", "LAND_DEVELOPMENT", "INTERNAL", "OTHER"] as const;
const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "AT_RISK"] as const;
const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const MEETING_TYPES = ["INTERNAL", "CLIENT", "VENDOR", "PROJECT_REVIEW", "TEAM", "MANAGEMENT", "SITE_VISIT", "OTHER"] as const;
const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "FOLLOW_UP", "SITE_VISIT", "NOTE", "OTHER"] as const;

function personName(rng: () => number, i: number): { first: string; last: string } {
  return {
    first: FIRST_NAMES[i % FIRST_NAMES.length]!,
    last: LAST_NAMES[(i * 3) % LAST_NAMES.length]!,
  };
}

function emailLocal(first: string, last: string, suffix = ""): string {
  return `${first}.${last}${suffix}`.toLowerCase().replace(/[^a-z0-9.]/g, "");
}

export function buildArchNovaDataset(): ArchNovaDataset {
  const rng = createRng(20260821);
  const users: SeedUser[] = [];
  const employees: SeedEmployee[] = [];

  // --- Core leadership ---
  users.push({
    key: "md",
    name: "Venkatesh Menon",
    email: GOLDEN.mdEmail,
    phone: "9001000001",
    role: "MD",
  });
  employees.push({
    key: "md",
    userKey: "md",
    employeeId: "AN-EMP-MD",
    employeeCode: "AN-E-MD",
    firstName: "Venkatesh",
    lastName: "Menon",
    department: "Management",
    designation: "Managing Director",
    location: "Anna Nagar, Chennai",
  });

  users.push({
    key: "admin",
    name: "Lakshmi Admin",
    email: GOLDEN.adminEmail,
    phone: "9001000002",
    role: "ADMIN",
  });
  employees.push({
    key: "admin",
    userKey: "admin",
    employeeId: "AN-EMP-ADMIN",
    employeeCode: "AN-E-ADMIN",
    firstName: "Lakshmi",
    lastName: "Admin",
    department: "Operations",
    designation: "System Administrator",
    location: "Guindy, Chennai",
    managerKey: "md",
  });

  const managerDefs: Array<{ key: string; dept: string; designation: string; first: string; last: string }> = [
    { key: "mgr_projects", dept: "Projects", designation: "Projects Manager", first: "Anand", last: "Kumar" },
    { key: "mgr_construction", dept: "Construction", designation: "Construction Manager", first: "Ravi", last: "Shankar" },
    { key: "mgr_interior", dept: "Interior", designation: "Interior Manager", first: "Meera", last: "Natarajan" },
    { key: "mgr_sales", dept: "Sales", designation: "Sales Manager", first: "Karthik", last: "Selvam" },
    { key: "mgr_crm", dept: "CRM", designation: "CRM Manager", first: "Divya", last: "Prasad" },
    { key: "mgr_finance", dept: "Finance", designation: "Finance Manager", first: "Suresh", last: "Iyer" },
    { key: "mgr_procurement", dept: "Procurement", designation: "Procurement Manager", first: "Nisha", last: "Rajan" },
    { key: "mgr_operations", dept: "Operations", designation: "Operations Manager", first: "Arjun", last: "Balaji" },
    { key: "mgr_hr", dept: "HR", designation: "HR Manager", first: "Kavitha", last: "Murugan" },
  ];

  managerDefs.forEach((m, idx) => {
    users.push({
      key: m.key,
      name: `${m.first} ${m.last}`,
      email: `${emailLocal(m.first, m.last)}@${ARCHNOVA.emailDomain}`,
      phone: syntheticPhone(rng, 100 + idx),
      role: "MANAGER",
    });
    employees.push({
      key: m.key,
      userKey: m.key,
      employeeId: `AN-EMP-MGR-${pad(idx + 1, 2)}`,
      employeeCode: `AN-E-MGR-${pad(idx + 1, 2)}`,
      firstName: m.first,
      lastName: m.last,
      department: m.dept,
      designation: m.designation,
      location: pickCity(rng).label,
      managerKey: "md",
    });
  });

  // Sathish under construction manager
  users.push({
    key: GOLDEN.sathish.key,
    name: `${GOLDEN.sathish.firstName} ${GOLDEN.sathish.lastName}`,
    email: GOLDEN.sathish.email,
    phone: "9001000099",
    role: "EMPLOYEE",
  });
  employees.push({
    key: GOLDEN.sathish.key,
    userKey: GOLDEN.sathish.key,
    employeeId: GOLDEN.sathish.employeeId,
    employeeCode: GOLDEN.sathish.employeeCode,
    firstName: GOLDEN.sathish.firstName,
    lastName: GOLDEN.sathish.lastName,
    department: "Construction",
    designation: "Site Engineer",
    location: "Sholinganallur, Chennai",
    managerKey: "mgr_construction",
  });

  const managerKeys = managerDefs.map((m) => m.key);
  let empIndex = 1;
  while (users.length < EXPECTED_COUNTS.users) {
    const { first, last } = personName(rng, empIndex + 17);
    const key = `emp_${pad(empIndex, 3)}`;
    const mgr = managerKeys[empIndex % managerKeys.length]!;
    const dept = managerDefs.find((m) => m.key === mgr)!.dept;
    users.push({
      key,
      name: `${first} ${last}`,
      email: `${emailLocal(first, last, empIndex)}@${ARCHNOVA.emailDomain}`,
      phone: syntheticPhone(rng, 200 + empIndex),
      role: "EMPLOYEE",
    });
    employees.push({
      key,
      userKey: key,
      employeeId: `AN-EMP-${pad(empIndex, 3)}`,
      employeeCode: `AN-E-${pad(empIndex, 3)}`,
      firstName: first,
      lastName: last,
      department: dept,
      designation: `${dept} Executive`,
      location: pickCity(rng).label,
      managerKey: mgr,
    });
    empIndex += 1;
  }

  const employeeKeys = employees.map((e) => e.key);
  const salesKeys = employees.filter((e) => e.department === "Sales" || e.department === "CRM" || e.key.startsWith("mgr_sales") || e.key.startsWith("mgr_crm")).map((e) => e.key);
  const projectStaff = employees.filter((e) => ["Projects", "Construction", "Interior", "Operations"].includes(e.department)).map((e) => e.key);
  const financeStaff = employees.filter((e) => e.department === "Finance").map((e) => e.key);

  // --- Customers ---
  const customers: SeedCustomer[] = [];
  const industries = ["Real Estate", "Hospitality", "Retail", "Education", "Healthcare", "IT Park", "Residential"];
  for (let i = 1; i <= EXPECTED_COUNTS.customers; i += 1) {
    const loc = pickCity(rng);
    const first = CUSTOMER_FIRST[i % CUSTOMER_FIRST.length]!;
    const last = LAST_NAMES[(i * 5) % LAST_NAMES.length]!;
    const company = `${first} ${pick(rng, COMPANY_SUFFIXES)}`;
    const customerId =
      i === 1 ? GOLDEN.customers.villa : i === 2 ? GOLDEN.customers.omr : i === 3 ? GOLDEN.customers.cbe : `AN-CUST-${pad(i, 3)}`;
    customers.push({
      customerId,
      name: `${first} ${last}`,
      companyName: company,
      email: `customer.${pad(i, 3)}@example-archnova.demo`,
      phone: syntheticPhone(rng, 1000 + i),
      industry: pick(rng, industries),
      location: loc.label,
      address: `${10 + (i % 90)}, ${loc.locality}, ${loc.city}`,
      assigneeKey: pick(rng, salesKeys.length ? salesKeys : employeeKeys),
      status: i % 40 === 0 ? "INACTIVE" : "ACTIVE",
      notes: `Synthetic customer for ${ARCHNOVA.companyName} demo`,
    });
  }

  // --- Leads ---
  const leads: SeedLead[] = [];
  // Weak conversion funnel: many NEW/CONTACTED, fewer QUALIFIED, fewer CONVERTED
  const leadStatusPlan: string[] = [];
  for (let i = 0; i < 110; i += 1) leadStatusPlan.push("NEW");
  for (let i = 0; i < 80; i += 1) leadStatusPlan.push("CONTACTED");
  for (let i = 0; i < 50; i += 1) leadStatusPlan.push("QUALIFIED");
  for (let i = 0; i < 25; i += 1) leadStatusPlan.push("UNQUALIFIED");
  for (let i = 0; i < 35; i += 1) leadStatusPlan.push("CONVERTED");
  for (let i = 0; i < 20; i += 1) leadStatusPlan.push("LOST");
  while (leadStatusPlan.length < EXPECTED_COUNTS.leads) leadStatusPlan.push("NEW");

  for (let i = 1; i <= EXPECTED_COUNTS.leads; i += 1) {
    const loc = pickCity(rng);
    const first = CUSTOMER_FIRST[(i * 2) % CUSTOMER_FIRST.length]!;
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
    const status = leadStatusPlan[i - 1]!;
    const leadId =
      i === 1 ? GOLDEN.leads.villa : i === 2 ? GOLDEN.leads.omr : i === 3 ? GOLDEN.leads.cbe : `AN-LEAD-${pad(i, 3)}`;
    leads.push({
      leadId,
      name: `${first} ${last}`,
      companyName: `${first} ${pick(rng, COMPANY_SUFFIXES)}`,
      email: `lead.${pad(i, 3)}@example-archnova.demo`,
      phone: syntheticPhone(rng, 2000 + i),
      source: pick(rng, LEAD_SOURCES),
      industry: pick(rng, industries),
      location: loc.label,
      description: `Synthetic lead for ArchNova pipeline (${status})`,
      assigneeKey: pick(rng, salesKeys.length ? salesKeys : employeeKeys),
      status,
      priority: pick(rng, PRIORITIES),
      estimatedValue: Math.floor(5_00_000 + rng() * 2_00_00_000),
      closeOffsetDays: Math.floor(rng() * 60) - 20,
      followUpOffsetDays: Math.floor(rng() * 14) - 2,
    });
  }

  // --- Opportunities (connected to customers; converted leads wired later in seed) ---
  const opportunities: SeedOpportunity[] = [];
  const stagePlan: string[] = [];
  for (let i = 0; i < 25; i += 1) stagePlan.push("NEW");
  for (let i = 0; i < 30; i += 1) stagePlan.push("QUALIFICATION");
  for (let i = 0; i < 28; i += 1) stagePlan.push("PROPOSAL");
  for (let i = 0; i < 22; i += 1) stagePlan.push("NEGOTIATION");
  for (let i = 0; i < 20; i += 1) stagePlan.push("WON");
  for (let i = 0; i < 15; i += 1) stagePlan.push("LOST");
  while (stagePlan.length < EXPECTED_COUNTS.opportunities) stagePlan.push("QUALIFICATION");

  const convertedLeads = leads.filter((l) => l.status === "CONVERTED");
  for (let i = 1; i <= EXPECTED_COUNTS.opportunities; i += 1) {
    const stage = stagePlan[i - 1]!;
    const customer = customers[(i - 1) % customers.length]!;
    const linkedLead = convertedLeads[i - 1];
    const opportunityId =
      i === 1 ? GOLDEN.opportunities.villa : i === 2 ? GOLDEN.opportunities.omr : i === 3 ? GOLDEN.opportunities.cbe : `AN-OPP-${pad(i, 3)}`;
    opportunities.push({
      opportunityId,
      title: `${customer.companyName} — ${stage} opportunity`,
      customerId: customer.customerId,
      leadId: linkedLead?.leadId,
      assigneeKey: pick(rng, salesKeys.length ? salesKeys : employeeKeys),
      stage,
      probability: OPP_PROB[stage] ?? 25,
      estimatedValue: Math.floor(8_00_000 + rng() * 3_00_00_000),
      closeOffsetDays: Math.floor(rng() * 90) - 30,
      followUpOffsetDays: Math.floor(rng() * 10),
      description: `Synthetic opportunity for ${ARCHNOVA.companyName}`,
      lostReason: stage === "LOST" ? "Budget mismatch" : undefined,
    });
    if (linkedLead) {
      linkedLead.convertedCustomerId = customer.customerId;
      linkedLead.convertedOpportunityId = opportunityId;
      customer.sourceLeadId = linkedLead.leadId;
    }
  }

  // Wire golden CRM chain
  const goldenCustomerIds = [GOLDEN.customers.villa, GOLDEN.customers.omr, GOLDEN.customers.cbe];
  const goldenLeadIds = [GOLDEN.leads.villa, GOLDEN.leads.omr, GOLDEN.leads.cbe];
  const goldenOppIds = [GOLDEN.opportunities.villa, GOLDEN.opportunities.omr, GOLDEN.opportunities.cbe];
  for (let i = 0; i < 3; i += 1) {
    const lead = leads.find((l) => l.leadId === goldenLeadIds[i])!;
    const customer = customers.find((c) => c.customerId === goldenCustomerIds[i])!;
    const opp = opportunities.find((o) => o.opportunityId === goldenOppIds[i])!;
    lead.status = "CONVERTED";
    lead.convertedCustomerId = customer.customerId;
    lead.convertedOpportunityId = opp.opportunityId;
    customer.sourceLeadId = lead.leadId;
    opp.customerId = customer.customerId;
    opp.leadId = lead.leadId;
    opp.stage = "WON";
    opp.probability = 100;
  }

  // --- Projects ---
  const projects: SeedProject[] = [];
  const goldenProjectDefs = [GOLDEN.projects.villa, GOLDEN.projects.omr, GOLDEN.projects.cbe];
  const goldenCustomers = [GOLDEN.customers.villa, GOLDEN.customers.omr, GOLDEN.customers.cbe];
  goldenProjectDefs.forEach((gp, idx) => {
    const members = [GOLDEN.sathish.key, ...projectStaff.filter((k) => k !== GOLDEN.sathish.key).slice(idx * 3, idx * 3 + 4)];
    projects.push({
      projectId: gp.projectId,
      code: gp.code,
      name: gp.name,
      description: `${gp.name} for ${ARCHNOVA.companyName} golden demo`,
      location: gp.location,
      projectType: gp.projectType,
      managerKey: idx === 2 ? "mgr_interior" : idx === 1 ? "mgr_construction" : "mgr_projects",
      memberKeys: [...new Set(members)].slice(0, 8),
      customerId: goldenCustomers[idx],
      status: gp.status,
      progress: gp.progress,
      budget: gp.budget,
      actualExpense: 0, // filled after transactions
      startOffsetDays: -120 - idx * 20,
      endOffsetDays: 60 - idx * 10,
    });
    const opp = opportunities.find((o) => o.opportunityId === goldenOppIds[idx]);
    if (opp) opp.projectId = gp.projectId;
  });

  const typeCycle = [...PROJECT_TYPES];
  for (let i = projects.length + 1; i <= EXPECTED_COUNTS.projects; i += 1) {
    const loc = pickCity(rng);
    const type = typeCycle[(i - 1) % typeCycle.length]!;
    const status = i % 11 === 0 ? "AT_RISK" : i % 9 === 0 ? "ON_HOLD" : i % 7 === 0 ? "COMPLETED" : i % 5 === 0 ? "PLANNING" : "ACTIVE";
    const budget = Math.floor(20_00_000 + rng() * 5_00_00_000);
    const customer = customers[i % customers.length]!;
    const mgr = pick(rng, ["mgr_projects", "mgr_construction", "mgr_interior", "mgr_operations"]);
    const members = [pick(rng, projectStaff), pick(rng, projectStaff), pick(rng, projectStaff)];
    projects.push({
      projectId: `AN-PROJ-${pad(i, 3)}`,
      code: `AN-P${pad(i, 3)}`,
      name: `${loc.locality} ${type.replace("_", " ")} Project ${i}`,
      description: `Synthetic ${type} project in ${loc.label}`,
      location: loc.label,
      projectType: type,
      managerKey: mgr,
      memberKeys: [...new Set(members)],
      customerId: customer.customerId,
      status,
      progress: status === "COMPLETED" ? 100 : status === "PLANNING" ? Math.floor(rng() * 20) : Math.floor(20 + rng() * 70),
      budget,
      actualExpense: 0,
      startOffsetDays: -Math.floor(rng() * 150),
      endOffsetDays: Math.floor(rng() * 120),
    });
  }

  // Link some WON opportunities to projects
  const wonOpps = opportunities.filter((o) => o.stage === "WON" && !o.projectId);
  wonOpps.slice(0, Math.min(25, projects.length)).forEach((opp, idx) => {
    const project = projects[(idx + 3) % projects.length]!;
    opp.projectId = project.projectId;
    if (!project.customerId) project.customerId = opp.customerId;
  });

  // --- Sales activities ---
  const salesActivities: SeedSalesActivity[] = [];
  for (let i = 1; i <= EXPECTED_COUNTS.salesActivities; i += 1) {
    const lead = leads[i % leads.length]!;
    const opp = i % 3 === 0 ? opportunities[i % opportunities.length] : undefined;
    const customer = i % 4 === 0 ? customers[i % customers.length] : undefined;
    salesActivities.push({
      activityId: `AN-SA-${pad(i, 3)}`,
      type: pick(rng, ACTIVITY_TYPES),
      title: `Follow-up #${i}`,
      description: "Synthetic sales activity",
      leadId: lead.leadId,
      customerId: customer?.customerId,
      opportunityId: opp?.opportunityId,
      employeeKey: pick(rng, salesKeys.length ? salesKeys : employeeKeys),
      scheduledOffsetDays: Math.floor(rng() * 40) - 20,
      status: i % 5 === 0 ? "PENDING" : i % 11 === 0 ? "CANCELLED" : "COMPLETED",
    });
  }

  // --- Meetings ---
  const meetings: SeedMeeting[] = [];
  meetings.push({
    meetingId: GOLDEN.meetings.sathishToday,
    title: "OMR site coordination — Sathish",
    description: "Daily coordination for OMR Commercial Project",
    meetingType: "PROJECT_REVIEW",
    organizerKey: "mgr_construction",
    participantKeys: [GOLDEN.sathish.key, "mgr_construction", "mgr_projects"],
    projectId: GOLDEN.projects.omr.projectId,
    customerId: GOLDEN.customers.omr,
    location: "Sholinganallur Site Office",
    startOffsetHours: 2,
    durationHours: 1,
    status: "SCHEDULED",
    linkedTaskId: GOLDEN.tasks.sathishTodayPending,
  });
  meetings.push({
    meetingId: GOLDEN.meetings.mdToday,
    title: "MD morning standup",
    description: "Executive status for ArchNova",
    meetingType: "MANAGEMENT",
    organizerKey: "md",
    participantKeys: ["md", "mgr_projects", "mgr_sales", "mgr_finance"],
    location: "ArchNova HQ Anna Nagar",
    startOffsetHours: 1,
    durationHours: 1,
    status: "SCHEDULED",
  });

  for (let i = meetings.length + 1; i <= EXPECTED_COUNTS.meetings; i += 1) {
    const project = projects[i % projects.length]!;
    const hours = Math.floor(rng() * 24 * 40) - 24 * 20;
    const status = hours < -2 ? (rng() > 0.15 ? "COMPLETED" : "CANCELLED") : hours < 0 ? "IN_PROGRESS" : "SCHEDULED";
    meetings.push({
      meetingId: `AN-MTG-${pad(i, 3)}`,
      title: `${project.name} review ${i}`,
      description: "Synthetic meeting",
      meetingType: pick(rng, MEETING_TYPES),
      organizerKey: pick(rng, [project.managerKey, "md", "mgr_operations"]),
      participantKeys: [...new Set([project.managerKey, ...project.memberKeys.slice(0, 3), pick(rng, employeeKeys)])].slice(0, 6),
      projectId: project.projectId,
      customerId: project.customerId,
      location: project.location,
      startOffsetHours: hours,
      durationHours: 1 + Math.floor(rng() * 2),
      status,
    });
  }

  // --- Tasks ---
  const tasks: SeedTask[] = [];
  tasks.push({
    taskId: GOLDEN.tasks.sathishTodayPending,
    title: "Confirm OMR steel delivery schedule",
    description: "Golden pending task for Sathish today",
    assigneeKey: GOLDEN.sathish.key,
    projectId: GOLDEN.projects.omr.projectId,
    customerId: GOLDEN.customers.omr,
    meetingId: GOLDEN.meetings.sathishToday,
    priority: "HIGH",
    status: "PENDING",
    dueOffsetDays: 0,
  });
  tasks.push({
    taskId: GOLDEN.tasks.sathishTodayCompleted,
    title: "Submit morning site checklist",
    description: "Golden completed task for Sathish today",
    assigneeKey: GOLDEN.sathish.key,
    projectId: GOLDEN.projects.omr.projectId,
    customerId: GOLDEN.customers.omr,
    priority: "MEDIUM",
    status: "COMPLETED",
    dueOffsetDays: 0,
    completedOffsetDays: 0,
  });
  tasks.push({
    taskId: GOLDEN.tasks.sathishOverdue,
    title: "Resolve material delay at OMR basement",
    description: "Golden overdue task for Sathish",
    assigneeKey: GOLDEN.sathish.key,
    projectId: GOLDEN.projects.omr.projectId,
    customerId: GOLDEN.customers.omr,
    priority: "CRITICAL",
    status: "IN_PROGRESS",
    dueOffsetDays: -3,
  });
  tasks.push({
    taskId: GOLDEN.tasks.sathishInProgress,
    title: "Coordinate labour deployment for Block B",
    description: "Golden in-progress task for Sathish",
    assigneeKey: GOLDEN.sathish.key,
    projectId: GOLDEN.projects.omr.projectId,
    priority: "HIGH",
    status: "IN_PROGRESS",
    dueOffsetDays: 1,
  });

  for (let i = tasks.length + 1; i <= EXPECTED_COUNTS.tasks; i += 1) {
    const project = projects[i % projects.length]!;
    const assignee = pick(rng, project.memberKeys.length ? project.memberKeys : projectStaff);
    const due = Math.floor(rng() * 60) - 25;
    let status = pick(rng, TASK_STATUSES);
    if (due < 0 && (status === "PENDING" || status === "IN_PROGRESS") && rng() > 0.4) {
      // keep open overdue intentionally
    } else if (due < -5 && rng() > 0.5) {
      status = "COMPLETED";
    }
    tasks.push({
      taskId: `AN-TASK-${pad(i, 4)}`,
      title: `${project.code} task ${i}`,
      description: `Synthetic task for ${project.name}`,
      assigneeKey: assignee,
      projectId: project.projectId,
      customerId: project.customerId,
      meetingId: i % 17 === 0 ? meetings[i % meetings.length]?.meetingId : undefined,
      priority: pick(rng, PRIORITIES),
      status,
      dueOffsetDays: due,
      completedOffsetDays: status === "COMPLETED" ? Math.min(due, 0) : undefined,
    });
  }

  // Ensure villa healthy (mostly completed), omr has overdue, cbe has mix
  tasks
    .filter((t) => t.projectId === GOLDEN.projects.villa.projectId && !t.taskId.startsWith("AN-TASK-GOLDEN"))
    .slice(0, 20)
    .forEach((t, idx) => {
      t.status = idx < 16 ? "COMPLETED" : "IN_PROGRESS";
      t.dueOffsetDays = idx < 16 ? -10 : 5;
    });
  tasks
    .filter((t) => t.projectId === GOLDEN.projects.omr.projectId && !t.taskId.startsWith("AN-TASK-GOLDEN"))
    .slice(0, 15)
    .forEach((t, idx) => {
      if (idx < 8) {
        t.status = "PENDING";
        t.dueOffsetDays = -2 - idx;
        t.priority = "HIGH";
      }
    });

  // --- Finance categories & accounts ---
  const categories: SeedCategory[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c, idx) => ({
    categoryId: `AN-CAT-${pad(idx + 1, 2)}`,
    name: c.name,
    code: c.code,
    type: c.type,
    description: `${c.name} category for ${ARCHNOVA.companyName}`,
  }));

  const accounts: SeedAccount[] = ACCOUNTS.map((a) => ({
    accountId: a.accountId,
    name: a.name,
    code: a.code,
    type: a.type,
    description: a.name,
    openingBalance: a.opening,
    currentBalance: a.opening,
  }));

  const bank = accounts.find((a) => a.accountId === "AN-ACC-BANK-MAIN")!;
  const cash = accounts.find((a) => a.accountId === "AN-ACC-CASH")!;
  const expenseCats = categories.filter((c) => c.type === "EXPENSE");
  const incomeCats = categories.filter((c) => c.type === "INCOME");

  // --- Transactions: allocate exact golden expenses first, then fill ---
  const transactions: SeedTxn[] = [];
  const projectExpenseRemaining = new Map<string, number>();
  projects.forEach((p) => projectExpenseRemaining.set(p.projectId, 0));

  function addExpense(projectId: string, amount: number, day: number, label: string, customerId?: string) {
    const id = `AN-TXN-${pad(transactions.length + 1, 4)}`;
    const accountId = rng() > 0.15 ? bank.accountId : cash.accountId;
    transactions.push({
      transactionId: id,
      type: "EXPENSE",
      accountId,
      categoryCode: pick(rng, expenseCats).code,
      amount,
      description: label,
      projectId,
      customerId,
      dayOffset: day,
      status: "COMPLETED",
      paymentMethod: pick(rng, ["BANK_TRANSFER", "UPI", "CHEQUE", "CASH"]),
      idempotencyKey: `an-idem-${id}`,
    });
    projectExpenseRemaining.set(projectId, (projectExpenseRemaining.get(projectId) ?? 0) + amount);
  }

  function splitExact(projectId: string, total: number, parts: number, baseDay: number, label: string, customerId?: string) {
    const chunk = Math.floor(total / parts);
    let allocated = 0;
    for (let i = 0; i < parts; i += 1) {
      const amount = i === parts - 1 ? total - allocated : chunk;
      if (amount < 1) continue;
      addExpense(projectId, amount, baseDay - i * 7, `${label} #${i + 1}`, customerId);
      allocated += amount;
    }
  }

  splitExact(GOLDEN.projects.villa.projectId, GOLDEN.projects.villa.actualExpense, 8, -10, "Villa material/labour", GOLDEN.customers.villa);
  splitExact(GOLDEN.projects.omr.projectId, GOLDEN.projects.omr.actualExpense, 10, -5, "OMR construction spend", GOLDEN.customers.omr);
  splitExact(GOLDEN.projects.cbe.projectId, GOLDEN.projects.cbe.actualExpense, 6, -8, "Coimbatore interior spend", GOLDEN.customers.cbe);

  // Remaining project expenses ~ 35-55% of budget for active projects
  for (const project of projects) {
    if ([GOLDEN.projects.villa.projectId, GOLDEN.projects.omr.projectId, GOLDEN.projects.cbe.projectId].includes(project.projectId as never)) {
      continue;
    }
    const target = Math.floor(project.budget * (0.25 + rng() * 0.35));
    const parts = 2 + Math.floor(rng() * 3);
    splitExact(project.projectId, target, parts, -Math.floor(rng() * 90), `${project.code} expense`, project.customerId);
  }

  // Income receipts
  while (transactions.length < EXPECTED_COUNTS.financeTransactions - 40) {
    const project = pick(rng, projects);
    const amount = Math.floor(50_000 + rng() * 15_00_000);
    const id = `AN-TXN-${pad(transactions.length + 1, 4)}`;
    transactions.push({
      transactionId: id,
      type: "INCOME",
      accountId: bank.accountId,
      categoryCode: pick(rng, incomeCats).code,
      amount,
      description: `Client receipt ${project.code}`,
      projectId: project.projectId,
      customerId: project.customerId,
      dayOffset: -Math.floor(rng() * 100),
      status: "COMPLETED",
      paymentMethod: "BANK_TRANSFER",
      idempotencyKey: `an-idem-${id}`,
    });
  }

  // Transfers bank <-> cash
  while (transactions.length < EXPECTED_COUNTS.financeTransactions - 10) {
    const id = `AN-TXN-${pad(transactions.length + 1, 4)}`;
    const amount = Math.floor(10_000 + rng() * 2_00_000);
    const toCash = rng() > 0.5;
    transactions.push({
      transactionId: id,
      type: "TRANSFER",
      accountId: toCash ? bank.accountId : cash.accountId,
      counterpartyAccountId: toCash ? cash.accountId : bank.accountId,
      amount,
      description: "Internal float transfer",
      dayOffset: -Math.floor(rng() * 60),
      status: "COMPLETED",
      paymentMethod: "BANK_TRANSFER",
      idempotencyKey: `an-idem-${id}`,
    });
  }

  // A few pending expenses (do NOT count toward actualExpense)
  while (transactions.length < EXPECTED_COUNTS.financeTransactions) {
    const project = pick(rng, projects);
    const id = `AN-TXN-${pad(transactions.length + 1, 4)}`;
    transactions.push({
      transactionId: id,
      type: "EXPENSE",
      accountId: bank.accountId,
      categoryCode: pick(rng, expenseCats).code,
      amount: Math.floor(20_000 + rng() * 3_00_000),
      description: `Pending approval spend ${project.code}`,
      projectId: project.projectId,
      customerId: project.customerId,
      dayOffset: Math.floor(rng() * 7),
      status: "PENDING",
      paymentMethod: "BANK_TRANSFER",
      idempotencyKey: `an-idem-${id}`,
    });
  }

  // Apply actualExpense from completed expenses
  const expenseByProject = new Map<string, number>();
  for (const txn of transactions) {
    if (txn.type === "EXPENSE" && txn.status === "COMPLETED" && txn.projectId) {
      expenseByProject.set(txn.projectId, (expenseByProject.get(txn.projectId) ?? 0) + txn.amount);
    }
  }
  for (const project of projects) {
    project.actualExpense = expenseByProject.get(project.projectId) ?? 0;
  }

  // Account balances from opening + completed txns
  const balanceByAccount = new Map(accounts.map((a) => [a.accountId, a.openingBalance]));
  for (const txn of transactions) {
    if (txn.status !== "COMPLETED") continue;
    if (txn.type === "INCOME") {
      balanceByAccount.set(txn.accountId, (balanceByAccount.get(txn.accountId) ?? 0) + txn.amount);
    } else if (txn.type === "EXPENSE") {
      balanceByAccount.set(txn.accountId, (balanceByAccount.get(txn.accountId) ?? 0) - txn.amount);
    } else if (txn.type === "TRANSFER" && txn.counterpartyAccountId) {
      balanceByAccount.set(txn.accountId, (balanceByAccount.get(txn.accountId) ?? 0) - txn.amount);
      balanceByAccount.set(txn.counterpartyAccountId, (balanceByAccount.get(txn.counterpartyAccountId) ?? 0) + txn.amount);
    }
  }
  for (const account of accounts) {
    const computed = balanceByAccount.get(account.accountId) ?? account.openingBalance;
    if (computed < 0) {
      account.openingBalance += -computed + 5_000_000;
      balanceByAccount.set(account.accountId, computed + (-computed + 5_000_000));
    }
    account.currentBalance = balanceByAccount.get(account.accountId) ?? account.openingBalance;
  }

  // --- Budgets ---
  const budgets: SeedBudget[] = [];
  for (let i = 0; i < EXPECTED_COUNTS.budgets; i += 1) {
    const project = projects[i % projects.length]!;
    const cat = expenseCats[i % expenseCats.length]!;
    budgets.push({
      budgetId: `AN-BUD-${pad(i + 1, 3)}`,
      name: `${project.code} ${cat.name} budget`,
      projectId: project.projectId,
      categoryCode: cat.code,
      amount: Math.max(1, Math.floor(project.budget / expenseCats.length)),
      periodStartOffset: -180,
      periodEndOffset: 180,
    });
  }

  // --- Notifications & reminders ---
  const notifications: SeedNotification[] = [];
  const notifTypes = [
    ["TASK_OVERDUE", "tasks"],
    ["TASK_DUE", "tasks"],
    ["MEETING_REMINDER", "meetings"],
    ["PROJECT_AT_RISK", "projects"],
    ["LEAD_FOLLOW_UP", "crm"],
    ["FINANCE_ALERT", "finance"],
    ["BUDGET_ALERT", "finance"],
    ["REMINDER_DUE", "reminders"],
  ] as const;
  for (let i = 1; i <= EXPECTED_COUNTS.notifications; i += 1) {
    const [type, category] = notifTypes[i % notifTypes.length]!;
    notifications.push({
      notificationId: `AN-NTF-${pad(i, 3)}`,
      recipientKey: pick(rng, ["md", "admin", ...managerKeys, GOLDEN.sathish.key]),
      type,
      category,
      title: `${type.replaceAll("_", " ")} #${i}`,
      message: `Synthetic notification for ${ARCHNOVA.companyName}`,
      priority: pick(rng, ["LOW", "NORMAL", "HIGH", "URGENT"]),
      sourceType: category === "tasks" ? "TASK" : category === "meetings" ? "MEETING" : category === "projects" ? "PROJECT" : category === "crm" ? "LEAD" : category === "finance" ? "FINANCE" : "CUSTOM",
      isRead: i % 3 === 0,
    });
  }

  const reminders: SeedReminder[] = [];
  reminders.push({
    reminderId: "AN-REM-GOLDEN-MD-TODAY-1",
    userKey: "md",
    createdByKey: "admin",
    title: "Review OMR at-risk project",
    description: "Golden MD reminder for today",
    reminderType: "PROJECT",
    sourceType: "PROJECT",
    scheduledOffsetDays: 0,
    priority: "HIGH",
    status: "SCHEDULED",
  });
  reminders.push({
    reminderId: "AN-REM-GOLDEN-MD-TODAY-2",
    userKey: "md",
    createdByKey: "admin",
    title: "Check Sathish overdue site tasks",
    description: "Golden MD employee follow-up reminder",
    reminderType: "TASK",
    sourceType: "TASK",
    scheduledOffsetDays: 0,
    priority: "URGENT",
    status: "SCHEDULED",
  });
  reminders.push({
    reminderId: "AN-REM-GOLDEN-SATHISH-TODAY",
    userKey: GOLDEN.sathish.key,
    createdByKey: "mgr_construction",
    title: "Submit OMR evening site update",
    description: "Golden Sathish reminder for today",
    reminderType: "TASK",
    sourceType: "TASK",
    scheduledOffsetDays: 0,
    priority: "NORMAL",
    status: "SCHEDULED",
  });
  for (let i = 1; i <= EXPECTED_COUNTS.reminders - reminders.length; i += 1) {
    const n = reminders.length + 1;
    reminders.push({
      reminderId: `AN-REM-${pad(n, 3)}`,
      userKey: pick(rng, ["md", GOLDEN.sathish.key, ...managerKeys]),
      createdByKey: "admin",
      title: `Reminder ${n}`,
      description: "Synthetic reminder",
      reminderType: pick(rng, ["TASK", "MEETING", "PROJECT", "CRM", "FOLLOW_UP", "FINANCE", "CUSTOM"]),
      sourceType: pick(rng, ["TASK", "MEETING", "PROJECT", "LEAD", "CUSTOM", "FINANCE"]),
      scheduledOffsetDays: Math.floor(rng() * 20) - 5,
      priority: pick(rng, ["LOW", "NORMAL", "HIGH", "URGENT"]),
      status: n % 7 === 0 ? "COMPLETED" : n % 11 === 0 ? "CANCELLED" : "SCHEDULED",
    });
  }

  // Final count assertions (soft — trim/pad if needed)
  const dataset: ArchNovaDataset = {
    users,
    employees,
    customers,
    leads,
    opportunities,
    salesActivities,
    projects,
    tasks,
    meetings,
    accounts,
    categories,
    transactions,
    budgets,
    notifications,
    reminders,
  };

  // Recompute account balances cleanly after any opening bump
  for (const account of dataset.accounts) {
    let bal = account.openingBalance;
    for (const txn of dataset.transactions) {
      if (txn.status !== "COMPLETED") continue;
      if (txn.type === "INCOME" && txn.accountId === account.accountId) bal += txn.amount;
      if (txn.type === "EXPENSE" && txn.accountId === account.accountId) bal -= txn.amount;
      if (txn.type === "TRANSFER" && txn.accountId === account.accountId) bal -= txn.amount;
      if (txn.type === "TRANSFER" && txn.counterpartyAccountId === account.accountId) bal += txn.amount;
    }
    if (bal < 0) {
      account.openingBalance += -bal + 5_000_000;
      bal = account.openingBalance;
      for (const txn of dataset.transactions) {
        if (txn.status !== "COMPLETED") continue;
        if (txn.type === "INCOME" && txn.accountId === account.accountId) bal += txn.amount;
        if (txn.type === "EXPENSE" && txn.accountId === account.accountId) bal -= txn.amount;
        if (txn.type === "TRANSFER" && txn.accountId === account.accountId) bal -= txn.amount;
        if (txn.type === "TRANSFER" && txn.counterpartyAccountId === account.accountId) bal += txn.amount;
      }
    }
    account.currentBalance = bal;
  }

  return dataset;
}

export function countDataset(dataset: ArchNovaDataset): Record<string, number> {
  return {
    users: dataset.users.length,
    employees: dataset.employees.length,
    customers: dataset.customers.length,
    leads: dataset.leads.length,
    opportunities: dataset.opportunities.length,
    salesActivities: dataset.salesActivities.length,
    projects: dataset.projects.length,
    tasks: dataset.tasks.length,
    meetings: dataset.meetings.length,
    accounts: dataset.accounts.length,
    financeCategories: dataset.categories.length,
    financeTransactions: dataset.transactions.length,
    budgets: dataset.budgets.length,
    notifications: dataset.notifications.length,
    reminders: dataset.reminders.length,
  };
}

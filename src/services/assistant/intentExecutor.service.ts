import { env } from "../../config/env";
import { ASSISTANT_LIST_LIMIT, OPEN_OPPORTUNITY_STAGES, OPPORTUNITY_STAGES } from "../../utils/constants";
import { budgetService } from "../budget.service";
import { dashboardService } from "../dashboard.service";
import { financeReportService } from "../financeReport.service";
import { leadService } from "../lead.service";
import { meetingService } from "../meeting.service";
import { opportunityService } from "../opportunity.service";
import { projectService } from "../project.service";
import { salesService } from "../sales.service";
import { taskService } from "../task.service";
import { invoiceService } from "../invoice.service";
import { vendorService } from "../vendor.service";
import { landParcelService } from "../landParcel.service";
import { mdNoteService } from "../mdNote.service";
import type { AssistantActor, ExecutorPayload, ResolvedEntities } from "./types";
import type { AssistantIntent } from "../../utils/constants";
import { queryPlanExecutor } from "./queryPlanExecutor.service";
import { validateQueryPlan } from "./queryPlan.types";
import { dynamicQueryExecutor } from "./dynamicQueryExecutor.service";
import { validateBqlPlan } from "./bql";

const LIST = { page: 1, limit: ASSISTANT_LIST_LIMIT } as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function personName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (typeof record.name === "string") return record.name;
  if (typeof record.displayName === "string") return record.displayName;
  return null;
}

function compactTasks(items: unknown[]) {
  return items.slice(0, ASSISTANT_LIST_LIMIT).map((raw) => {
    const item = asRecord(raw);
    return {
      taskId: item.taskId,
      title: item.title,
      priority: item.priority,
      dueDate: item.dueDate,
      assignedTo: personName(item.assignedTo),
      status: item.status,
    };
  });
}

function compactMeetings(items: unknown[]) {
  return items.slice(0, ASSISTANT_LIST_LIMIT).map((raw) => {
    const item = asRecord(raw);
    return {
      meetingId: item.meetingId,
      title: item.title,
      startTime: item.startTime,
      endTime: item.endTime,
      location: item.location,
      status: item.status,
    };
  });
}

function mapHealth(health: unknown): "HEALTHY" | "AT_RISK" | "CRITICAL" {
  const value = String(health ?? "");
  if (value === "CRITICAL" || value === "RED") return "CRITICAL";
  if (value === "ATTENTION" || value === "YELLOW" || value === "AT_RISK") return "AT_RISK";
  return "HEALTHY";
}

async function pendingTasks(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  const assignedTo = entities.employeeId;
  const projectId = entities.projectId;
  const [pending, high, critical] = await Promise.all([
    taskService.list({ ...LIST, status: "PENDING", assignedTo, projectId, sortBy: "dueDate", sortOrder: "asc" }, actor),
    taskService.list({ ...LIST, status: "PENDING", assignedTo, projectId, priority: "HIGH", limit: 1 }, actor),
    taskService.list({ ...LIST, status: "PENDING", assignedTo, projectId, priority: "CRITICAL", limit: 1 }, actor),
  ]);
  const highPriority = high.meta.total + critical.meta.total;
  return {
    intent: "PENDING_TASKS",
    data: {
      count: pending.meta.total,
      highPriority,
      showing: pending.items.length,
      tasks: compactTasks(pending.items),
    },
    sources: [{ type: "TASK", count: pending.meta.total }],
  };
}

async function overdueTasks(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  const assignedTo = entities.employeeId;
  const projectId = entities.projectId;
  const [overdue, high, critical] = await Promise.all([
    taskService.overdue({ ...LIST, assignedTo, projectId, sortBy: "dueDate", sortOrder: "asc" }, actor),
    taskService.overdue({ ...LIST, assignedTo, projectId, priority: "HIGH", limit: 1 }, actor),
    taskService.overdue({ ...LIST, assignedTo, projectId, priority: "CRITICAL", limit: 1 }, actor),
  ]);
  const highPriority = high.meta.total + critical.meta.total;
  return {
    intent: "OVERDUE_TASKS",
    data: {
      count: overdue.meta.total,
      highPriority,
      criticalCount: critical.meta.total,
      showing: overdue.items.length,
      tasks: compactTasks(overdue.items),
    },
    sources: [{ type: "TASK", count: overdue.meta.total }],
  };
}

async function todayTasks(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  const result = await taskService.today({ ...LIST, assignedTo: entities.employeeId, sortBy: "dueDate" }, actor);
  return {
    intent: "TODAY_TASKS",
    data: {
      count: result.meta.total,
      showing: result.items.length,
      tasks: compactTasks(result.items),
    },
    sources: [{ type: "TASK", count: result.meta.total }],
  };
}

async function taskSummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const [counts, overdue] = await Promise.all([
    taskService.counts(actor),
    taskService.overdue({ ...LIST }, actor),
  ]);
  return {
    intent: "TASK_SUMMARY",
    data: {
      ...counts,
      overdueTasks: compactTasks(overdue.items),
    },
    sources: [{ type: "TASK", count: counts.total }],
  };
}

async function projectStatus(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  const summary = await projectService.summary(entities.projectId as string, actor);
  const health = mapHealth(summary.project.health);
  return {
    intent: "PROJECT_STATUS",
    data: {
      projectId: summary.project.id,
      businessProjectId: summary.project.projectId,
      name: summary.project.name,
      status: summary.project.status,
      progress: summary.project.progress,
      pendingTasks: summary.tasks.pending,
      overdueTasks: summary.tasks.overdue,
      budget: summary.financial.budget,
      expense: summary.financial.actualExpense,
      health,
      manager: personName(summary.project.manager),
    },
    sources: [{ type: "PROJECT", count: 1 }, { type: "TASK", count: summary.tasks.total }],
  };
}

async function projectHealth(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  if (entities.projectId) {
    const payload = await projectStatus(actor, entities);
    return { ...payload, intent: "PROJECT_HEALTH" };
  }
  const health = await dashboardService.getProjectHealth(actor, { limit: ASSISTANT_LIST_LIMIT });
  return {
    intent: "PROJECT_HEALTH",
    data: {
      total: health.total,
      healthy: health.healthy,
      atRisk: health.atRisk,
      critical: health.critical,
      projects: health.items.map((item) => ({
        projectId: item.id,
        name: item.name,
        progress: item.progress,
        overdueTasks: item.overdueTasks,
        health: mapHealth(item.health),
      })),
    },
    sources: [{ type: "PROJECT", count: health.total }],
  };
}

async function projectTasks(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  const status =
    entities.status === "PENDING" ||
    entities.status === "IN_PROGRESS" ||
    entities.status === "COMPLETED" ||
    entities.status === "CANCELLED"
      ? entities.status
      : undefined;
  const result = await projectService.listTasks(
    entities.projectId as string,
    { ...LIST, status, overdue: entities.status === "OVERDUE" ? true : undefined },
    actor,
  );
  return {
    intent: "PROJECT_TASKS",
    data: {
      projectId: entities.projectId,
      name: entities.projectName,
      count: result.meta.total,
      showing: result.items.length,
      tasks: compactTasks(result.items),
    },
    sources: [{ type: "PROJECT", count: 1 }, { type: "TASK", count: result.meta.total }],
  };
}

async function projectFinance(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  const summary = await financeReportService.projectSummary(entities.projectId as string, actor);
  const utilization = summary.budget > 0 ? Math.floor((summary.expense * 100) / summary.budget) : 0;
  return {
    intent: "PROJECT_FINANCE",
    data: {
      projectId: entities.projectId,
      name: entities.projectName,
      budget: summary.budget,
      expense: summary.expense,
      income: summary.income,
      remaining: summary.remainingBudget,
      utilization,
    },
    sources: [{ type: "PROJECT", count: 1 }, { type: "FINANCE" }],
  };
}

async function todayMeetings(actor: AssistantActor): Promise<ExecutorPayload> {
  const result = await meetingService.today({ ...LIST, now: new Date(), sortBy: "startTime", sortOrder: "asc" }, actor);
  return {
    intent: "TODAY_MEETINGS",
    data: {
      count: result.meta.total,
      showing: result.items.length,
      timezone: env.APP_TIMEZONE,
      meetings: compactMeetings(result.items),
    },
    sources: [{ type: "MEETING", count: result.meta.total }],
  };
}

async function upcomingMeetings(actor: AssistantActor): Promise<ExecutorPayload> {
  const result = await meetingService.upcoming(
    { ...LIST, days: 7, now: new Date(), sortBy: "startTime", sortOrder: "asc" },
    actor,
  );
  return {
    intent: "UPCOMING_MEETINGS",
    data: {
      count: result.meta.total,
      showing: result.items.length,
      days: 7,
      timezone: env.APP_TIMEZONE,
      meetings: compactMeetings(result.items),
    },
    sources: [{ type: "MEETING", count: result.meta.total }],
  };
}

async function meetingSummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const [counts, today] = await Promise.all([
    meetingService.counts(actor),
    meetingService.today({ ...LIST, now: new Date() }, actor),
  ]);
  return {
    intent: "MEETING_SUMMARY",
    data: {
      ...counts,
      todayCount: today.meta.total,
      today: compactMeetings(today.items),
    },
    sources: [{ type: "MEETING", count: counts.total ?? today.meta.total }],
  };
}

async function salesSummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const summary = await salesService.summary(actor);
  return {
    intent: "SALES_SUMMARY",
    data: {
      leads: summary.leads.total,
      qualifiedLeads: summary.leads.qualified,
      openOpportunities: summary.opportunities.open,
      pipeline: summary.pipeline.totalValue,
      won: summary.opportunities.won,
      lost: summary.opportunities.lost,
    },
    sources: [
      { type: "LEAD", count: summary.leads.total },
      { type: "OPPORTUNITY", count: summary.opportunities.total },
    ],
  };
}

async function salesPipeline(actor: AssistantActor): Promise<ExecutorPayload> {
  const pipeline = await opportunityService.pipeline(actor);
  const stages = OPPORTUNITY_STAGES.map((stage) => ({
    stage,
    count: pipeline[stage]?.count ?? 0,
    value: pipeline[stage]?.totalValue ?? 0,
  }));
  const openValue = OPEN_OPPORTUNITY_STAGES.reduce((sum, stage) => sum + (pipeline[stage]?.totalValue ?? 0), 0);
  return {
    intent: "SALES_PIPELINE",
    data: { stages, openValue },
    sources: [{ type: "SALES" }, { type: "OPPORTUNITY" }],
  };
}

async function leadSummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const [summary, list] = await Promise.all([
    salesService.summary(actor),
    leadService.list({ ...LIST, sortBy: "createdAt", sortOrder: "desc" }, actor),
  ]);
  return {
    intent: "LEAD_SUMMARY",
    data: {
      ...summary.leads,
      showing: list.items.length,
      leads: list.items.slice(0, ASSISTANT_LIST_LIMIT).map((raw) => {
        const item = asRecord(raw);
        return { leadId: item.leadId, name: item.name, status: item.status, estimatedValue: item.estimatedValue };
      }),
    },
    sources: [{ type: "LEAD", count: summary.leads.total }],
  };
}

async function opportunitySummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const [summary, list] = await Promise.all([
    salesService.summary(actor),
    opportunityService.list({ ...LIST, sortBy: "estimatedValue", sortOrder: "desc" }, actor),
  ]);
  return {
    intent: "OPPORTUNITY_SUMMARY",
    data: {
      ...summary.opportunities,
      pipeline: summary.pipeline.totalValue,
      showing: list.items.length,
      opportunities: list.items.slice(0, ASSISTANT_LIST_LIMIT).map((raw) => {
        const item = asRecord(raw);
        return {
          opportunityId: item.opportunityId,
          title: item.title,
          stage: item.stage,
          estimatedValue: item.estimatedValue,
        };
      }),
    },
    sources: [{ type: "OPPORTUNITY", count: summary.opportunities.total }],
  };
}

function financeFromSummary(summary: Record<string, unknown>) {
  return {
    income: Number(summary.income ?? 0),
    expense: Number(summary.expense ?? 0),
    net: Number(summary.net ?? 0),
    balance: summary.accountBalance === null || summary.accountBalance === undefined ? null : Number(summary.accountBalance),
    budgetUtilization: summary.budgetUtilization ?? null,
    scope: summary.scope ?? null,
  };
}

async function financeSummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const summary = asRecord(await dashboardService.getFinanceSummary(actor));
  return {
    intent: "FINANCE_SUMMARY",
    data: financeFromSummary(summary),
    sources: [{ type: "FINANCE" }],
  };
}

async function monthlyFinance(actor: AssistantActor): Promise<ExecutorPayload> {
  const summary = asRecord(await dashboardService.getFinanceSummary(actor));
  return {
    intent: "MONTHLY_FINANCE",
    data: {
      income: Number(summary.income ?? 0),
      expense: Number(summary.expense ?? 0),
      net: Number(summary.net ?? 0),
      period: "CURRENT_MONTH",
    },
    sources: [{ type: "FINANCE" }],
  };
}

async function weeklyFinancialRequirement(actor: AssistantActor): Promise<ExecutorPayload> {
  const requirement = asRecord(await dashboardService.getWeeklyFinancialRequirement(actor));
  return {
    intent: "WEEKLY_FINANCIAL_REQUIREMENT",
    data: {
      expectedIncome: requirement.expectedIncome,
      plannedExpenses: requirement.plannedExpenses,
      netRequirement: requirement.netRequirement,
      basis: requirement.basis,
      period: requirement.period,
    },
    sources: [{ type: "FINANCE" }],
  };
}

async function budgetSummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const [budgets, health] = await Promise.all([
    budgetService.list({ ...LIST, status: "ACTIVE" }, actor),
    dashboardService.getProjectHealth(actor, { limit: ASSISTANT_LIST_LIMIT }),
  ]);
  const summaries = await Promise.all(
    budgets.items.slice(0, ASSISTANT_LIST_LIMIT).map(async (raw) => {
      const item = asRecord(raw);
      const id = String(item.id);
      const detail = await budgetService.summary(id, actor);
      return {
        budgetId: item.budgetId,
        name: item.name,
        ...detail,
      };
    }),
  );
  const overBudgetProjects = health.items
    .filter((row) => row.remainingBudget < 0)
    .map((row) => ({ name: row.name, remainingBudget: row.remainingBudget, expense: row.expense, budget: row.budget }));
  const totalBudget = summaries.reduce((sum, item) => sum + Number(item.budget ?? 0), 0);
  const actualExpense = summaries.reduce((sum, item) => sum + Number(item.actual ?? 0), 0);
  return {
    intent: "BUDGET_SUMMARY",
    data: {
      totalBudget,
      actualExpense,
      remaining: totalBudget - actualExpense,
      utilization: totalBudget > 0 ? Math.floor((actualExpense * 100) / totalBudget) : 0,
      overBudgetProjects,
      budgets: summaries,
    },
    sources: [{ type: "BUDGET", count: budgets.meta.total }, { type: "PROJECT", count: overBudgetProjects.length }],
  };
}

async function attentionItems(actor: AssistantActor): Promise<ExecutorPayload> {
  const personal = actor.role === "EMPLOYEE";
  const items = await dashboardService.getAttentionItems(actor, {}, personal);
  return {
    intent: "ATTENTION_ITEMS",
    data: {
      count: items.length,
      items: items.map((item) => ({
        type: item.type,
        priority: item.priority,
        title: item.title,
      })),
    },
    sources: items.length > 0 ? [...new Set(items.map((item) => item.type))].map((type) => ({ type })) : [],
  };
}

async function morningReport(actor: AssistantActor): Promise<ExecutorPayload> {
  const personal = actor.role === "EMPLOYEE";
  const [report, counts, health, todayMeetings] = await Promise.all([
    dashboardService.getMorningReport(actor),
    taskService.counts(actor),
    dashboardService.getProjectHealth(actor, { limit: 5 }, personal),
    meetingService.today({ limit: 1, now: new Date() }, actor),
  ]);
  const reportRecord = asRecord(report);
  const sales = asRecord(reportRecord.sales);
  const finance = asRecord(reportRecord.finance);
  return {
    intent: "MORNING_REPORT",
    data: {
      date: reportRecord.date,
      timezone: reportRecord.timezone,
      attentionCount: Array.isArray(reportRecord.attention) ? reportRecord.attention.length : 0,
      pendingTasks: counts.pending,
      overdueTasks: counts.overdue,
      todayMeetings: todayMeetings.meta.total,
      atRiskProjects: health.atRisk + health.critical,
      pipeline: typeof sales.pipelineValue === "number" ? sales.pipelineValue : null,
      income: typeof finance.income === "number" ? finance.income : null,
      expense: typeof finance.expense === "number" ? finance.expense : null,
      financeAvailable: finance.available !== false,
    },
    sources: [{ type: "TASK" }, { type: "MEETING" }, { type: "PROJECT" }, { type: "SALES" }],
  };
}

async function companySummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const dashboard = asRecord(await dashboardService.getMDDashboard(actor));
  const overview = asRecord(dashboard.overview);
  const attention = Array.isArray(dashboard.attention) ? dashboard.attention : [];
  const sales = asRecord(dashboard.sales);
  const finance = asRecord(dashboard.finance);
  const projects = asRecord(dashboard.projects);
  return {
    intent: "COMPANY_SUMMARY",
    data: {
      projects: {
        active: overview.activeProjects ?? null,
        atRisk: projects.atRisk ?? null,
        critical: projects.critical ?? null,
      },
      tasks: {
        pending: overview.pendingTasks ?? null,
        overdue: overview.overdueTasks ?? null,
      },
      sales: {
        openOpportunities: overview.openOpportunities ?? sales.openOpportunities ?? null,
        pipeline: overview.pipelineValue ?? sales.pipelineValue ?? null,
      },
      finance: {
        income: finance.available === false ? null : (finance.income ?? overview.monthlyIncome ?? null),
        expense: finance.available === false ? null : (finance.expense ?? overview.monthlyExpense ?? null),
        available: finance.available !== false,
      },
      attention: attention.length,
    },
    sources: [{ type: "PROJECT" }, { type: "TASK" }, { type: "SALES" }, { type: "FINANCE" }],
  };
}

async function myWorkSummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const now = new Date();
  const [mine, overdue, meetings, projects, followUps] = await Promise.all([
    taskService.myTasks({ ...LIST, status: "PENDING" }, actor),
    taskService.overdue({ ...LIST }, actor),
    meetingService.today({ ...LIST, now }, actor),
    dashboardService.getProjectHealth(actor, { limit: 5 }, true),
    salesService.followUps({ to: now, limit: 5 }, actor),
  ]);
  return {
    intent: "MY_WORK_SUMMARY",
    data: {
      pendingTasks: mine.meta.total,
      overdueTasks: overdue.meta.total,
      todayMeetings: meetings.meta.total,
      projects: projects.total,
      followUps: followUps.leads.total + followUps.opportunities.total,
      tasks: compactTasks(mine.items),
      overdue: compactTasks(overdue.items),
      meetings: compactMeetings(meetings.items),
    },
    sources: [
      { type: "TASK", count: mine.meta.total },
      { type: "MEETING", count: meetings.meta.total },
      { type: "PROJECT", count: projects.total },
    ],
  };
}

async function employeeOverdueRanking(actor: AssistantActor, entities: ResolvedEntities) {
  return queryPlanExecutor.execute(
    validateQueryPlan({
      intent: "EMPLOYEE_OVERDUE_RANKING",
      queryType: "AGGREGATION",
      datasets: ["tasks", "employees"],
      tools: [{ tool: "get_overdue_by_employee" }],
      filters: { overdue: true, projectName: entities.projectName, employeeName: entities.employeeName },
      groupBy: ["employee"],
      sort: { field: "count", order: "DESC" },
      limit: 10,
    }),
    actor,
    entities,
  );
}

async function employeeDailyStatus(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  const assignedTo = entities.employeeId;
  const now = new Date();
  const [today, pending, overdue, completed, meetings] = await Promise.all([
    taskService.today({ ...LIST, assignedTo, sortBy: "dueDate" }, actor),
    taskService.list({ ...LIST, status: "PENDING", assignedTo, sortBy: "dueDate", sortOrder: "asc" }, actor),
    taskService.overdue({ ...LIST, assignedTo, sortBy: "dueDate", sortOrder: "asc" }, actor),
    taskService.list({ ...LIST, status: "COMPLETED", assignedTo, sortBy: "createdAt", sortOrder: "desc" }, actor),
    meetingService.today({ ...LIST, now, participantId: assignedTo, sortBy: "startTime", sortOrder: "asc" }, actor),
  ]);
  const projectNames = [
    ...new Set(
      [...today.items, ...pending.items, ...overdue.items]
        .map((item) => {
          const record = asRecord(item);
          const project = asRecord(record.project);
          return typeof project.name === "string"
            ? project.name
            : typeof record.projectName === "string"
              ? record.projectName
              : null;
        })
        .filter((name): name is string => Boolean(name)),
    ),
  ].slice(0, 5);
  return {
    intent: "EMPLOYEE_DAILY_STATUS",
    data: {
      employeeName: entities.employeeName,
      employeeId: assignedTo,
      dateRange: "TODAY",
      unavailable: ["attendance", "leave"],
      todayTasks: today.meta.total,
      pendingTasks: pending.meta.total,
      overdueTasks: overdue.meta.total,
      completedTasks: completed.meta.total,
      todayMeetings: meetings.meta.total,
      projects: projectNames,
      tasks: compactTasks(today.items.length ? today.items : pending.items),
      meetings: compactMeetings(meetings.items),
    },
    sources: [
      { type: "TASK", count: pending.meta.total },
      { type: "MEETING", count: meetings.meta.total },
    ],
  };
}

async function employeeWorkload(actor: AssistantActor, entities: ResolvedEntities) {
  return queryPlanExecutor.execute(
    validateQueryPlan({
      intent: "EMPLOYEE_WORKLOAD",
      queryType: "AGGREGATION",
      datasets: ["tasks", "employees"],
      tools: [{ tool: "get_employee_workload" }],
      filters: { pending: true, projectName: entities.projectName, employeeName: entities.employeeName, minPending: entities.minPending },
      groupBy: ["employee"],
      sort: { field: "pendingTasks", order: "DESC" },
      limit: 10,
    }),
    actor,
    entities,
  );
}

async function delayedProjectWorkload(actor: AssistantActor, entities: ResolvedEntities) {
  return queryPlanExecutor.execute(
    validateQueryPlan({
      intent: "DELAYED_PROJECT_WORKLOAD",
      queryType: "MULTI_TOOL",
      datasets: ["projects", "tasks", "employees"],
      tools: [
        { tool: "get_projects" },
        { tool: "get_project_task_workload" },
        { tool: "get_employee_workload" },
      ],
      filters: {
        delayed: true,
        pending: true,
        projectName: entities.projectName,
        employeeName: entities.employeeName,
        minPending: entities.minPending,
      },
      groupBy: ["project", "employee"],
      sort: { field: "pendingTasks", order: "DESC" },
      limit: 10,
    }),
    actor,
    entities,
  );
}

async function dynamicQuery(actor: AssistantActor, entities: ResolvedEntities) {
  return dynamicQueryExecutor.execute(
    validateBqlPlan({
      type: "ANALYSIS",
      operation: "ANALYZE",
      sources: ["dashboard", "projects", "tasks"],
      filters: [],
      relationships: [],
      groupBy: [],
      sort: [],
      limit: 20,
      entityHints: {
        projectName: entities.projectName,
        employeeName: entities.employeeName,
      },
    }),
    actor,
    entities,
  );
}

async function invoiceSummary(actor: AssistantActor): Promise<ExecutorPayload> {
  const result = await invoiceService.list({ ...LIST, sortBy: "createdAt", sortOrder: "desc" }, actor);
  const items = result.items as Array<Record<string, unknown>>;
  const open = items.filter((item) => !["PAID", "CANCELLED"].includes(String(item.status)));
  const overdue = items.filter((item) => String(item.status) === "OVERDUE");
  const outstanding = open.reduce((sum, item) => sum + Number(item.balance ?? 0), 0);
  return {
    intent: "INVOICE_SUMMARY",
    data: {
      total: result.meta.total,
      open: open.length,
      overdue: overdue.length,
      outstanding,
      showing: items.length,
      invoices: items.slice(0, ASSISTANT_LIST_LIMIT).map((item) => ({
        invoiceId: item.invoiceId,
        invoiceNumber: item.invoiceNumber,
        status: item.status,
        amount: item.amount,
        balance: item.balance,
      })),
    },
    sources: [{ type: "INVOICE", count: result.meta.total }],
  };
}

async function vendorList(actor: AssistantActor): Promise<ExecutorPayload> {
  const result = await vendorService.list({ ...LIST }, actor);
  return {
    intent: "VENDOR_LIST",
    data: {
      count: result.meta.total,
      showing: result.items.length,
      vendors: result.items.slice(0, ASSISTANT_LIST_LIMIT).map((item) => ({
        vendorId: item.vendorId,
        name: item.name,
        status: item.status,
        location: item.location,
      })),
    },
    sources: [{ type: "VENDOR", count: result.meta.total }],
  };
}

async function landParcelList(actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
  const statusFilter =
    typeof entities.status === "string" && ["AVAILABLE", "NEGOTIATION", "LEGAL_VERIFICATION", "ACQUIRED", "DROPPED"].includes(entities.status)
      ? (entities.status as "AVAILABLE" | "NEGOTIATION" | "LEGAL_VERIFICATION" | "ACQUIRED" | "DROPPED")
      : undefined;
  const result = await landParcelService.list({ ...LIST, status: statusFilter }, actor);
  return {
    intent: "LAND_PARCEL_LIST",
    data: {
      count: result.meta.total,
      showing: result.items.length,
      parcels: result.items.slice(0, ASSISTANT_LIST_LIMIT).map((item) => ({
        parcelId: item.parcelId,
        name: item.name,
        status: item.status,
        location: item.location,
        askingPrice: item.askingPrice,
      })),
    },
    sources: [{ type: "LAND_PARCEL", count: result.meta.total }],
  };
}

async function mdNotes(actor: AssistantActor): Promise<ExecutorPayload> {
  const result = await mdNoteService.list({ ...LIST }, actor);
  return {
    intent: "MD_NOTES",
    data: {
      count: result.meta.total,
      showing: result.items.length,
      notes: result.items.slice(0, ASSISTANT_LIST_LIMIT).map((item) => ({
        noteId: item.noteId,
        body: item.body,
        relatedType: item.relatedType,
      })),
    },
    sources: [{ type: "MD_NOTE", count: result.meta.total }],
  };
}

const EXECUTORS: Record<
  Exclude<AssistantIntent, "UNSUPPORTED" | "SMALLTALK">,
  (actor: AssistantActor, entities: ResolvedEntities) => Promise<ExecutorPayload>
> = {
  PENDING_TASKS: pendingTasks,
  OVERDUE_TASKS: overdueTasks,
  TODAY_TASKS: todayTasks,
  TASK_SUMMARY: taskSummary,
  PROJECT_STATUS: projectStatus,
  PROJECT_HEALTH: projectHealth,
  PROJECT_TASKS: projectTasks,
  PROJECT_FINANCE: projectFinance,
  TODAY_MEETINGS: todayMeetings,
  UPCOMING_MEETINGS: upcomingMeetings,
  MEETING_SUMMARY: meetingSummary,
  SALES_SUMMARY: salesSummary,
  SALES_PIPELINE: salesPipeline,
  LEAD_SUMMARY: leadSummary,
  OPPORTUNITY_SUMMARY: opportunitySummary,
  FINANCE_SUMMARY: financeSummary,
  MONTHLY_FINANCE: monthlyFinance,
  WEEKLY_FINANCIAL_REQUIREMENT: weeklyFinancialRequirement,
  BUDGET_SUMMARY: budgetSummary,
  ATTENTION_ITEMS: attentionItems,
  MORNING_REPORT: morningReport,
  COMPANY_SUMMARY: companySummary,
  MY_WORK_SUMMARY: myWorkSummary,
  EMPLOYEE_OVERDUE_RANKING: employeeOverdueRanking,
  EMPLOYEE_WORKLOAD: employeeWorkload,
  DELAYED_PROJECT_WORKLOAD: delayedProjectWorkload,
  EMPLOYEE_DAILY_STATUS: employeeDailyStatus,
  INVOICE_SUMMARY: invoiceSummary,
  VENDOR_LIST: vendorList,
  LAND_PARCEL_LIST: landParcelList,
  MD_NOTES: mdNotes,
  DYNAMIC_QUERY: dynamicQuery,
};

export const intentExecutorService = {
  async execute(intent: AssistantIntent, actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
    if (intent === "UNSUPPORTED" || intent === "SMALLTALK") {
      return {
        intent,
        data: {},
        sources: [],
      };
    }
    return EXECUTORS[intent](actor, entities);
  },
};

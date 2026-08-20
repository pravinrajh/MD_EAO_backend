import { env } from "../config/env";
import { logger } from "../config/logger";
import { employeeRepository } from "../repositories/employee.repository";
import { dashboardRepository } from "../repositories/dashboard.repository";
import { financeTransactionRepository } from "../repositories/financeTransaction.repository";
import { projectRepository } from "../repositories/project.repository";
import { taskRepository } from "../repositories/task.repository";
import {
  DASHBOARD_LIMITS,
  DASHBOARD_MEETING_SOON_MS,
  OPEN_OPPORTUNITY_STAGES,
  type ProjectStatus,
} from "../utils/constants";
import { ForbiddenError, ValidationError } from "../utils/errors";
import { buildPaginationMeta } from "../utils/pagination";
import {
  formatZonedDate,
  getZonedDayRange,
  getZonedMonthRange,
  getZonedWeekRange,
  zonedDateFromParts,
} from "../utils/timezone";
import { type Actor as CrmActor, visibilityFilter as crmVisibility } from "./crm.policy";
import { resolveCrmScope } from "./crm.context";
import { resolveFinanceScope } from "./finance.context";
import { type Actor as FinanceActor, isPrivileged } from "./finance.policy";
import { financeReportService } from "./financeReport.service";
import { meetingService } from "./meeting.service";
import { opportunityService } from "./opportunity.service";
import { parseDashboardHealth, projectHealth, remainingBudget, toDashboardHealth } from "./project.health";
import { salesService } from "./sales.service";
import { type Actor as TaskActor } from "./task.policy";
import { notificationService } from "./notification.service";
import { reminderService } from "./reminder.service";

export type DashboardActor = {
  id: string;
  role: TaskActor["role"];
};

export type UnavailableSection = { available: false; error: string };

type Window = {
  now: Date;
  timezone: string;
  dateLabel: string;
  day: { start: Date; end: Date };
  month: { start: Date; end: Date };
  week: { start: Date; end: Date };
  from?: Date;
  to?: Date;
};

/** Future Redis keys. MongoDB is the source of truth until Redis exists. */
export const dashboardCacheKeys = {
  md: (date: string) => `dashboard:md:${date}`,
  employee: (userId: string, date: string) => `dashboard:employee:${userId}:${date}`,
  finance: (date: string) => `dashboard:finance:${date}`,
  projects: (date: string) => `dashboard:projects:${date}`,
};

async function throughCache<T>(_key: string, loader: () => Promise<T>): Promise<T> {
  return loader();
}

function asUnavailable(error: string): UnavailableSection {
  return { available: false, error };
}

async function reminderSnapshot(actor: DashboardActor) {
  const [today, upcoming, unread] = await Promise.all([
    reminderService.getTodayReminders(actor, { limit: 20 }),
    reminderService.getUpcomingReminders(actor, { days: 7, limit: 20 }),
    notificationService.getUnreadCount(actor),
  ]);
  return {
    today: today.items,
    upcoming: upcoming.items,
    unreadCount: unread.count,
  };
}

async function section<T>(name: string, loader: () => Promise<T>): Promise<T | UnavailableSection> {
  try {
    return await loader();
  } catch (error) {
    logger.warn({ err: error, section: name }, "Dashboard section unavailable");
    return asUnavailable("Section unavailable");
  }
}

function parseAsOf(query: Record<string, unknown>): Window {
  const timezone = env.APP_TIMEZONE;
  let now = new Date();
  if (typeof query.date === "string") {
    const [year, month, day] = query.date.split("-").map(Number);
    const start = zonedDateFromParts(year, month, day, timezone);
    if (formatZonedDate(start, timezone) !== query.date) {
      throw new ValidationError("Invalid date", [{ field: "date", message: "Date must be a real calendar day" }]);
    }
    now = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  }
  const from = query.from instanceof Date ? query.from : undefined;
  const to = query.to instanceof Date ? query.to : undefined;
  if (from && to && to.getTime() < from.getTime()) {
    throw new ValidationError("Invalid date range", [{ field: "to", message: "to must be on or after from" }]);
  }
  return {
    now,
    timezone,
    dateLabel: formatZonedDate(now, timezone),
    day: getZonedDayRange(now, timezone),
    month: getZonedMonthRange(now, timezone),
    week: getZonedWeekRange(now, timezone),
    from,
    to,
  };
}

async function taskScope(actor: DashboardActor, personal: boolean) {
  const mine = await employeeRepository.findByUserId(actor.id);
  const employeeId = mine ? String(mine._id) : null;
  if (isPrivileged(actor.role) && !personal) return { employeeId, scope: undefined as Record<string, unknown> | undefined };

  if (personal || actor.role === "EMPLOYEE") {
    if (!employeeId) return { employeeId, scope: { createdBy: actor.id } };
    return { employeeId, scope: { $or: [{ assignedTo: employeeId }, { createdBy: actor.id }] } };
  }

  if (!employeeId) return { employeeId, scope: { createdBy: actor.id } };
  const reports = await employeeRepository.findReportIds(employeeId);
  const teamIds = [employeeId, ...reports.map((row) => String(row._id))];
  return { employeeId, scope: { $or: [{ createdBy: actor.id }, { assignedTo: { $in: teamIds } }] } };
}

function projectScope(employeeId: string | null, privileged: boolean, personal: boolean) {
  if (privileged && !personal) return undefined;
  if (!employeeId) return { _id: { $exists: false } };
  return { $or: [{ managerId: employeeId }, { members: employeeId }] };
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

async function hydratePeopleAndProjects<T extends { assignedTo?: unknown; projectId?: unknown }>(rows: T[]) {
  const employeeIds = [...new Set(rows.map((row) => String(row.assignedTo ?? "")).filter(Boolean))];
  const projectIds = [...new Set(rows.map((row) => String(row.projectId ?? "")).filter(Boolean))];
  const [employees, projects] = await Promise.all([
    employeeRepository.findSummariesByIds(employeeIds),
    projectRepository.findSummariesByIds(projectIds),
  ]);
  const employeesById = new Map(employees.map((item) => [String(item._id), item]));
  const projectsById = new Map(projects.map((item) => [String(item._id), item]));
  return rows.map((row) => {
    const employee = employeesById.get(String(row.assignedTo ?? ""));
    const project = row.projectId ? projectsById.get(String(row.projectId)) : null;
    const name =
      employee?.displayName ||
      [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() ||
      "Unknown";
    return {
      ...row,
      id: String((row as { _id?: unknown })._id ?? ""),
      assignedTo: employee ? { id: String(employee._id), name } : null,
      project: project ? { id: String(project._id), name: project.name } : null,
    };
  });
}

export const dashboardService = {
  async getOverview(actor: DashboardActor, query: Record<string, unknown> = {}, personal = false) {
    const window = parseAsOf(query);
    const { employeeId, scope } = await taskScope(actor, personal);
    const projects = projectScope(employeeId, isPrivileged(actor.role), personal);

    const [taskCounts, todayMeetings, sales, monthlyFinance, healthRows] = await Promise.all([
      taskRepository.counts(scope, window.now),
      meetingService.today({ limit: 1, now: window.now }, actor as never),
      salesService.summary(actor as CrmActor),
      isPrivileged(actor.role) && !personal
        ? financeReportService.summary({ from: window.month.start, to: new Date(window.month.end.getTime() - 1) }, actor as FinanceActor)
        : Promise.resolve(null),
      dashboardRepository.projectHealthRows({ scope: projects, now: window.now }),
    ]);

    const criticalProjects = healthRows.filter(
      (row) =>
        projectHealth({
          status: row.status,
          remainingBudget: remainingBudget(row.budget, row.actualExpense),
          overdueTasks: row.overdueTasks,
          budget: row.budget,
          actualExpense: row.actualExpense,
        }) === "CRITICAL",
    ).length;

    const activeProjects = healthRows.filter((row) => row.status === "ACTIVE").length;

    return {
      activeProjects,
      pendingTasks: taskCounts.pending,
      overdueTasks: taskCounts.overdue,
      todayMeetings: todayMeetings.meta.total,
      openOpportunities: sales.opportunities.open,
      pipelineValue: sales.pipeline.totalValue,
      monthlyIncome: monthlyFinance?.income ?? null,
      monthlyExpense: monthlyFinance?.expense ?? null,
      netCashFlow: monthlyFinance ? monthlyFinance.net : null,
      criticalIssues: taskCounts.overdue + criticalProjects,
    };
  },

  async getTaskSummary(actor: DashboardActor, query: Record<string, unknown> = {}, personal = false) {
    const window = parseAsOf(query);
    const { scope } = await taskScope(actor, personal);
    const [today, overdueRows] = await Promise.all([
      taskRepository.counts({ ...(scope ?? {}), dueDate: { $gte: window.day.start, $lt: window.day.end } }, window.now),
      dashboardRepository.topOverdueTasks(scope, window.now),
    ]);
    const overdue = await hydratePeopleAndProjects(overdueRows);
    return {
      today: {
        total: today.total,
        pending: today.pending,
        inProgress: today.inProgress,
        completed: today.completed,
        overdue: today.overdue,
      },
      overdue: overdue.map((item) => ({
        taskId: item.taskId,
        title: item.title,
        priority: item.priority,
        assignedTo: item.assignedTo,
        project: item.project,
        dueDate: item.dueDate,
      })),
    };
  },

  async getMeetingSummary(actor: DashboardActor, query: Record<string, unknown> = {}) {
    const window = parseAsOf(query);
    const today = await meetingService.today(
      { limit: DASHBOARD_LIMITS.todayMeetings, sortBy: "startTime", sortOrder: "asc", now: window.now },
      actor as never,
    );
    return {
      today: today.items.map((raw) => {
        const item = asRecord(raw);
        return {
          meetingId: item.meetingId,
          title: item.title,
          startTime: item.startTime,
          endTime: item.endTime,
          location: item.location,
          participantsCount: Array.isArray(item.participants) ? item.participants.length : 0,
        };
      }),
      todayCount: today.meta.total,
    };
  },

  async getUpcomingMeetings(actor: DashboardActor, query: Record<string, unknown> = {}) {
    const window = parseAsOf(query);
    const days = typeof query.days === "number" ? query.days : 7;
    const result = await meetingService.upcoming(
      { days, limit: DASHBOARD_LIMITS.upcomingMeetings, sortBy: "startTime", sortOrder: "asc", now: window.now },
      actor as never,
    );
    return {
      days,
      timezone: window.timezone,
      items: result.items.map((raw) => {
        const item = asRecord(raw);
        return {
          date: formatZonedDate(new Date(String(item.startTime)), window.timezone),
          meeting: {
            meetingId: item.meetingId,
            title: item.title,
            startTime: item.startTime,
            endTime: item.endTime,
            location: item.location,
            status: item.status,
          },
          participants: item.participants,
          project: item.project,
        };
      }),
    };
  },

  async getProjectHealth(actor: DashboardActor, query: Record<string, unknown> = {}, personal = false) {
    const window = parseAsOf(query);
    const { employeeId } = await taskScope(actor, personal);
    const scope = projectScope(employeeId, isPrivileged(actor.role), personal);
    const status = query.status as ProjectStatus | undefined;
    const wanted = typeof query.health === "string" ? parseDashboardHealth(query.health) : null;
    const rows = await dashboardRepository.projectHealthRows({ scope, status, now: window.now });
    const mapped = rows.map((row) => {
      const remaining = remainingBudget(row.budget, row.actualExpense);
      const code = projectHealth({
        status: row.status,
        remainingBudget: remaining,
        overdueTasks: row.overdueTasks,
        budget: row.budget,
        actualExpense: row.actualExpense,
        progress: row.progress,
      });
      return {
        id: String(row._id),
        projectId: row.projectId,
        name: row.name,
        progress: row.progress,
        pendingTasks: row.pendingTasks,
        overdueTasks: row.overdueTasks,
        budget: row.budget,
        expense: row.actualExpense,
        remainingBudget: remaining,
        status: row.status,
        health: toDashboardHealth(code),
        healthCode: code,
      };
    });
    const filtered = wanted ? mapped.filter((row) => row.healthCode === wanted) : mapped;
    const page = typeof query.page === "number" && query.page > 0 ? Math.floor(query.page) : 1;
    const limitRaw = typeof query.limit === "number" && query.limit > 0 ? Math.floor(query.limit) : DASHBOARD_LIMITS.projectHealthDefault;
    const limit = Math.min(limitRaw, DASHBOARD_LIMITS.projectHealthMax);
    const skip = (page - 1) * limit;
    return {
      total: filtered.length,
      healthy: mapped.filter((row) => row.health === "GREEN").length,
      atRisk: mapped.filter((row) => row.health === "YELLOW").length,
      critical: mapped.filter((row) => row.health === "RED").length,
      items: filtered.slice(skip, skip + limit),
      meta: buildPaginationMeta(page, limit, filtered.length),
    };
  },

  async getSalesSummary(actor: DashboardActor) {
    const [summary, pipeline] = await Promise.all([
      salesService.summary(actor as CrmActor),
      opportunityService.pipeline(actor as CrmActor),
    ]);
    return {
      totalLeads: summary.leads.total,
      newLeads: summary.leads.new,
      qualifiedLeads: summary.leads.qualified,
      openOpportunities: summary.opportunities.open,
      wonOpportunities: summary.opportunities.won,
      lostOpportunities: summary.opportunities.lost,
      pipelineValue: summary.pipeline.totalValue,
      weightedPipelineValue: summary.pipeline.weightedValue,
      pipeline: OPEN_OPPORTUNITY_STAGES.map((stage) => ({
        stage,
        count: pipeline[stage]?.count ?? 0,
        value: pipeline[stage]?.totalValue ?? 0,
      })),
    };
  },

  async getFinanceSummary(actor: DashboardActor, query: Record<string, unknown> = {}) {
    if (actor.role === "EMPLOYEE") {
      throw new ForbiddenError("You do not have permission to view company finance");
    }
    const window = parseAsOf(query);
    const from = window.from ?? window.month.start;
    const to = window.to ?? new Date(window.month.end.getTime() - 1);

    if (isPrivileged(actor.role)) {
      const { employeeId } = await taskScope(actor, false);
      const [flows, accountBalance, rows] = await Promise.all([
        financeReportService.summary({ from, to }, actor as FinanceActor),
        dashboardRepository.cashBankBalance(),
        dashboardRepository.projectHealthRows({
          scope: projectScope(employeeId, true, false),
          now: window.now,
        }),
      ]);
      const budget = rows.reduce((sum, row) => sum + row.budget, 0);
      const expense = rows.reduce((sum, row) => sum + row.actualExpense, 0);
      return {
        income: flows.income,
        expense: flows.expense,
        net: flows.net,
        accountBalance,
        budgetUtilization: budget > 0 ? Math.floor((expense * 100) / budget) : null,
        scope: "COMPANY" as const,
      };
    }

    const { projectIds } = await resolveFinanceScope(actor as FinanceActor);
    if (!projectIds || projectIds.length === 0) {
      return asUnavailable("No authorized project finance");
    }
    const match = {
      projectId: { $in: projectIds.map((id) => dashboardRepository.toObjectId(id)) },
      transactionDate: { $gte: from, $lte: to },
    };
    const { employeeId } = await taskScope(actor, false);
    const [flows, rows] = await Promise.all([
      financeTransactionRepository.summarize(match),
      dashboardRepository.projectHealthRows({
        scope: projectScope(employeeId, false, false),
        now: window.now,
      }),
    ]);
    const budget = rows.reduce((sum, row) => sum + row.budget, 0);
    const expense = rows.reduce((sum, row) => sum + row.actualExpense, 0);
    return {
      income: flows.income,
      expense: flows.expense,
      net: flows.net,
      accountBalance: null,
      budgetUtilization: budget > 0 ? Math.floor((expense * 100) / budget) : null,
      scope: "PROJECTS" as const,
    };
  },

  async getWeeklyFinancialRequirement(actor: DashboardActor, query: Record<string, unknown> = {}) {
    if (actor.role === "EMPLOYEE") {
      throw new ForbiddenError("You do not have permission to view company finance");
    }
    const window = parseAsOf(query);
    const { projectIds } = await resolveFinanceScope(actor as FinanceActor);
    const match: Record<string, unknown> = {
      transactionDate: { $gte: window.week.start, $lt: window.week.end },
    };
    if (!isPrivileged(actor.role)) {
      if (!projectIds || projectIds.length === 0) {
        return asUnavailable("No authorized project finance");
      }
      match.projectId = { $in: projectIds.map((id) => dashboardRepository.toObjectId(id)) };
    }
    const [flows, items] = await Promise.all([
      dashboardRepository.weekFlows(match),
      dashboardRepository.weekExpenseItems(match),
    ]);
    return {
      period: {
        start: window.week.start,
        end: window.week.end,
        timezone: window.timezone,
      },
      basis:
        "Completed and pending INCOME/EXPENSE transactions dated this application week. Payables, invoices, and future obligations are not modeled yet.",
      expectedIncome: flows.expectedIncome,
      plannedExpenses: flows.plannedExpenses,
      netRequirement: flows.expectedIncome - flows.plannedExpenses,
      items,
    };
  },

  async getAttentionItems(actor: DashboardActor, query: Record<string, unknown> = {}, personal = false) {
    const window = parseAsOf(query);
    const { scope } = await taskScope(actor, personal);
    const [overdue, health, followUps, meetings] = await Promise.all([
      dashboardRepository.topOverdueTasks(scope, window.now, DASHBOARD_LIMITS.attention),
      this.getProjectHealth(actor, { ...query, limit: DASHBOARD_LIMITS.attention }, personal),
      salesService.followUps({ to: window.now, limit: 5 }, actor as CrmActor),
      meetingService.upcoming({ days: 1, limit: 10, sortBy: "startTime", sortOrder: "asc", now: window.now }, actor as never),
    ]);

    const items: Array<{
      type: string;
      priority: string;
      title: string;
      sourceId: string;
      actionUrl: string;
    }> = [];

    for (const task of overdue) {
      if (task.priority !== "HIGH" && task.priority !== "CRITICAL") continue;
      items.push({
        type: "TASK",
        priority: task.priority,
        title: task.title,
        sourceId: String(task._id),
        actionUrl: `/tasks/${String(task._id)}`,
      });
    }

    for (const project of health.items.filter((row) => row.health === "RED" || row.health === "YELLOW")) {
      items.push({
        type: "PROJECT",
        priority: project.health === "RED" ? "CRITICAL" : "HIGH",
        title:
          project.health === "RED"
            ? `${project.name} is critical`
            : `${project.name} is at risk`,
        sourceId: project.id,
        actionUrl: `/projects/${project.id}`,
      });
    }

    for (const lead of followUps.leads.items.slice(0, 3)) {
      items.push({
        type: "CRM",
        priority: "HIGH",
        title: `Overdue follow-up: ${String(lead.name ?? lead.leadId)}`,
        sourceId: String(lead.id),
        actionUrl: `/leads/${String(lead.id)}`,
      });
    }

    for (const opportunity of followUps.opportunities.items.slice(0, 3)) {
      const value = Number(opportunity.estimatedValue ?? 0);
      if (value < 1_000_000 && actor.role === "EMPLOYEE") continue;
      items.push({
        type: "CRM",
        priority: value >= 5_000_000 ? "CRITICAL" : "HIGH",
        title: `Opportunity follow-up: ${String(opportunity.title ?? opportunity.opportunityId)}`,
        sourceId: String(opportunity.id),
        actionUrl: `/opportunities/${String(opportunity.id)}`,
      });
    }

    if (actor.role !== "EMPLOYEE") {
      for (const project of health.items.filter((row) => row.remainingBudget < 0)) {
        items.push({
          type: "FINANCE",
          priority: "CRITICAL",
          title: `Budget exceeded: ${project.name}`,
          sourceId: project.id,
          actionUrl: `/projects/${project.id}`,
        });
      }
    }

    const soon = window.now.getTime() + DASHBOARD_MEETING_SOON_MS;
    for (const raw of meetings.items) {
      const meeting = asRecord(raw);
      const start = new Date(String(meeting.startTime)).getTime();
      if (start < window.now.getTime() || start > soon) continue;
      if (meeting.status !== "SCHEDULED" && meeting.status !== "IN_PROGRESS") continue;
      items.push({
        type: "MEETING",
        priority: "HIGH",
        title: `Starting soon: ${String(meeting.title)}`,
        sourceId: String(meeting.id),
        actionUrl: `/meetings/${String(meeting.id)}`,
      });
    }

    const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const unique = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const key = `${item.type}:${item.sourceId}`;
      const existing = unique.get(key);
      if (!existing || (rank[item.priority] ?? 9) < (rank[existing.priority] ?? 9)) {
        unique.set(key, item);
      }
    }

    return [...unique.values()]
      .sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9))
      .slice(0, DASHBOARD_LIMITS.attention);
  },

  async getRecentActivity(actor: DashboardActor, query: Record<string, unknown> = {}, personal = false) {
    const { employeeId, scope } = await taskScope(actor, personal);
    const { teamIds } = await resolveCrmScope(actor as CrmActor);
    const limit = typeof query.limit === "number" ? query.limit : DASHBOARD_LIMITS.activity;
    return dashboardRepository.recentActivity({
      taskScope: scope,
      projectScope: projectScope(employeeId, isPrivileged(actor.role), personal),
      crmScope: crmVisibility(actor as CrmActor, teamIds),
      includeFinance: isPrivileged(actor.role) && !personal,
      limit,
    });
  },

  async getMorningReport(actor: DashboardActor, query: Record<string, unknown> = {}) {
    const window = parseAsOf(query);
    const personal = actor.role === "EMPLOYEE";
    const [attention, tasks, meetings, projects, sales, finance] = await Promise.all([
      this.getAttentionItems(actor, query, personal),
      this.getTaskSummary(actor, query, personal),
      this.getMeetingSummary(actor, query),
      this.getProjectHealth(actor, { ...query, limit: 5 }, personal),
      section("sales", () => this.getSalesSummary(actor)),
      personal || actor.role === "EMPLOYEE"
        ? Promise.resolve(asUnavailable("Company finance is restricted"))
        : section("finance", () => this.getFinanceSummary(actor, query)),
    ]);
    const count = attention.length;
    return {
      date: window.dateLabel,
      timezone: window.timezone,
      summary:
        count === 0
          ? "No items require your attention today"
          : `${count} item${count === 1 ? "" : "s"} require your attention today`,
      attention,
      tasks: tasks.today,
      meetings: meetings.today,
      projects: projects.items,
      sales,
      finance,
    };
  },

  async getMDDashboard(actor: DashboardActor, query: Record<string, unknown> = {}) {
    if (!isPrivileged(actor.role) && actor.role !== "MANAGER") {
      throw new ForbiddenError("You do not have permission to view the executive dashboard");
    }
    const window = parseAsOf(query);
    return throughCache(dashboardCacheKeys.md(window.dateLabel), async () => {
      const [overview, attention, tasks, meetings, projects, sales, finance, activity, reminders] = await Promise.all([
        section("overview", () => this.getOverview(actor, query)),
        section("attention", () => this.getAttentionItems(actor, query)),
        section("tasks", () => this.getTaskSummary(actor, query)),
        section("meetings", () => this.getMeetingSummary(actor, query)),
        section("projects", () => this.getProjectHealth(actor, { ...query, limit: 10 })),
        section("sales", () => this.getSalesSummary(actor)),
        section("finance", () => this.getFinanceSummary(actor, query)),
        section("activity", () => this.getRecentActivity(actor, query)),
        section("reminders", () => reminderSnapshot(actor)),
      ]);
      return {
        date: window.dateLabel,
        timezone: window.timezone,
        overview,
        attention,
        tasks,
        meetings,
        projects,
        sales,
        finance,
        activity,
        reminders,
      };
    });
  },

  async getEmployeeDashboard(actor: DashboardActor, query: Record<string, unknown> = {}) {
    const window = parseAsOf(query);
    return throughCache(dashboardCacheKeys.employee(actor.id, window.dateLabel), async () => {
      const [overview, attention, tasks, meetings, projects, sales, activity, reminders] = await Promise.all([
        section("overview", () => this.getOverview(actor, query, true)),
        section("attention", () => this.getAttentionItems(actor, query, true)),
        section("tasks", () => this.getTaskSummary(actor, query, true)),
        section("meetings", () => this.getMeetingSummary(actor, query)),
        section("projects", () => this.getProjectHealth(actor, { ...query, limit: 10 }, true)),
        section("sales", () => this.getSalesSummary(actor)),
        section("activity", () => this.getRecentActivity(actor, query, true)),
        section("reminders", () => reminderSnapshot(actor)),
      ]);
      return {
        date: window.dateLabel,
        timezone: window.timezone,
        overview,
        attention,
        tasks,
        meetings,
        projects,
        sales,
        finance: asUnavailable("Company finance is restricted"),
        activity,
        reminders,
      };
    });
  },

  async getDashboard(actor: DashboardActor, query: Record<string, unknown> = {}) {
    if (actor.role === "EMPLOYEE") return this.getEmployeeDashboard(actor, query);
    return this.getMDDashboard(actor, query);
  },
};

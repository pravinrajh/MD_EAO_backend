import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { ASSISTANT_LIST_LIMIT } from "../../utils/constants";
import { dashboardService } from "../dashboard.service";
import { employeeService } from "../employee.service";
import { financeReportService } from "../financeReport.service";
import { meetingService } from "../meeting.service";
import { projectService } from "../project.service";
import { salesService } from "../sales.service";
import { taskService } from "../task.service";
import { assertCanViewCompanyFinance } from "../finance.policy";
import { aiPermissionAdapter } from "./permission.adapter";
import { resolveBqlDateRange, type BqlPlan } from "./bql";
import type { AssistantActor, AssistantSource, ExecutorPayload, ResolvedEntities } from "./types";

const LIST = { page: 1, limit: ASSISTANT_LIST_LIMIT } as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function compactProjects(items: unknown[]) {
  return items.slice(0, ASSISTANT_LIST_LIMIT).map((raw) => {
    const item = asRecord(raw);
    return {
      projectId: item.projectId ?? item.id,
      projectName: item.name,
      status: item.status,
      progress: item.progress,
      health: item.health,
    };
  });
}

function compactTasks(items: unknown[]) {
  return items.slice(0, ASSISTANT_LIST_LIMIT).map((raw) => {
    const item = asRecord(raw);
    return {
      taskId: item.taskId,
      title: item.title,
      status: item.status,
      priority: item.priority,
      dueDate: item.dueDate,
      projectId: item.projectId,
    };
  });
}

function filterValue(plan: BqlPlan, source: string, field: string): unknown {
  return plan.filters.find((item) => item.source === source && item.field === field)?.value;
}

async function loadProjects(plan: BqlPlan, actor: AssistantActor, entities: ResolvedEntities) {
  const status = filterValue(plan, "projects", "status");
  const delayed = filterValue(plan, "projects", "delayed") === true || status === "AT_RISK";
  if (delayed || plan.operation === "ANALYZE" || plan.operation === "SUMMARY") {
    const health = await dashboardService.getProjectHealth(actor, { limit: plan.limit });
    const items = delayed
      ? health.items.filter((item) => item.health === "YELLOW" || item.health === "RED" || item.status === "AT_RISK")
      : health.items;
    const focused = entities.projectId ? items.filter((item) => String(item.id) === entities.projectId) : items;
    return {
      projects: compactProjects(
        focused.map((item) => ({
          id: item.id,
          projectId: item.projectId,
          name: item.name,
          status: item.status,
          progress: item.progress,
          health: item.health,
        })),
      ),
      count: focused.length,
      healthy: health.healthy,
      atRisk: health.atRisk,
      critical: health.critical,
    };
  }

  const result = await projectService.list(
    {
      ...LIST,
      limit: plan.limit,
      search: entities.projectName,
      status: typeof status === "string" ? status : undefined,
      sortBy: plan.sort[0]?.field === "progress" ? "progress" : "createdAt",
      sortOrder: plan.sort[0]?.direction === "ASC" ? "asc" : "desc",
    },
    actor,
  );
  const items = entities.projectId
    ? result.items.filter((item) => String(asRecord(item).id) === entities.projectId)
    : result.items;
  return { projects: compactProjects(items), count: entities.projectId ? items.length : result.meta.total };
}

async function loadTasks(plan: BqlPlan, actor: AssistantActor, entities: ResolvedEntities) {
  const overdue = filterValue(plan, "tasks", "overdue") === true;
  const status = filterValue(plan, "tasks", "status");
  const dateRange = plan.dateRange ? resolveBqlDateRange(plan.dateRange) : undefined;
  const query: Record<string, unknown> = {
    ...LIST,
    limit: plan.limit,
    assignedTo: entities.employeeId,
    projectId: entities.projectId,
    status: typeof status === "string" ? status : undefined,
    overdue: overdue || undefined,
    dueFrom: dateRange?.start,
    dueTo: dateRange ? new Date(dateRange.end.getTime() - 1) : undefined,
  };

  if (
    plan.operation === "AGGREGATE" ||
    plan.groupBy.includes("assignedTo") ||
    filterValue(plan, "employees", "workload") === true ||
    (plan.sources.includes("employees") && plan.sources.includes("tasks") && plan.operation !== "COUNT")
  ) {
    const rows = await taskService.workloadByAssignee(actor, {
      projectId: entities.projectId,
      assignedTo: entities.employeeId,
      overdueOnly: overdue,
      groupBy: plan.groupBy.includes("projectId") ? ["employee", "project"] : ["employee"],
      limit: plan.limit,
    });
    const names = await employeeService.listByIds(rows.map((row) => row.employeeId));
    const nameMap = new Map(
      (names as Array<Record<string, unknown>>).map((item) => [
        String(item.id),
        String(item.displayName || item.firstName || "Unknown"),
      ]),
    );
    const employees = rows.map((row) => ({
      employeeId: row.employeeId,
      employee: nameMap.get(row.employeeId) || "Unknown",
      employeeName: nameMap.get(row.employeeId) || "Unknown",
      pendingTasks: row.pending,
      overdueTasks: row.overdue,
      count: row.count,
    }));
    return {
      employees,
      topEmployee: employees[0]?.employee ?? null,
      topOverdue: employees[0]?.overdueTasks ?? 0,
      topPending: employees[0]?.pendingTasks ?? 0,
      count: employees.length,
    };
  }

  if (plan.operation === "COUNT") {
    const counts = await taskService.counts(actor);
    return {
      pendingTasks: counts.pending,
      overdueTasks: counts.overdue,
      inProgress: counts.inProgress,
      completed: counts.completed,
      count: overdue ? counts.overdue : status === "PENDING" ? counts.pending : counts.total,
    };
  }

  const result = overdue
    ? await taskService.overdue(query, actor)
    : dateRange && plan.dateRange === "TODAY"
      ? await taskService.today(query, actor)
      : await taskService.list(query, actor);
  return {
    tasks: compactTasks(result.items),
    count: result.meta.total,
    showing: result.items.length,
  };
}

async function loadMeetings(plan: BqlPlan, actor: AssistantActor) {
  if (plan.dateRange === "TODAY" || !plan.dateRange) {
    const result = await meetingService.today({ ...LIST, limit: plan.limit, sortBy: "startTime", sortOrder: "asc" }, actor);
    return { meetings: result.items.slice(0, plan.limit), count: result.meta.total };
  }
  const result = await meetingService.myMeetings({ ...LIST, limit: plan.limit }, actor);
  return { meetings: result.items.slice(0, plan.limit), count: result.meta.total };
}

async function loadCrm(actor: AssistantActor) {
  const sales = await salesService.summary(actor);
  return {
    sales,
    pipeline: sales.pipeline,
    count: Number(sales.opportunities?.open ?? sales.leads?.total ?? 0),
  };
}

async function loadFinance(actor: AssistantActor, plan: BqlPlan) {
  assertCanViewCompanyFinance(actor);
  const range = plan.dateRange ? resolveBqlDateRange(plan.dateRange) : undefined;
  const summary = await financeReportService.summary(
    {
      from: range?.start,
      to: range ? new Date(range.end.getTime() - 1) : undefined,
    },
    actor,
  );
  return { finance: summary };
}

async function loadDashboard(actor: AssistantActor) {
  if (actor.role === "EMPLOYEE") {
    return dashboardService.getEmployeeDashboard(actor, { limit: ASSISTANT_LIST_LIMIT });
  }
  return dashboardService.getMDDashboard(actor, { limit: ASSISTANT_LIST_LIMIT });
}

export const dynamicQueryExecutor = {
  async execute(plan: BqlPlan, actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
    const started = Date.now();
    aiPermissionAdapter.assertQuery("DYNAMIC_QUERY", actor);
    if (plan.sources.includes("finance")) {
      assertCanViewCompanyFinance(actor);
    }

    const data: Record<string, unknown> = {
      toolsUsed: plan.sources.map((source) => `get_${source}`),
      queryPlan: {
        type: plan.type,
        operation: plan.operation,
        sources: plan.sources,
        filters: plan.filters,
        groupBy: plan.groupBy,
        sort: plan.sort,
        limit: plan.limit,
        dateRange: plan.dateRange,
      },
    };
    const sources: AssistantSource[] = [];

    const loaded = new Set<string>();
    for (const source of plan.sources) {
      if (source === "projects") {
        Object.assign(data, await loadProjects(plan, actor, entities));
        sources.push({ type: "PROJECT", count: Number(data.count ?? 0) });
      } else if (source === "tasks" || source === "employees") {
        if (loaded.has("tasks")) continue;
        loaded.add("tasks");
        Object.assign(data, await loadTasks(plan, actor, entities));
        sources.push({ type: "TASK" }, { type: "EMPLOYEE" });
      } else if (source === "meetings") {
        Object.assign(data, await loadMeetings(plan, actor));
        sources.push({ type: "MEETING", count: Number(data.count ?? 0) });
      } else if (source === "crm") {
        Object.assign(data, await loadCrm(actor));
        sources.push({ type: "CRM" });
      } else if (source === "finance") {
        Object.assign(data, await loadFinance(actor, plan));
        sources.push({ type: "FINANCE" });
      } else if (source === "dashboard") {
        Object.assign(data, { dashboard: await loadDashboard(actor) });
        sources.push({ type: "DASHBOARD" });
      }
    }

    if (env.NODE_ENV === "development") {
      data.debug = {
        question: true,
        queryPlan: data.queryPlan,
        validatedPlan: plan.operation,
        toolsUsed: data.toolsUsed,
        executionTimeMs: Date.now() - started,
        timezone: env.APP_TIMEZONE,
      };
    }

    logger.info(
      { operation: plan.operation, sources: plan.sources, processingTimeMs: Date.now() - started },
      "Dynamic business query executed",
    );

    return { intent: "DYNAMIC_QUERY", data, sources };
  },
};

import { logger } from "../../config/logger";
import { employeeService } from "../employee.service";
import { dashboardService } from "../dashboard.service";
import { taskService } from "../task.service";
import { aiPermissionAdapter } from "./permission.adapter";
import type { QueryPlan } from "./queryPlan.types";
import type { AssistantActor, AssistantSource, ExecutorPayload, ResolvedEntities } from "./types";

type WorkloadRow = {
  employeeId: string;
  projectId: string | null;
  pending: number;
  overdue: number;
  count: number;
};

function displayEmployee(item: Record<string, unknown>) {
  return String(item.displayName || item.firstName || item.id || "Unknown");
}

async function employeeNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
  const items = (await employeeService.listByIds(unique)) as Array<Record<string, unknown>>;
  return new Map(items.map((item) => [String(item.id), displayEmployee(item)]));
}

function sortRows(rows: WorkloadRow[], plan: QueryPlan) {
  const field = plan.sort.field === "pendingTasks" ? "pending" : plan.sort.field === "overdueTasks" ? "overdue" : "count";
  const direction = plan.sort.order === "ASC" ? 1 : -1;
  return rows.slice().sort((a, b) => (Number(a[field]) - Number(b[field])) * direction);
}

async function runOverdueByEmployee(plan: QueryPlan, actor: AssistantActor, entities: ResolvedEntities) {
  const rows = await taskService.workloadByAssignee(actor, {
    projectId: entities.projectId,
    assignedTo: entities.employeeId,
    overdueOnly: true,
    groupBy: ["employee"],
    limit: plan.limit,
  });
  const grouped = new Map<string, WorkloadRow>();
  for (const row of rows) {
    const current = grouped.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      projectId: row.projectId,
      pending: 0,
      overdue: 0,
      count: 0,
    };
    current.overdue += row.overdue;
    current.pending += row.pending;
    current.count += row.count;
    grouped.set(row.employeeId, current);
  }
  const ranked = sortRows([...grouped.values()], { ...plan, sort: { field: "count", order: plan.sort.order } }).slice(
    0,
    plan.limit,
  );
  const names = await employeeNames(ranked.map((row) => row.employeeId));
  const employees = ranked.map((row) => ({
    employeeId: row.employeeId,
    employee: names.get(row.employeeId) || "Unknown",
    overdue: row.overdue,
    pending: row.pending,
  }));
  return {
    employees,
    topEmployee: employees[0]?.employee ?? null,
    topOverdue: employees[0]?.overdue ?? 0,
    count: employees.length,
  };
}

async function runEmployeeWorkload(plan: QueryPlan, actor: AssistantActor, entities: ResolvedEntities) {
  const rows = await taskService.workloadByAssignee(actor, {
    projectId: entities.projectId,
    assignedTo: entities.employeeId,
    groupBy: ["employee"],
    limit: Math.min(plan.limit * 5, 100),
  });
  const grouped = new Map<string, WorkloadRow>();
  for (const row of rows) {
    const current = grouped.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      projectId: null,
      pending: 0,
      overdue: 0,
      count: 0,
    };
    current.pending += row.pending;
    current.overdue += row.overdue;
    current.count += row.count;
    grouped.set(row.employeeId, current);
  }
  let ranked = sortRows([...grouped.values()], plan);
  if (plan.filters.minPending) {
    ranked = ranked.filter((row) => row.pending >= plan.filters.minPending!);
  }
  ranked = ranked.slice(0, plan.limit);
  const names = await employeeNames(ranked.map((row) => row.employeeId));
  const employees = ranked.map((row) => ({
    employeeId: row.employeeId,
    employeeName: names.get(row.employeeId) || "Unknown",
    pendingTasks: row.pending,
    overdueTasks: row.overdue,
  }));
  return {
    employees,
    topEmployee: employees[0]?.employeeName ?? null,
    topPending: employees[0]?.pendingTasks ?? 0,
    count: employees.length,
  };
}

async function runDelayedProjectWorkload(plan: QueryPlan, actor: AssistantActor, entities: ResolvedEntities) {
  const health = await dashboardService.getProjectHealth(actor, { limit: plan.limit });
  const delayed = (plan.filters.delayed
    ? health.items.filter((item) => item.health === "YELLOW" || item.health === "RED" || item.status === "AT_RISK")
    : health.items
  ).filter((item) => !entities.projectId || String(item.id) === entities.projectId);
  const projectIds = delayed.map((item) => String(item.id));
  const rows = projectIds.length
    ? await taskService.workloadByAssignee(actor, {
        projectIds,
        assignedTo: entities.employeeId,
        groupBy: ["employee", "project"],
        limit: 100,
      })
    : [];

  const byProject = new Map<string, { pending: number; overdue: number; employees: Map<string, WorkloadRow> }>();
  for (const row of rows) {
    if (!row.projectId) continue;
    const bucket = byProject.get(row.projectId) ?? { pending: 0, overdue: 0, employees: new Map() };
    bucket.pending += row.pending;
    bucket.overdue += row.overdue;
    const current = bucket.employees.get(row.employeeId) ?? { ...row, pending: 0, overdue: 0, count: 0 };
    current.pending += row.pending;
    current.overdue += row.overdue;
    current.count += row.count;
    bucket.employees.set(row.employeeId, current);
    byProject.set(row.projectId, bucket);
  }

  const employeeIds = rows.map((row) => row.employeeId);
  const names = await employeeNames(employeeIds);
  const minPending = plan.filters.minPending;

  const projects = delayed
    .map((item) => {
      const stats = byProject.get(String(item.id));
      const employees = [...(stats?.employees.values() ?? [])]
        .sort((a, b) => b.pending - a.pending)
        .filter((row) => (minPending ? row.pending >= minPending : true))
        .slice(0, 5)
        .map((row) => ({
          employeeId: row.employeeId,
          employeeName: names.get(row.employeeId) || "Unknown",
          pendingTasks: row.pending,
          overdueTasks: row.overdue,
        }));
      return {
        projectId: item.projectId,
        id: String(item.id),
        projectName: item.name,
        status: item.status,
        health: item.health,
        progress: item.progress,
        pendingTasks: stats?.pending ?? item.pendingTasks ?? 0,
        overdueTasks: stats?.overdue ?? item.overdueTasks ?? 0,
        budget: item.budget,
        expense: item.expense,
        employees,
      };
    })
    .filter((item) => (minPending ? item.employees.length > 0 : true))
    .slice(0, plan.limit);

  return {
    projects,
    count: projects.length,
    delayedCount: delayed.length,
  };
}

export const queryPlanExecutor = {
  async execute(plan: QueryPlan, actor: AssistantActor, entities: ResolvedEntities): Promise<ExecutorPayload> {
    aiPermissionAdapter.assertQuery(plan.intent, actor);
    const toolsUsed = plan.tools.map((item) => item.tool);
    const started = Date.now();

    let composed: Record<string, unknown> = { toolsUsed, queryPlan: {
      queryType: plan.queryType,
      datasets: plan.datasets,
      tools: toolsUsed,
      filters: plan.filters,
      groupBy: plan.groupBy,
      sort: plan.sort,
      limit: plan.limit,
    } };
    const sources: AssistantSource[] = [];

    if (plan.intent === "EMPLOYEE_OVERDUE_RANKING") {
      composed = { ...composed, ...(await runOverdueByEmployee(plan, actor, entities)) };
      sources.push({ type: "TASK" }, { type: "EMPLOYEE" });
    } else if (plan.intent === "EMPLOYEE_WORKLOAD") {
      composed = { ...composed, ...(await runEmployeeWorkload(plan, actor, entities)) };
      sources.push({ type: "TASK" }, { type: "EMPLOYEE" });
    } else {
      composed = { ...composed, ...(await runDelayedProjectWorkload(plan, actor, entities)) };
      sources.push({ type: "PROJECT" }, { type: "TASK" }, { type: "EMPLOYEE" });
    }

    logger.info(
      { intent: plan.intent, tools: toolsUsed, processingTimeMs: Date.now() - started },
      "Analytical query plan executed",
    );

    return {
      intent: plan.intent,
      data: composed,
      sources,
    };
  },
};

import { ASSISTANT_QUERY_PLAN_MAX_LIMIT, type AssistantIntent } from "../../utils/constants";

export const PLAN_DATASETS = ["tasks", "projects", "employees"] as const;
export type PlanDataset = (typeof PLAN_DATASETS)[number];

export const PLAN_TOOLS = [
  "get_overdue_by_employee",
  "get_employee_workload",
  "get_projects",
  "get_project_task_workload",
] as const;
export type PlanToolName = (typeof PLAN_TOOLS)[number];

export const PLAN_GROUP_BY = ["employee", "project"] as const;
export type PlanGroupBy = (typeof PLAN_GROUP_BY)[number];

export const PLAN_SORT_FIELDS = ["count", "pendingTasks", "overdueTasks"] as const;
export type PlanSortField = (typeof PLAN_SORT_FIELDS)[number];

const FORBIDDEN_KEYS = new Set([
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$ne",
  "$in",
  "$nin",
  "$or",
  "$and",
  "$nor",
  "$not",
  "$where",
  "$expr",
  "$regex",
  "$match",
  "$group",
  "$lookup",
  "find",
  "aggregate",
]);

export type QueryPlanFilters = {
  overdue?: boolean;
  pending?: boolean;
  delayed?: boolean;
  projectName?: string;
  employeeName?: string;
  minPending?: number;
};

export type QueryPlan = {
  intent: AssistantIntent;
  queryType: "AGGREGATION" | "MULTI_TOOL";
  datasets: PlanDataset[];
  tools: Array<{ tool: PlanToolName; purpose?: string }>;
  filters: QueryPlanFilters;
  groupBy: PlanGroupBy[];
  sort: { field: PlanSortField; order: "ASC" | "DESC" };
  limit: number;
};

export class QueryPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryPlanValidationError";
  }
}

function asStringSet<T extends string>(values: readonly T[]): Set<string> {
  return new Set(values);
}

function rejectForbidden(value: unknown, path = "plan"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) rejectForbidden(item, `${path}[${index}]`);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.trim().toLowerCase();
    if (key.startsWith("$") || FORBIDDEN_KEYS.has(normalized) || key.includes(".")) {
      throw new QueryPlanValidationError(`Unsafe field ${path}.${key} is not allowed`);
    }
    rejectForbidden(nested, `${path}.${key}`);
  }
}

export function clampPlanLimit(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 10;
  return Math.min(Math.floor(value), ASSISTANT_QUERY_PLAN_MAX_LIMIT);
}

export function validateQueryPlan(raw: unknown): QueryPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new QueryPlanValidationError("Query plan must be an object");
  }
  rejectForbidden(raw);
  const record = raw as Record<string, unknown>;
  const intent = String(record.intent ?? "").toUpperCase() as AssistantIntent;
  const allowedIntents = new Set<string>([
    "EMPLOYEE_OVERDUE_RANKING",
    "EMPLOYEE_WORKLOAD",
    "DELAYED_PROJECT_WORKLOAD",
  ]);
  if (!allowedIntents.has(intent)) {
    throw new QueryPlanValidationError("Unknown analytical intent");
  }

  const queryType = record.queryType === "MULTI_TOOL" ? "MULTI_TOOL" : "AGGREGATION";
  const datasets = Array.isArray(record.datasets) ? record.datasets.map((item) => String(item)) : [];
  const datasetSet = asStringSet(PLAN_DATASETS);
  if (datasets.length === 0 || datasets.some((item) => !datasetSet.has(item))) {
    throw new QueryPlanValidationError("Unknown dataset in query plan");
  }

  const toolsRaw = Array.isArray(record.tools) ? record.tools : [];
  const toolSet = asStringSet(PLAN_TOOLS);
  const tools: QueryPlan["tools"] = [];
  for (const item of toolsRaw) {
    const name = item && typeof item === "object" ? String((item as { tool?: unknown }).tool ?? "") : String(item);
    if (!toolSet.has(name)) {
      throw new QueryPlanValidationError(`Unknown tool ${name || "(empty)"}`);
    }
    tools.push({
      tool: name as PlanToolName,
      purpose:
        item && typeof item === "object" && typeof (item as { purpose?: unknown }).purpose === "string"
          ? String((item as { purpose: string }).purpose).slice(0, 120)
          : undefined,
    });
  }
  if (tools.length === 0) {
    throw new QueryPlanValidationError("Query plan has no tools");
  }

  const groupSet = asStringSet(PLAN_GROUP_BY);
  const groupBy = (Array.isArray(record.groupBy) ? record.groupBy.map((item) => String(item)) : []).filter(Boolean);
  if (groupBy.some((item) => !groupSet.has(item))) {
    throw new QueryPlanValidationError("Invalid groupBy field");
  }

  const sortRaw = record.sort && typeof record.sort === "object" ? (record.sort as Record<string, unknown>) : {};
  const sortField = String(sortRaw.field ?? "count");
  if (!asStringSet(PLAN_SORT_FIELDS).has(sortField)) {
    throw new QueryPlanValidationError("Invalid sort field");
  }
  const sortOrder = String(sortRaw.order ?? "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

  const filtersRaw =
    record.filters && typeof record.filters === "object" && !Array.isArray(record.filters)
      ? (record.filters as Record<string, unknown>)
      : {};
  const minPending = Number(filtersRaw.minPending);
  const filters: QueryPlanFilters = {
    overdue: filtersRaw.overdue === true ? true : undefined,
    pending: filtersRaw.pending === true ? true : undefined,
    delayed: filtersRaw.delayed === true ? true : undefined,
    projectName: typeof filtersRaw.projectName === "string" ? filtersRaw.projectName.slice(0, 80) : undefined,
    employeeName: typeof filtersRaw.employeeName === "string" ? filtersRaw.employeeName.slice(0, 80) : undefined,
    minPending: Number.isFinite(minPending) && minPending > 0 ? Math.min(Math.floor(minPending), 10_000) : undefined,
  };

  return {
    intent,
    queryType,
    datasets: datasets as PlanDataset[],
    tools,
    filters,
    groupBy: groupBy as PlanGroupBy[],
    sort: { field: sortField as PlanSortField, order: sortOrder },
    limit: clampPlanLimit(record.limit),
  };
}

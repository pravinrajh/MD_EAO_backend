import type { AssistantIntent } from "../../utils/constants";
import type { LlmConversationTurn } from "./gemini.provider";
import { validateQueryPlan, type QueryPlan } from "./queryPlan.types";
import type { ExtractedEntities } from "./types";

const PRONOUNS = /\b(he|him|his|she|her|they|them|that employee)\b/;

export function applyConversationEntities(
  extracted: ExtractedEntities,
  lastEntities: Record<string, unknown> | undefined,
  normalized: string,
): ExtractedEntities {
  if (!lastEntities) return extracted;
  const next = { ...extracted };
  if (!next.employeeName && PRONOUNS.test(normalized) && typeof lastEntities.employeeName === "string") {
    next.employeeName = lastEntities.employeeName;
  }
  const followUp = /^(why|why is it(?: at risk)?|why delayed|who is responsible|who is handling|who is the manager|what is pending|what s pending|pending)$/.test(
    normalized,
  );
  if (
    !next.projectName &&
    (followUp ||
      (/\b(that|the|this|it)\s+projects?\b|\bin (chennai|bangalore|that)\b/.test(normalized) === false &&
        /\b(that|this|the)\s+project\b/.test(normalized))) &&
    typeof lastEntities.projectName === "string"
  ) {
    next.projectName = lastEntities.projectName;
  }
  if (!next.projectId && followUp && typeof lastEntities.projectId === "string") {
    next.projectId = lastEntities.projectId;
  }
  return next;
}

function minPendingFromText(normalized: string, extracted: ExtractedEntities): number | undefined {
  if (typeof extracted.minPending === "number") return extracted.minPending;
  const match = normalized.match(/\b(?:more than|over|at least)\s+(\d{1,4})\b/);
  if (match) return Number(match[1]);
  if (/\boverloaded\b/.test(normalized)) return 10;
  return undefined;
}

export function buildRuleQueryPlan(input: {
  normalized: string;
  extracted: ExtractedEntities;
}): QueryPlan | null {
  const n = input.normalized;
  const minPending = minPendingFromText(n, input.extracted);
  const projectName = input.extracted.projectName;
  const employeeName = input.extracted.employeeName;

  const ranking =
    (/\b(which|who)\b/.test(n) && /\boverdue\b/.test(n) && /\b(employee|most)\b/.test(n)) ||
    (/\bmost overdue\b/.test(n) && /\b(employee|who|whom)\b/.test(n));
  if (ranking) {
    return validateQueryPlan({
      intent: "EMPLOYEE_OVERDUE_RANKING",
      queryType: "AGGREGATION",
      datasets: ["tasks", "employees"],
      tools: [{ tool: "get_overdue_by_employee", purpose: "Rank employees by overdue tasks" }],
      filters: { overdue: true, projectName, employeeName },
      groupBy: ["employee"],
      sort: { field: "count", order: "DESC" },
      limit: 10,
    });
  }

  if (employeeName && /\bprojects?\b/.test(n) && /\b(working|work|which project|assigned|panna)\b/.test(n)) {
    return validateQueryPlan({
      intent: "DELAYED_PROJECT_WORKLOAD",
      queryType: "MULTI_TOOL",
      datasets: ["projects", "tasks", "employees"],
      tools: [{ tool: "get_project_task_workload", purpose: "Projects linked to the referenced employee" }],
      filters: { projectName, employeeName },
      groupBy: ["project", "employee"],
      sort: { field: "pendingTasks", order: "DESC" },
      limit: 10,
    });
  }

  const opsAndFinance =
    (/\bprojects?\b/.test(n) && /\b(expense|expenses|spending|spend)\b/.test(n) && /\boverdue\b/.test(n)) ||
    (/\bprojects?\b/.test(n) && /\b(low progress|progress)\b/.test(n) && /\b(high spending|spending|expense)\b/.test(n));
  if (opsAndFinance) {
    return validateQueryPlan({
      intent: "DELAYED_PROJECT_WORKLOAD",
      queryType: "MULTI_TOOL",
      datasets: ["projects", "tasks", "employees"],
      tools: [
        { tool: "get_projects", purpose: "Projects with spend and overdue work" },
        { tool: "get_project_task_workload", purpose: "Overdue and pending tasks by project" },
      ],
      filters: { delayed: false, pending: true, projectName, employeeName, minPending },
      groupBy: ["project"],
      sort: { field: "overdueTasks", order: "DESC" },
      limit: 10,
    });
  }

  const delayedWorkload =
    (/\bdelayed\b/.test(n) && /\bprojects?\b/.test(n)) ||
    (/\bprojects?\b/.test(n) && /\b(workload|pending tasks|overloaded|because)\b/.test(n) && /\b(employee|assigned)\b/.test(n)) ||
    (/\boverloaded\b/.test(n) && /\bprojects?\b/.test(n));
  if (delayedWorkload) {
    return validateQueryPlan({
      intent: "DELAYED_PROJECT_WORKLOAD",
      queryType: "MULTI_TOOL",
      datasets: ["projects", "tasks", "employees"],
      tools: [
        { tool: "get_projects", purpose: "Get delayed or at-risk projects" },
        { tool: "get_project_task_workload", purpose: "Pending and overdue tasks by project and employee" },
        { tool: "get_employee_workload", purpose: "Employee pending workload" },
      ],
      filters: { delayed: true, pending: true, projectName, employeeName, minPending },
      groupBy: ["project", "employee"],
      sort: { field: "pendingTasks", order: "DESC" },
      limit: 10,
    });
  }

  const workload =
    /\boverloaded\b/.test(n) ||
    (/\b(most|highest)\b/.test(n) && /\bpending\b/.test(n) && /\b(employee|workload|who)\b/.test(n)) ||
    (/\bemployee workload\b/.test(n) || /\bwho is overloaded\b/.test(n));
  if (workload) {
    return validateQueryPlan({
      intent: "EMPLOYEE_WORKLOAD",
      queryType: "AGGREGATION",
      datasets: ["tasks", "employees"],
      tools: [{ tool: "get_employee_workload", purpose: "Pending and overdue workload by employee" }],
      filters: { pending: true, projectName, employeeName, minPending },
      groupBy: ["employee"],
      sort: { field: "pendingTasks", order: "DESC" },
      limit: 10,
    });
  }

  return null;
}

export const queryPlanner = {
  applyConversationEntities,
  buildRuleQueryPlan,
  validate: validateQueryPlan,

  async plan(input: {
    original: string;
    normalized: string;
    extracted: ExtractedEntities;
    context?: LlmConversationTurn[];
  }): Promise<QueryPlan | null> {
    const rules = buildRuleQueryPlan({ normalized: input.normalized, extracted: input.extracted });
    return rules;
  },

  isAnalyticalIntent(intent: AssistantIntent) {
    return (
      intent === "EMPLOYEE_OVERDUE_RANKING" ||
      intent === "EMPLOYEE_WORKLOAD" ||
      intent === "DELAYED_PROJECT_WORKLOAD"
    );
  },
};

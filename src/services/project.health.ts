import {
  DASHBOARD_BUDGET_ATTENTION_PERCENT,
  DASHBOARD_SERIOUS_OVERDUE_TASKS,
  type DashboardHealth,
  type ProjectHealth,
  type ProjectStatus,
} from "../utils/constants";

export type ProjectHealthInput = {
  status: ProjectStatus;
  remainingBudget: number;
  overdueTasks: number;
  budget?: number;
  actualExpense?: number;
  progress?: number;
};

export function remainingBudget(budget: number, actualExpense: number): number {
  return budget - actualExpense;
}

function budgetUtilizationPercent(budget: number, actualExpense: number): number {
  if (budget <= 0) return 0;
  return Math.floor((actualExpense * 100) / budget);
}

/**
 * Deterministic project health used by Project APIs and the MD dashboard.
 * GREEN/YELLOW/RED are a dashboard mapping of HEALTHY/ATTENTION/CRITICAL.
 */
export function projectHealth(input: ProjectHealthInput): ProjectHealth {
  if (input.status === "CANCELLED" || input.status === "AT_RISK" || input.remainingBudget < 0) {
    return "CRITICAL";
  }
  if (input.overdueTasks >= DASHBOARD_SERIOUS_OVERDUE_TASKS) {
    return "CRITICAL";
  }
  if (input.overdueTasks > 0) return "ATTENTION";
  if (
    typeof input.budget === "number" &&
    typeof input.actualExpense === "number" &&
    budgetUtilizationPercent(input.budget, input.actualExpense) >= DASHBOARD_BUDGET_ATTENTION_PERCENT
  ) {
    return "ATTENTION";
  }
  return "HEALTHY";
}

export function toDashboardHealth(health: ProjectHealth): DashboardHealth {
  if (health === "CRITICAL") return "RED";
  if (health === "ATTENTION") return "YELLOW";
  return "GREEN";
}

export function parseDashboardHealth(value: string): ProjectHealth | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "GREEN" || normalized === "HEALTHY") return "HEALTHY";
  if (normalized === "YELLOW" || normalized === "ATTENTION" || normalized === "AT_RISK") return "ATTENTION";
  if (normalized === "RED" || normalized === "CRITICAL") return "CRITICAL";
  return null;
}

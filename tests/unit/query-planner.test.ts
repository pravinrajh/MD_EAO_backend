import { QueryPlanValidationError, clampPlanLimit, validateQueryPlan } from "../../src/services/assistant/queryPlan.types";
import { buildRuleQueryPlan } from "../../src/services/assistant/queryPlanner.service";
import { normalizeQuery } from "../../src/services/assistant/intentRouter.service";

describe("query plan validation", () => {
  it("clamps huge limits", () => {
    expect(clampPlanLimit(1_000_000)).toBe(100);
    expect(clampPlanLimit(0)).toBe(10);
  });

  it("rejects Mongo operators and unknown sort fields", () => {
    expect(() => validateQueryPlan({ intent: "EMPLOYEE_OVERDUE_RANKING", $where: "1" })).toThrow(
      QueryPlanValidationError,
    );
    expect(() =>
      validateQueryPlan({
        intent: "EMPLOYEE_OVERDUE_RANKING",
        queryType: "AGGREGATION",
        datasets: ["tasks", "employees"],
        tools: [{ tool: "get_overdue_by_employee" }],
        groupBy: ["employee"],
        sort: { field: "password", order: "DESC" },
        limit: 10,
      }),
    ).toThrow(/sort field/);
  });

  it("builds a multi-tool delayed project plan", () => {
    const plan = buildRuleQueryPlan({
      normalized: normalizeQuery(
        "Which projects are delayed because the assigned employees have too many pending tasks?",
      ).normalized,
      extracted: { minPending: 10 },
    });
    expect(plan?.intent).toBe("DELAYED_PROJECT_WORKLOAD");
    expect(plan?.queryType).toBe("MULTI_TOOL");
    expect(plan?.datasets).toEqual(expect.arrayContaining(["projects", "tasks", "employees"]));
  });
});

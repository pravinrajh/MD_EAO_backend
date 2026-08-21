import { answerUsesFacts } from "../../src/services/assistant/ai.orchestrator";
import { ACTION_INTENT_ALIASES, QUERY_INTENT_ALIASES, sanitizeLlmEntities } from "../../src/services/assistant/gemini.provider";
import { queryToolName, actionToolName } from "../../src/services/assistant/toolRegistry";

describe("AI layer helpers", () => {
  it("maps Gemini aliases to existing intents", () => {
    expect(QUERY_INTENT_ALIASES.AT_RISK_PROJECTS).toBe("PROJECT_HEALTH");
    expect(QUERY_INTENT_ALIASES.EXECUTIVE_SUMMARY).toBe("COMPANY_SUMMARY");
    expect(ACTION_INTENT_ALIASES.CREATE_AND_ASSIGN_TASK).toBe("CREATE_TASK");
  });

  it("registers only controlled tools", () => {
    expect(queryToolName("PENDING_TASKS")).toBe("get_pending_tasks");
    expect(actionToolName("CREATE_TASK")).toBe("create_task");
    expect(queryToolName("UNSUPPORTED")).toBeNull();
    expect(queryToolName("SMALLTALK")).toBeNull();
    expect(actionToolName("UNSUPPORTED")).toBeNull();
  });

  it("strips Mongo operators and unknown entity keys from Gemini output", () => {
    expect(
      sanitizeLlmEntities({
        title: "Electrical Verification",
        employeeName: "Raju",
        $gt: "",
        "assignedTo.$ne": "x",
        nested: { $or: [] },
        password: "secret",
      }),
    ).toEqual({ title: "Electrical Verification", employeeName: "Raju" });
  });

  it("rejects Gemini summaries that invent counts", () => {
    expect(answerUsesFacts("You have 12 pending tasks.", { count: 12 })).toBe(true);
    expect(answerUsesFacts("You have many pending tasks.", { count: 12 })).toBe(false);
  });
});

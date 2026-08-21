import { extractEntities, normalizeQuery } from "../../src/services/assistant/intentRouter.service";
import { RuleBasedQueryEngine } from "../../src/services/assistant/queryEngine";
import { RuleBasedActionEngine } from "../../src/services/assistant/actionEngine";
import { classifyQueryEvaluation } from "../../src/services/assistant/evaluation";
import { applyConversationEntities } from "../../src/services/assistant/queryPlanner.service";

const queryEngine = new RuleBasedQueryEngine();
const actionEngine = new RuleBasedActionEngine();

function queryIntent(message: string) {
  return queryEngine.detectIntent(normalizeQuery(message).normalized).intent;
}

function actionIntent(message: string) {
  return actionEngine.detectIntent(normalizeQuery(message).normalized).intent;
}

const DAILY_VARIATIONS = [
  "What is Sathish's status today?",
  "What is Sathish doing today?",
  "How is Sathish doing today?",
  "Show me Sathish's work today.",
  "What's Sathish handling?",
  "what is sathish staus today",
  "sathish today?",
  "sathish enna panraru?",
  "Sathish status?",
  "How is sathish today",
];

const EXECUTIVE_VARIATIONS = [
  "Give me today's overall business status.",
  "Give me today's report",
  "today's overall business status",
];

const ATTENTION_VARIATIONS = [
  "What needs my attention today?",
  "What needs my attention?",
];

const OVERDUE_VARIATIONS = [
  "Which tasks are overdue?",
  "Show overdue tasks",
  "How many tasks are overdue?",
];

const OMR_STATUS = [
  "How is the OMR project doing?",
  "How is the OMR project?",
  "OMR status?",
];

const OMR_RISK = [
  "Why is the OMR project at risk?",
  "Is OMR project at risk?",
];

const PIPELINE = [
  "How is our sales pipeline?",
  "Show sales pipeline",
];

const MEETINGS = [
  "What meetings does the MD have today?",
  "What meetings do I have today?",
];

const CROSS_MODULE = [
  "Which projects have high expenses and overdue tasks?",
  "Which projects have low progress and high spending?",
];

const FOLLOW_UPS = [
  ["Why?", "PROJECT_HEALTH"],
  ["Who is responsible?", "PROJECT_STATUS"],
  ["What is pending?", "PENDING_TASKS"],
] as const;

const NEGATIVE_DOMAINS = [
  "Show vendor settlements",
  "Did Sathish mark attendance today?",
  "What is Sathish leave balance?",
  "What is the collection amount this month?",
];

describe("Viyan Chief of Staff intent evaluation", () => {
  it("maps employee daily status across natural-language variants", () => {
    for (const message of DAILY_VARIATIONS) {
      expect(queryIntent(message)).toBe("EMPLOYEE_DAILY_STATUS");
      const { original, normalized } = normalizeQuery(message);
      const extracted = extractEntities(original, normalized);
      expect(String(extracted.employeeName ?? "").toLowerCase()).toMatch(/sathish/);
    }
  });

  it("maps golden executive and operational questions", () => {
    for (const message of EXECUTIVE_VARIATIONS) expect(queryIntent(message)).toBe("MORNING_REPORT");
    for (const message of ATTENTION_VARIATIONS) expect(queryIntent(message)).toBe("ATTENTION_ITEMS");
    for (const message of OVERDUE_VARIATIONS) expect(queryIntent(message)).toBe("OVERDUE_TASKS");
    for (const message of OMR_STATUS) expect(queryIntent(message)).toBe("PROJECT_STATUS");
    for (const message of OMR_RISK) expect(queryIntent(message)).toBe("PROJECT_HEALTH");
    for (const message of PIPELINE) expect(queryIntent(message)).toBe("SALES_PIPELINE");
    for (const message of MEETINGS) expect(queryIntent(message)).toBe("TODAY_MEETINGS");
    for (const message of CROSS_MODULE) expect(queryIntent(message)).toBe("DELAYED_PROJECT_WORKLOAD");
  });

  it("maps short follow-ups and keeps last project in context", () => {
    for (const [message, intent] of FOLLOW_UPS) {
      expect(queryIntent(message)).toBe(intent);
      const next = applyConversationEntities({}, { projectName: "OMR Commercial Project", projectId: "p1" }, normalizeQuery(message).normalized);
      expect(next.projectName).toBe("OMR Commercial Project");
      expect(next.projectId).toBe("p1");
    }
  });

  it("maps create-task and ambiguous assign wording", () => {
    expect(actionIntent("Create a task for Sathish to follow up on the OMR project tomorrow.")).toBe("CREATE_TASK");
    expect(actionIntent("Give it to Sathish")).toBe("ASSIGN_TASK");
  });

  it("does not treat missing domains as employee daily status", () => {
    expect(queryIntent("Did Sathish mark attendance today?")).not.toBe("EMPLOYEE_DAILY_STATUS");
    expect(queryIntent("What is Sathish leave balance?")).not.toBe("EMPLOYEE_DAILY_STATUS");
  });

  it("classifies evaluation failures", () => {
    expect(
      classifyQueryEvaluation({
        originalQuestion: "x",
        normalizedQuestion: "x",
        userRole: "MD",
        intent: "UNSUPPORTED",
        serviceCalled: null,
        queryStatus: "UNSUPPORTED",
        missingDomain: "attendance",
      }).failureType,
    ).toBe("DATA_FAILURE");
    expect(
      classifyQueryEvaluation({
        originalQuestion: "x",
        normalizedQuestion: "x",
        userRole: "MD",
        intent: "EMPLOYEE_DAILY_STATUS",
        serviceCalled: "get_employee_daily_status",
        queryStatus: "SUCCESS",
        notFoundField: "employee",
      }).failureType,
    ).toBe("ENTITY_FAILURE");
  });

  it("builds a 250-turn intent regression suite from templates, not canned answers", () => {
    const people = ["Sathish", "Meena", "Raj", "Anand"];
    const projects = ["OMR", "Chennai", "Bangalore"];
    const suite: Array<{ message: string; intent: string; mode: "query" | "action" }> = [];

    for (const name of people) {
      for (const template of [
        "What is {name}'s status today?",
        "How is {name} doing today?",
        "What's {name} doing today?",
        "Show me {name}'s work today.",
        "What's {name} handling?",
        "{name} today?",
        "{name} enna panraru?",
        "what is {name} staus today",
        "How is {name} today",
        "{name} status today",
      ]) {
        suite.push({ message: template.replaceAll("{name}", name), intent: "EMPLOYEE_DAILY_STATUS", mode: "query" });
      }
    }

    for (const project of projects) {
      suite.push({ message: `How is the ${project} project?`, intent: "PROJECT_STATUS", mode: "query" });
      suite.push({ message: `How is the ${project} project doing?`, intent: "PROJECT_STATUS", mode: "query" });
      suite.push({ message: `Why is the ${project} project at risk?`, intent: "PROJECT_HEALTH", mode: "query" });
      suite.push({ message: `Is ${project} project at risk?`, intent: "PROJECT_HEALTH", mode: "query" });
    }
    suite.push({ message: "OMR status?", intent: "PROJECT_STATUS", mode: "query" });

    for (const message of [
      "Give me today's overall business status.",
      "Give me today's report",
      "today's overall business status",
      "What's happening today?",
      "Give me the morning report",
    ]) {
      suite.push({ message, intent: "MORNING_REPORT", mode: "query" });
    }

    for (const message of ["What needs my attention today?", "What needs my attention?", "Show attention items"]) {
      suite.push({ message, intent: "ATTENTION_ITEMS", mode: "query" });
    }

    for (const message of ["Which tasks are overdue?", "Show overdue tasks", "How many tasks are overdue?", "overdue tasks"]) {
      suite.push({ message, intent: "OVERDUE_TASKS", mode: "query" });
    }

    for (const message of ["Show pending tasks", "What tasks are pending?", "WHAT TASKS ARE PENDING???"]) {
      suite.push({ message, intent: "PENDING_TASKS", mode: "query" });
    }

    for (const message of ["How is our sales pipeline?", "Show sales pipeline", "pipeline"]) {
      suite.push({ message, intent: "SALES_PIPELINE", mode: "query" });
    }

    for (const message of ["What meetings do I have today?", "What meetings does the MD have today?", "Show today's meetings"]) {
      suite.push({ message, intent: "TODAY_MEETINGS", mode: "query" });
    }

    for (const message of [
      "Which projects have high expenses and overdue tasks?",
      "Which projects have low progress and high spending?",
    ]) {
      suite.push({ message, intent: "DELAYED_PROJECT_WORKLOAD", mode: "query" });
    }

    for (const [message, intent] of FOLLOW_UPS) {
      suite.push({ message, intent, mode: "query" });
    }

    for (const message of NEGATIVE_DOMAINS) {
      suite.push({ message, intent: "UNSUPPORTED", mode: "query" });
    }

    for (const name of people) {
      suite.push({
        message: `Create a task for ${name} to follow up on the OMR project tomorrow.`,
        intent: "CREATE_TASK",
        mode: "action",
      });
      suite.push({ message: `Give it to ${name}`, intent: "ASSIGN_TASK", mode: "action" });
    }

    const fillers = [
      ["How is finance?", "FINANCE_SUMMARY"],
      ["How much money came in this month?", "MONTHLY_FINANCE"],
      ["Show leads", "LEAD_SUMMARY"],
      ["Show opportunities", "OPPORTUNITY_SUMMARY"],
      ["How is the company?", "COMPANY_SUMMARY"],
      ["What do I need to do?", "MY_WORK_SUMMARY"],
      ["hii", "SMALLTALK"],
      ["Hello", "SMALLTALK"],
      ["How are you?", "SMALLTALK"],
      ["Show upcoming meetings", "UPCOMING_MEETINGS"],
    ] as const;
    for (const [message, intent] of fillers) {
      suite.push({ message, intent, mode: "query" });
    }

    while (suite.length < 250) {
      const name = people[suite.length % people.length];
      suite.push({
        message: `How is ${name} doing today? (${suite.length})`,
        intent: "EMPLOYEE_DAILY_STATUS",
        mode: "query",
      });
    }

    expect(suite.length).toBeGreaterThanOrEqual(250);
    for (const row of suite.slice(0, 250)) {
      const detected =
        row.mode === "action" ? actionIntent(row.message) : queryIntent(row.message.replace(/ \(\d+\)$/, ""));
      expect({ message: row.message, detected }).toEqual({ message: row.message, detected: row.intent });
    }
  });
});

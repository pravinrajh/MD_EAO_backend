import type { AssistantIntent } from "../../utils/constants";
import type { AssistantQueryEngine, DetectedIntent } from "./types";

type IntentRule = {
  intent: AssistantIntent;
  score: number;
  test: (normalized: string) => boolean;
};

const has = (text: string, ...needles: string[]) => needles.every((needle) => text.includes(needle));
const any = (text: string, ...needles: string[]) => needles.some((needle) => text.includes(needle));
const re = (text: string, pattern: RegExp) => pattern.test(text);

/**
 * Deterministic, production-safe intent detection.
 * User text never becomes a MongoDB query, operator, or function name.
 */
const RULES: IntentRule[] = [
  {
    intent: "WEEKLY_FINANCIAL_REQUIREMENT",
    score: 100,
    test: (n) =>
      (re(n, /\b(money|cash|funds?|capital)\b/) &&
        re(n, /\b(need|require|needed|requirement)\b/) &&
        re(n, /\bweek\b/)) ||
      has(n, "weekly financial") ||
      has(n, "financial requirement"),
  },
  {
    intent: "MORNING_REPORT",
    score: 98,
    test: (n) =>
      has(n, "morning report") ||
      has(n, "today", "report") ||
      has(n, "daily report") ||
      has(n, "give me today") ||
      re(n, /\btoday'?s report\b/),
  },
  {
    intent: "PROJECT_FINANCE",
    score: 96,
    test: (n) =>
      has(n, "project") && any(n, "spent", "spend", "expense", "expenses", "budget", "finance", "cost") &&
      !has(n, "over budget") &&
      !has(n, "company"),
  },
  {
    intent: "PROJECT_TASKS",
    score: 95,
    test: (n) => has(n, "project") && re(n, /\btasks?\b/) && !re(n, /\boverdue\b/),
  },
  {
    intent: "PROJECT_HEALTH",
    score: 94,
    test: (n) =>
      has(n, "project") && any(n, "at risk", "health", "healthy", "critical", "risk") && !has(n, "company"),
  },
  {
    intent: "MONTHLY_FINANCE",
    score: 93,
    test: (n) =>
      (any(n, "this month", "current month", "monthly") &&
        any(n, "money", "income", "came in", "received", "spent", "expense", "finance")) ||
      has(n, "monthly finance"),
  },
  {
    intent: "SALES_PIPELINE",
    score: 92,
    test: (n) => has(n, "pipeline") || has(n, "sales pipeline"),
  },
  {
    intent: "TODAY_MEETINGS",
    score: 91,
    test: (n) =>
      re(n, /\bmeetings?\b/) && any(n, "today", "do i have") && !has(n, "upcoming") && !has(n, "report"),
  },
  {
    intent: "UPCOMING_MEETINGS",
    score: 90,
    test: (n) => has(n, "upcoming") && re(n, /\bmeetings?\b/),
  },
  {
    intent: "TODAY_TASKS",
    score: 90,
    test: (n) => re(n, /\btasks?\b/) && has(n, "today") && !has(n, "report") && !has(n, "overdue"),
  },
  {
    intent: "OVERDUE_TASKS",
    score: 89,
    test: (n) => re(n, /\boverdue\b/) && re(n, /\btasks?\b/),
  },
  {
    intent: "PENDING_TASKS",
    score: 88,
    test: (n) => re(n, /\bpending\b/) && re(n, /\btasks?\b/),
  },
  {
    intent: "ATTENTION_ITEMS",
    score: 87,
    test: (n) => any(n, "attention", "needs my attention", "require my attention", "what needs"),
  },
  {
    intent: "MY_WORK_SUMMARY",
    score: 86,
    test: (n) =>
      any(n, "what do i need to do", "what should i do", "my work", "my day") ||
      (has(n, "need to do") && !has(n, "week")),
  },
  {
    intent: "COMPANY_SUMMARY",
    score: 85,
    test: (n) => has(n, "company") && any(n, "how is", "summary", "overview", "doing") && !has(n, "finance"),
  },
  {
    intent: "BUDGET_SUMMARY",
    score: 84,
    test: (n) => any(n, "over budget", "budget summary", "are we over") || (has(n, "budget") && !has(n, "project")),
  },
  {
    intent: "PROJECT_STATUS",
    score: 83,
    test: (n) =>
      has(n, "project") &&
      (any(n, "how is", "status", "progress") || re(n, /\bhow is .+\b/)) &&
      !has(n, "company"),
  },
  {
    intent: "SALES_SUMMARY",
    score: 82,
    test: (n) => has(n, "sales") && !has(n, "pipeline") && !has(n, "meeting"),
  },
  {
    intent: "LEAD_SUMMARY",
    score: 81,
    test: (n) => re(n, /\bleads?\b/) && !has(n, "pipeline"),
  },
  {
    intent: "OPPORTUNITY_SUMMARY",
    score: 80,
    test: (n) => re(n, /\bopportunit/),
  },
  {
    intent: "FINANCE_SUMMARY",
    score: 79,
    test: (n) =>
      any(n, "finance", "financial", "cash flow", "account balance") &&
      !has(n, "month") &&
      !has(n, "week") &&
      !has(n, "project") &&
      !has(n, "budget"),
  },
  {
    intent: "MEETING_SUMMARY",
    score: 70,
    test: (n) => re(n, /\bmeetings?\b/) && !has(n, "today") && !has(n, "upcoming"),
  },
  {
    intent: "TASK_SUMMARY",
    score: 68,
    test: (n) => re(n, /\btasks?\b/) && any(n, "summary", "how are", "my tasks") && !has(n, "pending") && !has(n, "overdue"),
  },
];

const WRITE_HINT =
  /\b(create|assign|update|delete|schedule|remind|cancel|complete|reschedule)\b.+\b(task|project|meeting|reminder|lead|opportunity)\b|\b(create|assign|schedule|remind)\b/;

export class RuleBasedQueryEngine implements AssistantQueryEngine {
  detectIntent(normalized: string): DetectedIntent {
    if (!normalized) {
      return { intent: "UNSUPPORTED", confidence: 0, matchType: "none" };
    }

    if (WRITE_HINT.test(normalized) && !normalized.includes("what") && !normalized.includes("how") && !normalized.includes("show") && !normalized.includes("give")) {
      return { intent: "UNSUPPORTED", confidence: 0, matchType: "none" };
    }

    let best: IntentRule | null = null;
    for (const rule of RULES) {
      if (!rule.test(normalized)) continue;
      if (!best || rule.score > best.score) best = rule;
    }

    if (!best) {
      return { intent: "UNSUPPORTED", confidence: 0, matchType: "none" };
    }

    const matchType = best.score >= 85 ? "pattern" : "keyword";
    const confidence = best.score >= 90 ? 0.98 : best.score >= 80 ? 0.92 : 0.8;
    return { intent: best.intent, confidence, matchType };
  }
}

/**
 * Future LLM engine. Must return a structured intent only.
 * Must never access MongoDB, generate queries, or bypass authorization.
 */
export class LLMQueryEngine implements AssistantQueryEngine {
  detectIntent(_normalized: string): DetectedIntent {
    throw new Error("LLMQueryEngine is not enabled. Step 10 uses RuleBasedQueryEngine.");
  }
}

export const defaultQueryEngine: AssistantQueryEngine = new RuleBasedQueryEngine();

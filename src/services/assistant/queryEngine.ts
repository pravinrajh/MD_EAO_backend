import type { AssistantIntent } from "../../utils/constants";
import { isReadQuestion } from "./actionEngine";
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
    intent: "SMALLTALK",
    score: 101,
    test: (n) => isSmallTalk(n),
  },
  {
    intent: "PROJECT_HEALTH",
    score: 103,
    test: (n) => /^(why|why is it(?: at risk)?|why delayed)$/.test(n),
  },
  {
    intent: "PROJECT_STATUS",
    score: 103,
    test: (n) => /^(who is responsible|who is handling|who is the manager)$/.test(n),
  },
  {
    intent: "PENDING_TASKS",
    score: 103,
    test: (n) => /^(what is pending|what s pending|pending)$/.test(n),
  },
  {
    intent: "EMPLOYEE_DAILY_STATUS",
    score: 97,
    test: (n) => isEmployeeDailyStatus(n),
  },
  {
    intent: "EMPLOYEE_OVERDUE_RANKING",
    score: 99,
    test: (n) =>
      (/\b(which|who)\b/.test(n) && /\boverdue\b/.test(n) && /\b(employee|most)\b/.test(n)) ||
      (/\bmost overdue\b/.test(n) && /\b(employee|who)\b/.test(n)),
  },
  {
    intent: "DELAYED_PROJECT_WORKLOAD",
    score: 99,
    test: (n) =>
      (/\bdelayed\b/.test(n) && /\bprojects?\b/.test(n)) ||
      (/\boverloaded\b/.test(n) && /\bprojects?\b/.test(n)) ||
      (/\bprojects?\b/.test(n) && /\b(workload|pending tasks|because)\b/.test(n) && /\b(employee|assigned)\b/.test(n)) ||
      (/\bprojects?\b/.test(n) && /\b(expense|expenses|spending|spend)\b/.test(n) && /\boverdue\b/.test(n)) ||
      (/\bprojects?\b/.test(n) && /\b(low progress|progress)\b/.test(n) && /\b(high spending|spending|expense)\b/.test(n)),
  },
  {
    intent: "EMPLOYEE_WORKLOAD",
    score: 97,
    test: (n) =>
      /\boverloaded\b/.test(n) ||
      (/\b(most|highest)\b/.test(n) && /\bpending\b/.test(n) && /\b(employee|workload|who)\b/.test(n)) ||
      /\bemployee workload\b/.test(n),
  },
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
      re(n, /\btoday'?s report\b/) ||
      (has(n, "overall") && any(n, "status", "business")) ||
      (has(n, "business status") && has(n, "today")) ||
      (has(n, "happening") && has(n, "today")),
  },
  {
    intent: "INVOICE_SUMMARY",
    score: 96,
    test: (n) => re(n, /\b(invoice|invoices)\b/) && isReadQuestion(n),
  },
  {
    intent: "VENDOR_LIST",
    score: 96,
    test: (n) => re(n, /\bvendors?\b/) && isReadQuestion(n),
  },
  {
    intent: "LAND_PARCEL_LIST",
    score: 96,
    test: (n) => any(n, "land", "parcel") && isReadQuestion(n),
  },
  {
    intent: "MD_NOTES",
    score: 96,
    test: (n) => re(n, /\bnotes?\b/) && isReadQuestion(n),
  },
  {
    intent: "PENDING_TASKS",
    score: 96,
    test: (n) => has(n, "pending") && has(n, "project") && !has(n, "overdue") && !re(n, /\btasks?\b/),
  },
  {
    intent: "PROJECT_FINANCE",
    score: 96,
    test: (n) =>
      has(n, "project") && any(n, "spent", "spend", "expense", "expenses", "budget", "finance", "cost") &&
      !has(n, "over budget") &&
      !has(n, "company") &&
      !has(n, "overdue") &&
      !/\bwhich projects\b/.test(n),
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
      !has(n, "company") &&
      ((has(n, "project") && (any(n, "how is", "status", "progress", "doing") || re(n, /\bhow is .+\b/))) ||
        /^[a-z0-9][a-z0-9 &.-]{1,40}\s+status$/.test(n)),
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

const BUSINESS_HINT =
  /\b(task|tasks|project|projects|meeting|meetings|sales|lead|leads|finance|financial|budget|employee|employees|overdue|pending|pipeline|opportunity|opportunities|customer|customers|report|workload|money)\b/;

export function isEmployeeDailyStatus(normalized: string): boolean {
  const n = normalized.trim();
  if (!n) return false;
  if (/\b(attendance|leave|vendor|collection)\b/.test(n)) return false;
  if (/\b(pending|overdue)\b/.test(n) && /\btasks?\b/.test(n) && !/\b(status|staus|doing)\b/.test(n)) return false;
  if (/\b(company|pipeline|budget|attention|morning report|create|assign)\b/.test(n)) return false;
  if (/\bprojects?\b/.test(n)) return false;
  if (/^[a-z0-9]{2,5}\s+status$/.test(n)) return false;
  const words = n.split(/\s+/);
  const shortToday = words.length <= 4 && /\btoday$/.test(n);
  return (
    /\b[a-z][a-z.'-]{1,40}(?:'s| s)?\s+(?:status|staus|work|doing|handling)\b/.test(n) ||
    shortToday ||
    /\b(enna panra|panraru|enna panraru|enna panrathu)\b/.test(n)
  );
}

export function isProjectFollowUp(normalized: string): boolean {
  return /^(why|why is it(?: at risk)?|why delayed|who is responsible|who is handling|who is the manager|what is pending|what s pending|pending)$/.test(
    normalized,
  );
}

export function isSmallTalk(normalized: string): boolean {
  const n = normalized.trim();
  if (!n || BUSINESS_HINT.test(n)) return false;
  if (/^(hi+|h+e+y+|h+e+l+o+|hai+|hey+|yo|hola|namaste|vanakkam)( there| boss| team)?$/.test(n)) return true;
  if (/^(good (morning|afternoon|evening|night)|thanks|thank you|thankyou|ok|okay|cool|great|nice|awesome)$/.test(n)) {
    return true;
  }
  return /^(how are you|how r you|how r u|who are you|what can you do|what do you do|help|are you there|are you online|are you connected|are you gemini|is gemini connected)$/.test(
    n,
  );
}

export class RuleBasedQueryEngine implements AssistantQueryEngine {
  detectIntent(normalized: string): DetectedIntent {
    if (!normalized) {
      return { intent: "UNSUPPORTED", confidence: 0, matchType: "none" };
    }

    if (WRITE_HINT.test(normalized) && !isReadQuestion(normalized) && !normalized.includes("what") && !normalized.includes("how") && !normalized.includes("show") && !normalized.includes("give")) {
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
    throw new Error("LLMQueryEngine is not used directly. GeminiProvider classifies intents asynchronously.");
  }
}

export const defaultQueryEngine: AssistantQueryEngine = new RuleBasedQueryEngine();

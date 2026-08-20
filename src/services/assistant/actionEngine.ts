import type { AssistantActionIntent } from "../../utils/constants";
import type { AssistantActionEngine, DetectedActionIntent } from "./action.types";

type Rule = {
  intent: AssistantActionIntent;
  score: number;
  test: (normalized: string) => boolean;
};

const has = (text: string, ...needles: string[]) => needles.every((needle) => text.includes(needle));
const any = (text: string, ...needles: string[]) => needles.some((needle) => text.includes(needle));
const re = (text: string, pattern: RegExp) => pattern.test(text);

const DANGEROUS =
  /\b(delete all|drop database|remove all|wipe|destroy)\b|\bdelete\b.+\b(projects?|customers?|users?|employees?|tasks?|finance|history)\b|\b(transfer|pay|expense|income|invoice)\b.+\b(rupee|rs|₹|lakh|crore|money)\b|\bchange (account )?balance\b|\bcreate (an? )?(expense|income|transfer|finance transaction)\b/;

const RULES: Rule[] = [
  {
    intent: "CANCEL_MEETING",
    score: 100,
    test: (n) => has(n, "cancel") && re(n, /\bmeetings?\b/),
  },
  {
    intent: "COMPLETE_TASK",
    score: 98,
    test: (n) =>
      (any(n, "mark", "complete", "completed", "finish", "finished") && re(n, /\btasks?\b/)) ||
      has(n, "mark") && any(n, "completed", "complete"),
  },
  {
    intent: "ASSIGN_TASK",
    score: 97,
    test: (n) => has(n, "assign") && (re(n, /\btasks?\b/) || has(n, "to")),
  },
  {
    intent: "CREATE_MEETING",
    score: 96,
    test: (n) => any(n, "schedule", "create a meeting", "create meeting", "book a meeting", "set up a meeting") && !has(n, "cancel"),
  },
  {
    intent: "UPDATE_MEETING",
    score: 94,
    test: (n) => re(n, /\bmeetings?\b/) && any(n, "move", "reschedule", "update", "change", "shift"),
  },
  {
    intent: "CREATE_PROJECT",
    score: 93,
    test: (n) => has(n, "create") && has(n, "project") && !has(n, "task"),
  },
  {
    intent: "UPDATE_PROJECT",
    score: 92,
    test: (n) => has(n, "project") && any(n, "update", "change", "set", "progress", "budget"),
  },
  {
    intent: "CREATE_LEAD",
    score: 91,
    test: (n) => has(n, "create") && re(n, /\bleads?\b/),
  },
  {
    intent: "UPDATE_LEAD",
    score: 90,
    test: (n) => re(n, /\bleads?\b/) && any(n, "update", "change", "move", "status", "qualify"),
  },
  {
    intent: "CREATE_OPPORTUNITY",
    score: 89,
    test: (n) => has(n, "create") && re(n, /\bopportunit/),
  },
  {
    intent: "UPDATE_OPPORTUNITY",
    score: 88,
    test: (n) => re(n, /\bopportunit/) && any(n, "update", "move", "change", "stage", "negotiation", "proposal"),
  },
  {
    intent: "CREATE_CUSTOMER",
    score: 87,
    test: (n) => has(n, "create") && re(n, /\bcustomers?\b/),
  },
  {
    intent: "UPDATE_CUSTOMER",
    score: 86,
    test: (n) => re(n, /\bcustomers?\b/) && any(n, "update", "change", "status"),
  },
  {
    intent: "CREATE_REMINDER",
    score: 85,
    test: (n) => any(n, "remind me", "create a reminder", "create reminder", "set a reminder"),
  },
  {
    intent: "CREATE_TASK",
    score: 84,
    test: (n) => has(n, "create") && re(n, /\btasks?\b/),
  },
  {
    intent: "UPDATE_TASK",
    score: 80,
    test: (n) => re(n, /\btasks?\b/) && any(n, "update", "change", "priority", "due"),
  },
];

export class RuleBasedActionEngine implements AssistantActionEngine {
  detectIntent(normalized: string): DetectedActionIntent {
    if (!normalized || DANGEROUS.test(normalized)) {
      return { intent: "UNSUPPORTED", confidence: 0 };
    }

    let best: Rule | null = null;
    for (const rule of RULES) {
      if (!rule.test(normalized)) continue;
      if (!best || rule.score > best.score) best = rule;
    }
    if (!best) return { intent: "UNSUPPORTED", confidence: 0 };
    return { intent: best.intent, confidence: best.score >= 90 ? 0.97 : 0.88 };
  }
}

export class LLMActionEngine implements AssistantActionEngine {
  detectIntent(_normalized: string): DetectedActionIntent {
    throw new Error("LLMActionEngine is not enabled. Step 11 uses RuleBasedActionEngine.");
  }
}

export const defaultActionEngine: AssistantActionEngine = new RuleBasedActionEngine();

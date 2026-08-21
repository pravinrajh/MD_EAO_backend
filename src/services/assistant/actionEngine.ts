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
  /\b(delete all|drop database|remove all|wipe|destroy)\b|\bdelete\b.+\b(projects?|customers?|users?|employees?|finance|history)\b|\b(transfer|pay|expense|income)\b.+\b(rupee|rs|₹|lakh|crore|money)\b|\bchange (account )?balance\b|\bcreate (an? )?(expense|income|transfer|finance transaction)\b/;

export function isReadQuestion(normalized: string): boolean {
  if (/\bgive it to\b|^give to\b/.test(normalized)) return false;
  return /\b(what|which|who|whom|whose|where|when|why|how|show|list|tell|give|enna|entha|ethu|epdi|yean|working)\b/.test(
    normalized,
  );
}

const RULES: Rule[] = [
  {
    intent: "DELETE_TASK",
    score: 104,
    test: (n) => (has(n, "delete") || has(n, "remove")) && re(n, /\btasks?\b/) && !has(n, "all") && !isReadQuestion(n),
  },
  {
    intent: "CREATE_INVOICE",
    score: 103,
    test: (n) => has(n, "create") && re(n, /\b(invoice|invoices)\b/) && !isReadQuestion(n),
  },
  {
    intent: "RECORD_INVOICE_PAYMENT",
    score: 103,
    test: (n) => re(n, /\b(invoice|invoices)\b/) && any(n, "payment", "paid", "collect") && !has(n, "create") && !isReadQuestion(n),
  },
  {
    intent: "CREATE_VENDOR",
    score: 102,
    test: (n) => has(n, "create") && re(n, /\bvendors?\b/) && !isReadQuestion(n),
  },
  {
    intent: "UPDATE_VENDOR",
    score: 101,
    test: (n) => re(n, /\bvendors?\b/) && any(n, "update", "change") && !isReadQuestion(n),
  },
  {
    intent: "CREATE_LAND_PARCEL",
    score: 102,
    test: (n) => has(n, "create") && any(n, "land", "parcel") && !isReadQuestion(n),
  },
  {
    intent: "UPDATE_LAND_PARCEL",
    score: 101,
    test: (n) => any(n, "land", "parcel") && any(n, "update", "change", "status") && !isReadQuestion(n),
  },
  {
    intent: "CREATE_MD_NOTE",
    score: 102,
    test: (n) => (has(n, "add") || has(n, "create")) && re(n, /\bnotes?\b/) && !isReadQuestion(n),
  },
  {
    intent: "UPDATE_MD_NOTE",
    score: 101,
    test: (n) => re(n, /\bnotes?\b/) && any(n, "update", "change") && !isReadQuestion(n),
  },
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
    test: (n) =>
      ((has(n, "assign") && (re(n, /\btasks?\b/) || has(n, "to"))) || has(n, "give it to") || /^give to\b/.test(n)) &&
      !has(n, "create") &&
      !isReadQuestion(n),
  },
  {
    intent: "CREATE_MEETING",
    score: 96,
    test: (n) =>
      (any(n, "schedule", "create a meeting", "create meeting", "book a meeting", "set up a meeting", "book 11", "make meeting") ||
        /\bmeet me\b/.test(n) ||
        (/\bmeet\b/.test(n) && any(n, "tomorrow", "today", "am", "pm", "afternoon") && !re(n, /\bmeetings?\b/))) &&
      !has(n, "cancel") &&
      !isReadQuestion(n),
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
    score: 99,
    test: (n) => {
      if (has(n, "meeting")) return false;
      if (has(n, "create") && re(n, /\btasks?\b/)) return true;
      if (/\bneeds? to\b/.test(n) && !isReadQuestion(n)) return true;
      if (/\bfollow up\b/.test(n) && !has(n, "assign") && !isReadQuestion(n) && !has(n, "show")) return true;
      if (has(n, "assign") && /\b(follow-up|collection)\b/.test(n) && !has(n, "to") && !isReadQuestion(n)) return true;
      return false;
    },
  },
  {
    intent: "UPDATE_INVOICE",
    score: 80,
    test: (n) => re(n, /\b(invoice|invoices)\b/) && any(n, "update", "change", "cancel") && !isReadQuestion(n),
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
    if (isReadQuestion(normalized)) {
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
    throw new Error("LLMActionEngine is not used directly. GeminiProvider classifies intents asynchronously.");
  }
}

export const defaultActionEngine: AssistantActionEngine = new RuleBasedActionEngine();

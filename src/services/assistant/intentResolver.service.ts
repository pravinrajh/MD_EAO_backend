import { ASSISTANT_ACTION_INTENTS, ASSISTANT_INTENTS, type AssistantActionIntent, type AssistantIntent } from "../../utils/constants";
import { defaultActionEngine } from "./actionEngine";
import { extractActionEntities } from "./actionIntentRouter.service";
import { ACTION_INTENT_ALIASES, getLlmProvider, sanitizeLlmEntities, type LlmConversationTurn, type LlmUnderstandResult } from "./gemini.provider";
import { detectIntent, extractEntities } from "./intentRouter.service";
import type { DetectedActionIntent, ExtractedActionEntities } from "./action.types";
import type { DetectedIntent, ExtractedEntities } from "./types";

const QUERY_INTENTS = new Set<string>(ASSISTANT_INTENTS);
const ACTION_INTENTS = new Set<string>(ASSISTANT_ACTION_INTENTS);

function mergeEntities<T extends Record<string, unknown>>(base: T, llmEntities: Record<string, unknown>): T {
  const merged = { ...base };
  const safe = sanitizeLlmEntities(llmEntities);
  for (const [key, value] of Object.entries(safe)) {
    if (
      key === "employeeName" ||
      key === "projectName" ||
      merged[key as keyof T] === undefined ||
      merged[key as keyof T] === ""
    ) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  const employeeName = typeof merged.employeeName === "string" ? String(merged.employeeName) : "";
  const projectName = typeof merged.projectName === "string" ? String(merged.projectName) : "";
  const first = employeeName.split(/\s+/)[0]?.toLowerCase();
  if (employeeName && projectName && first && projectName.toLowerCase().includes(first)) {
    delete (merged as Record<string, unknown>).projectName;
  }
  return merged;
}

function asQueryIntent(intent: string): AssistantIntent {
  return QUERY_INTENTS.has(intent) ? (intent as AssistantIntent) : "UNSUPPORTED";
}

function asActionIntent(intent: string): AssistantActionIntent {
  const mapped = ACTION_INTENT_ALIASES[intent] ?? intent;
  return ACTION_INTENTS.has(mapped) ? (mapped as AssistantActionIntent) : "UNSUPPORTED";
}

export const intentResolver = {
  detectQuery(normalized: string): DetectedIntent {
    return detectIntent(normalized);
  },

  detectAction(normalized: string): DetectedActionIntent {
    return defaultActionEngine.detectIntent(normalized);
  },

  async resolveQuery(input: {
    original: string;
    normalized: string;
    context?: LlmConversationTurn[];
  }): Promise<{ detected: DetectedIntent; extracted: ExtractedEntities; llm: LlmUnderstandResult | null }> {
    const rules = detectIntent(input.normalized);
    const extracted = extractEntities(input.original, input.normalized);
    if (rules.intent === "SMALLTALK") {
      return { detected: rules, extracted, llm: null };
    }
    const llm = await getLlmProvider().understand({
      message: input.original,
      mode: "query",
      context: input.context ?? [],
    });
    if (!llm || llm.kind === "action") {
      return { detected: rules, extracted, llm: llm ?? null };
    }
    if (llm.intent === "UNSUPPORTED" && rules.intent !== "UNSUPPORTED") {
      return { detected: rules, extracted: mergeEntities(extracted, llm.entities), llm };
    }
    if (rules.intent !== "UNSUPPORTED" && rules.intent !== "DYNAMIC_QUERY" && llm.intent === "DYNAMIC_QUERY") {
      return { detected: rules, extracted: mergeEntities(extracted, llm.entities), llm };
    }
    return {
      detected: {
        intent: asQueryIntent(llm.intent),
        confidence: llm.confidence,
        matchType: rules.intent === llm.intent ? rules.matchType : "pattern",
      },
      extracted: mergeEntities(extracted, llm.entities),
      llm,
    };
  },

  async resolveAction(input: {
    original: string;
    normalized: string;
    context?: LlmConversationTurn[];
  }): Promise<{ detected: DetectedActionIntent; extracted: ExtractedActionEntities }> {
    const rules = defaultActionEngine.detectIntent(input.normalized);
    const extracted = extractActionEntities(input.original, input.normalized);
    const llm = await getLlmProvider().understand({
      message: input.original,
      mode: "action",
      context: input.context ?? [],
    });
    if (!llm || llm.kind === "query") {
      return { detected: rules, extracted };
    }
    if (llm.intent === "UNSUPPORTED" && rules.intent !== "UNSUPPORTED") {
      return { detected: rules, extracted: mergeEntities(extracted, llm.entities) };
    }
    return {
      detected: {
        intent: asActionIntent(llm.intent),
        confidence: llm.confidence,
      },
      extracted: mergeEntities(extracted, llm.entities),
    };
  },
};

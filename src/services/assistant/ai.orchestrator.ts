import { assistantActionRepository } from "../../repositories/assistantAction.repository";
import { assistantQueryRepository } from "../../repositories/assistantQuery.repository";
import type { AssistantIntent } from "../../utils/constants";
import { getLlmProvider, type LlmConversationTurn, type LlmUnderstandResult } from "./gemini.provider";
import { intentResolver } from "./intentResolver.service";
import { applyConversationEntities, queryPlanner } from "./queryPlanner.service";
import { applyActionConversationEntities } from "./actionIntentRouter.service";
import { dynamicQueryPlanner } from "./dynamicQueryPlanner.service";
import { formatAssistantResponse } from "./responseFormatter.service";
import type { QueryPlan } from "./queryPlan.types";
import type { BqlPlan } from "./bql";
import type { AssistantActor, AssistantSource, DetectedIntent, ExtractedEntities } from "./types";
import type { ActionActor, DetectedActionIntent, ExtractedActionEntities } from "./action.types";

const CONTEXT_LIMIT = 5;
const CONTEXT_CHARS = 200;

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function answerUsesFacts(answer: string, data: Record<string, unknown>): boolean {
  const candidates = ["count", "pendingTasks", "overdueTasks", "todayMeetings", "totalIncome", "totalExpense", "topOverdue", "topPending"];
  for (const key of candidates) {
    const value = asNumber(data[key]);
    if (value === null) continue;
    if (!answer.includes(String(value))) return false;
  }
  if (typeof data.topEmployee === "string" && data.topEmployee && !answer.includes(data.topEmployee)) return false;
  return Boolean(answer.trim());
}

async function loadConversationContext(
  actorId: string,
  conversationId?: string,
): Promise<{ turns: LlmConversationTurn[]; lastEntities?: Record<string, unknown> }> {
  if (!conversationId) return { turns: [] };
  const result = await assistantQueryRepository.list({
    userId: actorId,
    conversationId,
    skip: 0,
    limit: CONTEXT_LIMIT,
  });
  const last = result.items[0] as Record<string, unknown> | undefined;
  const lastEntities =
    last?.entities && typeof last.entities === "object" ? (last.entities as Record<string, unknown>) : undefined;
  const turns = result.items
    .slice()
    .reverse()
    .map((item) => {
      const record = item as Record<string, unknown>;
      const message = String(record.message ?? "").slice(0, CONTEXT_CHARS);
      const answer = String(record.answer ?? "").slice(0, CONTEXT_CHARS);
      return [
        { role: "user" as const, text: message },
        { role: "assistant" as const, text: answer },
      ];
    })
    .flat()
    .filter((turn) => turn.text);
  return { turns, lastEntities };
}

export const aiOrchestrator = {
  async planQuery(input: {
    original: string;
    normalized: string;
    conversationId?: string;
    actor: AssistantActor;
  }): Promise<{
    detected: DetectedIntent;
    extracted: ExtractedEntities;
    plan: QueryPlan | null;
    bql: BqlPlan | null;
    llm: LlmUnderstandResult | null;
  }> {
    const { turns, lastEntities } = await loadConversationContext(input.actor.id, input.conversationId);
    const resolved = await intentResolver.resolveQuery({
      original: input.original,
      normalized: input.normalized,
      context: turns,
    });
    const extracted = applyConversationEntities(resolved.extracted, lastEntities, input.normalized);
    const plan = await queryPlanner.plan({
      original: input.original,
      normalized: input.normalized,
      extracted,
      context: turns,
    });
    if (plan) {
      return {
        detected: { intent: plan.intent, confidence: 0.96, matchType: "pattern" },
        extracted,
        plan,
        bql: null,
        llm: resolved.llm,
      };
    }
    if (resolved.detected.intent !== "UNSUPPORTED" && resolved.detected.intent !== "DYNAMIC_QUERY") {
      return { ...resolved, extracted, plan: null, bql: null };
    }
    const bql = await dynamicQueryPlanner.plan({
      original: input.original,
      normalized: input.normalized,
      extracted,
      context: turns,
    });
    if (bql) {
      return {
        detected: { intent: "DYNAMIC_QUERY", confidence: 0.9, matchType: "pattern" },
        extracted,
        plan: null,
        bql,
        llm: resolved.llm,
      };
    }
    return {
      ...resolved,
      extracted,
      detected: { intent: "UNSUPPORTED", confidence: 0, matchType: "none" },
      plan: null,
      bql: null,
    };
  },

  async planAction(input: {
    original: string;
    normalized: string;
    conversationId?: string;
    actor: ActionActor;
  }): Promise<{ detected: DetectedActionIntent; extracted: ExtractedActionEntities }> {
    const context = await loadConversationContext(input.actor.id, input.conversationId);
    const lastAction = await assistantActionRepository.findLatestCompleted(input.actor.id, input.conversationId);
    const resolved = await intentResolver.resolveAction({
      original: input.original,
      normalized: input.normalized,
      context: context.turns,
    });
    return {
      detected: resolved.detected,
      extracted: applyActionConversationEntities(
        resolved.extracted,
        lastAction as Record<string, unknown> | undefined,
        context.lastEntities,
        input.normalized,
      ),
    };
  },

  async finalizeQueryAnswer(
    intent: AssistantIntent,
    data: Record<string, unknown>,
    sources: AssistantSource[],
    originalMessage: string,
  ) {
    const formatted = formatAssistantResponse(intent, data, sources);
    const spoken = await getLlmProvider().summarize({
      message: originalMessage,
      intent,
      compactData: data,
    });
    if (spoken && answerUsesFacts(spoken, data)) {
      return { ...formatted, answer: spoken };
    }
    if (intent === "DYNAMIC_QUERY" && spoken) {
      const blob = JSON.stringify(data);
      const numbers = [...new Set((blob.match(/\b\d+\b/g) ?? []).filter((n) => n !== "0"))];
      if (numbers.some((n) => spoken.includes(n))) {
        return { ...formatted, answer: spoken };
      }
    }
    return formatted;
  },
};

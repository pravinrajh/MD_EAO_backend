import { createHash, randomUUID } from "crypto";
import { env } from "../../config/env";
import { formatZonedDate } from "../../utils/timezone";
import { assistantActionRepository } from "../../repositories/assistantAction.repository";
import { assistantActionService } from "./action.service";
import { assistantService } from "./assistant.service";
import { isReadQuestion } from "./actionEngine";
import { getLlmProvider } from "./gemini.provider";
import { normalizeQuery } from "./intentRouter.service";
import type { AssistantActor, AssistantQueryResult } from "./types";
import type { PublicActionResult } from "./action.types";

export type ChatMode = "QUERY" | "ACTION";

export type ChatResult = {
  conversationId: string;
  mode: ChatMode;
  reply: string;
  intent: string;
  status: string;
  requiresConfirmation: boolean;
  data: Record<string, unknown>;
  toolsUsed?: string[];
  queryId?: string;
  actionId?: string;
  confidence?: number;
  geminiConnected: boolean;
  gemini?: Record<string, unknown>;
};

function isYes(text: string): boolean {
  return /^(yes|y|yeah|yep|confirm|ok|okay|do it|please do|sure)$/i.test(text.trim());
}

function isNo(text: string): boolean {
  return /^(no|n|nope|cancel|don't|dont|do not)$/i.test(text.trim());
}

export function ensureConversationId(raw?: string): string {
  if (raw && raw.trim()) return raw.trim().slice(0, 100);
  return `CHAT-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function chatActionFingerprint(userId: string, conversationId: string, normalized: string): string {
  const day = formatZonedDate(new Date(), env.APP_TIMEZONE);
  return createHash("sha256").update(`chat|${userId}|${conversationId}|${normalized}|${day}`).digest("hex");
}

function geminiConnected(): boolean {
  return getLlmProvider().isEnabled();
}

function fromQuery(conversationId: string, query: AssistantQueryResult): ChatResult {
  const data = query.data ?? {};
  const status =
    query.intent === "UNSUPPORTED"
      ? "UNSUPPORTED"
      : typeof data.status === "string"
        ? String(data.status)
        : "SUCCESS";
  return {
    conversationId,
    mode: "QUERY",
    reply: query.answer,
    intent: query.intent,
    status,
    requiresConfirmation: false,
    data,
    toolsUsed: query.toolsUsed,
    queryId: query.queryId,
    confidence: query.confidence,
    geminiConnected: geminiConnected(),
    gemini: (data.gemini as Record<string, unknown> | undefined) ?? { connected: geminiConnected(), used: false },
  };
}

function fromAction(conversationId: string, action: PublicActionResult): ChatResult {
  return {
    conversationId,
    mode: "ACTION",
    reply: action.message,
    intent: action.intent,
    status: action.status,
    requiresConfirmation: Boolean(action.requiresConfirmation),
    data: action.result ?? {},
    actionId: action.actionId,
    geminiConnected: geminiConnected(),
    gemini: { connected: geminiConnected(), used: false, lookupPlan: null },
  };
}

export const chatService = {
  async chat(input: {
    message: string;
    conversationId?: string;
    actor: AssistantActor;
    idempotencyKey?: string;
  }): Promise<ChatResult> {
    const conversationId = ensureConversationId(input.conversationId);
    const { normalized } = normalizeQuery(input.message);

    if (input.conversationId) {
      const pending = await assistantActionRepository.findPendingConfirmation(input.actor.id, conversationId);
      if (pending && (isYes(normalized) || isNo(normalized))) {
        const action = await assistantActionService.confirmAction({
          actionId: String(pending.actionId),
          actor: input.actor,
          confirmed: isYes(normalized),
          conversationId,
        });
        return fromAction(conversationId, action);
      }
    }

    const actionIntent = assistantActionService.detectActionIntent(normalized);
    if (actionIntent.intent !== "UNSUPPORTED" && !isReadQuestion(normalized)) {
      const action = await assistantActionService.processAction({
        message: input.message,
        conversationId,
        actor: input.actor,
        idempotencyKey: input.idempotencyKey || chatActionFingerprint(input.actor.id, conversationId, normalized),
      });
      return fromAction(conversationId, action);
    }

    const query = await assistantService.processQuery({
      message: input.message,
      conversationId,
      actor: input.actor,
    });
    return fromQuery(conversationId, query);
  },
};

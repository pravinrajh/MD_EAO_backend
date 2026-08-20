import crypto from "crypto";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { getWhatsAppProvider } from "../../integrations/whatsapp";
import type {
  ParsedInboundMessage,
  ParsedStatusEvent,
  ParsedWhatsAppEvent,
} from "../../integrations/whatsapp/whatsappProvider.interface";
import { assistantActionRepository } from "../../repositories/assistantAction.repository";
import { whatsAppConversationRepository } from "../../repositories/whatsappConversation.repository";
import { whatsAppEventRepository } from "../../repositories/whatsappEvent.repository";
import { whatsAppMessageRepository } from "../../repositories/whatsappMessage.repository";
import {
  WHATSAPP_INBOUND_RATE_MAX,
  WHATSAPP_INBOUND_RATE_WINDOW_MS,
  WHATSAPP_PROCESS_BATCH,
  type Role,
  type WhatsAppMessageType,
} from "../../utils/constants";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors";
import { isDuplicateKey } from "../../utils/mongo";
import { maskPhone } from "../../utils/phone";
import { nextWhatsAppConversationId, nextWhatsAppEventId, nextWhatsAppMessageId } from "../../utils/sequence";
import { assistantActionService } from "../assistant/action.service";
import { assistantService } from "../assistant/assistant.service";
import { normalizeQuery } from "../assistant/intentRouter.service";
import { whatsAppIdentityService } from "./whatsappIdentity.service";
import { whatsAppMessagingService } from "./whatsappMessaging.service";
import {
  BLOCKED_TEXT,
  COMMAND_PROMPTS,
  FALLBACK_TEXT,
  HELP_TEXT,
  LINK_INVALID_TEXT,
  LINK_SUCCESS_TEXT,
  LINK_TAKEN_TEXT,
  UNKNOWN_NUMBER_TEXT,
  UNSUPPORTED_MEDIA_TEXT,
  sanitizeWhatsAppText,
} from "./whatsappResponse";

const inboundHits = new Map<string, number[]>();

function hubValue(query: Record<string, unknown>, key: string): string {
  const nested = query.hub;
  if (nested && typeof nested === "object") {
    const value = (nested as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  const dotted = query[`hub.${key}`];
  if (typeof dotted === "string") return dotted;
  if (Array.isArray(dotted) && typeof dotted[0] === "string") return dotted[0];
  return "";
}

function inboundAllowed(phoneNumber: string): boolean {
  const now = Date.now();
  const hits = (inboundHits.get(phoneNumber) ?? []).filter((ts) => now - ts < WHATSAPP_INBOUND_RATE_WINDOW_MS);
  if (hits.length >= WHATSAPP_INBOUND_RATE_MAX) {
    inboundHits.set(phoneNumber, hits);
    return false;
  }
  hits.push(now);
  inboundHits.set(phoneNumber, hits);
  return true;
}

function isYes(text: string): boolean {
  return /^(yes|y|yeah|yep|confirm|ok|okay|do it|please do|sure)$/i.test(text.trim());
}

function isNo(text: string): boolean {
  return /^(no|n|nope|cancel|don't|dont|do not)$/i.test(text.trim());
}

function snapshotOf(event: ParsedWhatsAppEvent): Record<string, unknown> {
  if (event.kind === "message") {
    return {
      kind: "message",
      providerMessageId: event.message.providerMessageId,
      phoneNumber: event.message.phoneNumber,
      timestamp: event.message.timestamp.toISOString(),
      messageType: event.message.messageType,
      text: event.message.text.slice(0, 4096),
    };
  }
  if (event.kind === "status") {
    return {
      kind: "status",
      providerMessageId: event.status.providerMessageId,
      phoneNumber: event.status.phoneNumber,
      timestamp: event.status.timestamp.toISOString(),
      status: event.status.status,
      error: event.status.error ?? "",
    };
  }
  return { kind: "unknown" };
}

function eventFromSnapshot(snapshot: Record<string, unknown>): ParsedWhatsAppEvent {
  if (snapshot.kind === "message") {
    return {
      kind: "message",
      message: {
        providerMessageId: String(snapshot.providerMessageId ?? ""),
        phoneNumber: String(snapshot.phoneNumber ?? ""),
        timestamp: new Date(String(snapshot.timestamp ?? Date.now())),
        messageType: (snapshot.messageType as WhatsAppMessageType) || "TEXT",
        text: String(snapshot.text ?? ""),
      },
    };
  }
  if (snapshot.kind === "status") {
    return {
      kind: "status",
      status: {
        providerMessageId: String(snapshot.providerMessageId ?? ""),
        phoneNumber: String(snapshot.phoneNumber ?? ""),
        timestamp: new Date(String(snapshot.timestamp ?? Date.now())),
        status: (snapshot.status as ParsedStatusEvent["status"]) || "DELIVERED",
        error: String(snapshot.error ?? "") || undefined,
      },
    };
  }
  return { kind: "unknown" };
}

async function persistEvent(event: ParsedWhatsAppEvent) {
  const snapshot = snapshotOf(event);
  const providerMessageId = String(snapshot.providerMessageId ?? `unknown-${Date.now()}`);
  const phoneNumber = String(snapshot.phoneNumber ?? "+0000000000");
  const statusKey = String(snapshot.status ?? "");
  const dedupeKey = `meta:${snapshot.kind}:${providerMessageId}:${statusKey}`;
  try {
    const created = await whatsAppEventRepository.create({
      eventId: await nextWhatsAppEventId(),
      provider: "meta",
      providerMessageId,
      eventType: snapshot.kind === "message" ? "MESSAGE" : snapshot.kind === "status" ? "STATUS" : "UNKNOWN",
      phoneNumber,
      rawEventHash: crypto.createHash("sha256").update(dedupeKey).digest("hex"),
      dedupeKey,
      payloadType: String(snapshot.kind),
      snapshot,
      processingStatus: "RECEIVED",
      receivedAt: new Date(),
    });
    return { created: true, record: created };
  } catch (error) {
    if (isDuplicateKey(error)) return { created: false, record: null };
    throw error;
  }
}

async function getOrCreateConversation(phoneNumber: string, userId: string | null) {
  const existing = await whatsAppConversationRepository.findByProviderPhone("meta", phoneNumber);
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (existing.status === "CLOSED") patch.status = "ACTIVE";
    if (userId && !existing.userId) patch.userId = userId;
    if (Object.keys(patch).length > 0) {
      const updated = await whatsAppConversationRepository.updateByConversationId(String(existing.conversationId), patch);
      if (updated) return whatsAppConversationRepository.toPublic(updated as unknown as Record<string, unknown>);
    }
    return whatsAppConversationRepository.toPublic(existing as Record<string, unknown>);
  }
  const created = await whatsAppConversationRepository.create({
    conversationId: await nextWhatsAppConversationId(),
    userId,
    phoneNumber,
    provider: "meta",
    status: "ACTIVE",
  }).catch(async (error: unknown) => {
    if (!isDuplicateKey(error)) throw error;
    return whatsAppConversationRepository.findByProviderPhone("meta", phoneNumber);
  });
  if (!created) {
    const fallback = await whatsAppConversationRepository.findByProviderPhone("meta", phoneNumber);
    if (!fallback) throw new Error("Unable to open WhatsApp conversation");
    return whatsAppConversationRepository.toPublic(fallback as Record<string, unknown>);
  }
  return whatsAppConversationRepository.toPublic(
    typeof (created as { toJSON?: () => Record<string, unknown> }).toJSON === "function"
      ? (created as { toJSON: () => Record<string, unknown> }).toJSON()
      : (created as Record<string, unknown>),
  );
}

async function storeInbound(message: ParsedInboundMessage, conversationId: string, userId: string | null) {
  try {
    await whatsAppMessageRepository.create({
      messageId: await nextWhatsAppMessageId(),
      provider: "meta",
      providerMessageId: message.providerMessageId,
      userId,
      phoneNumber: message.phoneNumber,
      conversationId,
      direction: "INBOUND",
      messageType: message.messageType,
      text: message.text.slice(0, 4096),
      status: "DELIVERED",
      receivedAt: message.timestamp,
    });
    await whatsAppConversationRepository.updateByConversationId(conversationId, {
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
    });
    return { duplicate: false };
  } catch (error) {
    if (isDuplicateKey(error)) return { duplicate: true };
    throw error;
  }
}

async function reply(
  phoneNumber: string,
  conversationId: string,
  userId: string | null,
  text: string,
  idempotencyKey?: string,
) {
  await whatsAppMessagingService.sendTextMessage({
    phoneNumber,
    conversationId,
    userId,
    message: sanitizeWhatsAppText(text),
    idempotencyKey,
  });
}

async function routeToAssistant(input: {
  text: string;
  conversationId: string;
  userId: string;
  role: Role;
  phoneNumber: string;
  providerMessageId: string;
}) {
  const actor = { id: input.userId, role: input.role };
  const trimmed = input.text.trim();
  const command = trimmed.toLowerCase();
  if (command === "/help" || command === "help") {
    await reply(input.phoneNumber, input.conversationId, input.userId, HELP_TEXT, `wa-help:${input.providerMessageId}`);
    return;
  }
  const message = COMMAND_PROMPTS[command] ?? trimmed;

  const conversation = await whatsAppConversationRepository.findByConversationId(input.conversationId);
  const pendingId = String(conversation?.pendingActionId ?? "");
  if (pendingId && (isYes(trimmed) || isNo(trimmed))) {
    const pending = await assistantActionRepository.findByActionId(pendingId, input.userId);
    if (
      pending &&
      String(pending.conversationId ?? "") === input.conversationId &&
      pending.status === "REQUIRES_CONFIRMATION" &&
      pending.confirmationStatus === "PENDING"
    ) {
      const result = await assistantActionService.confirmAction({
        actionId: pendingId,
        actor,
        confirmed: isYes(trimmed),
        conversationId: input.conversationId,
      });
      await whatsAppConversationRepository.updateByConversationId(input.conversationId, { pendingActionId: "" });
      await reply(
        input.phoneNumber,
        input.conversationId,
        input.userId,
        result.message,
        `wa-confirm:${input.providerMessageId}`,
      );
      return;
    }
  }

  const { normalized } = normalizeQuery(message);
  const actionIntent = assistantActionService.detectActionIntent(normalized);
  if (actionIntent.intent !== "UNSUPPORTED") {
    const result = await assistantActionService.processAction({
      message,
      conversationId: input.conversationId,
      actor,
      idempotencyKey: `wa:${input.providerMessageId}`,
    });
    if (result.requiresConfirmation) {
      await whatsAppConversationRepository.updateByConversationId(input.conversationId, {
        pendingActionId: result.actionId,
      });
    }
    await reply(
      input.phoneNumber,
      input.conversationId,
      input.userId,
      result.message || FALLBACK_TEXT,
      `wa-out:${input.providerMessageId}`,
    );
    return;
  }

  const query = await assistantService.processQuery({
    message,
    conversationId: input.conversationId,
    actor,
  });
  await reply(
    input.phoneNumber,
    input.conversationId,
    input.userId,
    query.answer || FALLBACK_TEXT,
    `wa-out:${input.providerMessageId}`,
  );
}

export async function processInboundMessage(message: ParsedInboundMessage) {
  const conversation = await getOrCreateConversation(message.phoneNumber, null);
  const stored = await storeInbound(
    message,
    String(conversation.conversationId),
    conversation.userId ? String(conversation.userId) : null,
  );
  if (stored.duplicate) return null;

  const linkMatch = message.text.trim().match(/^link\s+(\d{6})$/i);
  if (linkMatch) {
    const linked = await whatsAppIdentityService.consumeLinkCode(message.phoneNumber, linkMatch[1]);
    if (linked.ok) {
      await whatsAppConversationRepository.updateByConversationId(String(conversation.conversationId), {
        userId: linked.identity.userId,
        status: "ACTIVE",
      });
      await reply(
        message.phoneNumber,
        String(conversation.conversationId),
        String(linked.identity.userId),
        LINK_SUCCESS_TEXT,
        `wa-link:${message.providerMessageId}`,
      );
      return String(linked.identity.userId);
    }
    await reply(
      message.phoneNumber,
      String(conversation.conversationId),
      null,
      linked.reason === "taken" ? LINK_TAKEN_TEXT : LINK_INVALID_TEXT,
      `wa-link:${message.providerMessageId}`,
    );
    return null;
  }

  const resolved = await whatsAppIdentityService.resolveIdentity(message.phoneNumber);
  if (resolved && "blocked" in resolved) {
    await whatsAppConversationRepository.updateByConversationId(String(conversation.conversationId), {
      status: "BLOCKED",
    });
    await reply(message.phoneNumber, String(conversation.conversationId), null, BLOCKED_TEXT);
    return null;
  }
  if (!resolved) {
    await reply(message.phoneNumber, String(conversation.conversationId), null, UNKNOWN_NUMBER_TEXT);
    return null;
  }

  if (message.messageType !== "TEXT") {
    await reply(message.phoneNumber, String(conversation.conversationId), resolved.userId, UNSUPPORTED_MEDIA_TEXT);
    return resolved.userId;
  }

  if (!inboundAllowed(message.phoneNumber)) {
    await reply(
      message.phoneNumber,
      String(conversation.conversationId),
      resolved.userId,
      "You're sending messages too quickly. Please wait a moment.",
    );
    return resolved.userId;
  }

  await whatsAppConversationRepository.updateByConversationId(String(conversation.conversationId), {
    userId: resolved.userId,
    status: "ACTIVE",
  });
  await routeToAssistant({
    text: message.text,
    conversationId: String(conversation.conversationId),
    userId: resolved.userId,
    role: resolved.role,
    phoneNumber: message.phoneNumber,
    providerMessageId: message.providerMessageId,
  });
  return resolved.userId;
}

async function processStatusEvent(status: ParsedStatusEvent) {
  await whatsAppMessageRepository.applyStatus("meta", status.providerMessageId, status.status);
}

async function processParsedEvent(event: ParsedWhatsAppEvent) {
  if (event.kind === "message") return processInboundMessage(event.message);
  if (event.kind === "status") return processStatusEvent(event.status);
}

export const whatsAppWebhookService = {
  verifyWebhook(query: Record<string, unknown>) {
    return getWhatsAppProvider().verifyWebhook(
      {
        mode: hubValue(query, "mode"),
        token: hubValue(query, "token") || hubValue(query, "verify_token"),
        challenge: hubValue(query, "challenge"),
      },
      env.WHATSAPP_VERIFY_TOKEN,
    );
  },

  assertSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined) {
    const secret = env.WHATSAPP_APP_SECRET;
    if (!secret) throw new UnauthorizedError("WhatsApp webhook is not configured");
    if (!rawBody) throw new UnauthorizedError("Invalid webhook signature");
    if (!signatureHeader) throw new UnauthorizedError("Invalid webhook signature");
    const valid = getWhatsAppProvider().verifySignature(rawBody, signatureHeader, secret);
    if (!valid) throw new ForbiddenError("Invalid webhook signature");
  },

  parseEvent(payload: unknown) {
    return getWhatsAppProvider().parseIncomingPayload(payload);
  },

  async receiveWebhook(payload: unknown) {
    const events = this.parseEvent(payload);
    let accepted = 0;
    for (const event of events) {
      const stored = await persistEvent(event);
      if (stored.created) accepted += 1;
    }
    return { accepted };
  },

  async processQueuedEvents() {
    let processed = 0;
    for (let i = 0; i < WHATSAPP_PROCESS_BATCH; i += 1) {
      const claimed = await whatsAppEventRepository.claimDue();
      if (!claimed) break;
      processed += 1;
      const claimedId = String((claimed as { _id?: unknown })._id ?? "");
      const raw = typeof (claimed as { toObject?: () => Record<string, unknown> }).toObject === "function"
        ? (claimed as { toObject: () => Record<string, unknown> }).toObject()
        : (claimed as unknown as Record<string, unknown>);
      const record = whatsAppEventRepository.toPublic(raw);
      const eventId = claimedId || String(record.id);
      const started = Date.now();
      try {
        const snapshot = (raw.snapshot ?? record.snapshot ?? {}) as Record<string, unknown>;
        const userId = await processParsedEvent(eventFromSnapshot(snapshot));
        await whatsAppEventRepository.updateById(eventId, {
          processingStatus: snapshot.kind === "unknown" ? "IGNORED" : "PROCESSED",
          processedAt: new Date(),
          error: "",
          ...(typeof userId === "string" && userId ? { userId } : {}),
        });
        logger.info(
          {
            eventId: record.eventId,
            provider: "meta",
            providerMessageId: record.providerMessageId,
            userId: typeof userId === "string" ? userId : record.userId,
            phoneNumber: maskPhone(String(record.phoneNumber)),
            eventType: record.eventType,
            processingStatus: "PROCESSED",
            processingTimeMs: Date.now() - started,
          },
          "WhatsApp event processed",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Processing failed";
        await whatsAppEventRepository.updateById(eventId, {
          processingStatus: "FAILED",
          error: message,
          processedAt: new Date(),
        });
        logger.warn(
          {
            eventId: record.eventId,
            phoneNumber: maskPhone(String(record.phoneNumber)),
            processingStatus: "FAILED",
          },
          "WhatsApp event failed",
        );
      }
    }
    return { processed };
  },
};

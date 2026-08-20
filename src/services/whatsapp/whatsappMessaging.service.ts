import { env, isTest } from "../../config/env";
import { logger } from "../../config/logger";
import { getWhatsAppProvider } from "../../integrations/whatsapp";
import { WhatsAppProviderRequestError } from "../../integrations/whatsapp/metaWhatsApp.provider";
import { whatsAppConversationRepository } from "../../repositories/whatsappConversation.repository";
import { whatsAppMessageRepository } from "../../repositories/whatsappMessage.repository";
import { isValidE164, maskPhone, toE164 } from "../../utils/phone";
import { nextWhatsAppMessageId } from "../../utils/sequence";
import { splitWhatsAppText } from "./whatsappResponse";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: unknown, statusCode: number, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) return false;
  if ([400, 401, 403].includes(statusCode)) return false;
  if (statusCode === 429 || statusCode >= 500) return true;
  if (error instanceof WhatsAppProviderRequestError) return error.retryable;
  return true;
}

export const whatsAppMessagingService = {
  async sendTextMessage(input: {
    phoneNumber: string;
    message: string;
    conversationId: string;
    userId?: string | null;
    idempotencyKey?: string;
  }) {
    const phoneNumber = toE164(input.phoneNumber);
    if (!isValidE164(phoneNumber)) {
      throw new Error("Invalid recipient phone number");
    }
    if (input.idempotencyKey) {
      const existing = await whatsAppMessageRepository.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return whatsAppMessageRepository.toPublic(existing as Record<string, unknown>);
    }

    const chunks = splitWhatsAppText(input.message);
    let last: Record<string, unknown> | null = null;
    for (const [index, chunk] of chunks.entries()) {
      last = await this.sendChunk({
        phoneNumber,
        message: chunk,
        conversationId: input.conversationId,
        userId: input.userId,
        idempotencyKey: index === 0 ? input.idempotencyKey : undefined,
      });
    }
    return last;
  },

  async sendChunk(input: {
    phoneNumber: string;
    message: string;
    conversationId: string;
    userId?: string | null;
    idempotencyKey?: string;
  }) {
    const created = await whatsAppMessageRepository.create({
      messageId: await nextWhatsAppMessageId(),
      provider: "meta",
      providerMessageId: "",
      userId: input.userId ?? null,
      phoneNumber: input.phoneNumber,
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      messageType: "TEXT",
      text: input.message.slice(0, 4096),
      status: "PENDING",
      idempotencyKey: input.idempotencyKey ?? "",
    });

    const maxAttempts = Math.max(env.WHATSAPP_MAX_RETRIES, 1);
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await getWhatsAppProvider().sendTextMessage(input.phoneNumber, input.message);
        const updated = await whatsAppMessageRepository.updateById(String(created._id), {
          providerMessageId: result.providerMessageId,
          status: "SENT",
          sentAt: new Date(),
          failureReason: "",
        });
        await whatsAppConversationRepository.updateByConversationId(input.conversationId, {
          lastMessageAt: new Date(),
          lastOutboundAt: new Date(),
        });
        logger.info(
          {
            messageId: created.messageId,
            phoneNumber: maskPhone(input.phoneNumber),
            conversationId: input.conversationId,
          },
          "WhatsApp outbound sent",
        );
        return whatsAppMessageRepository.toPublic((updated ?? created) as unknown as Record<string, unknown>);
      } catch (error) {
        lastError = error;
        const statusCode = error instanceof WhatsAppProviderRequestError ? error.statusCode : 500;
        if (!shouldRetry(error, statusCode, attempt, maxAttempts)) break;
        await sleep(isTest ? 5 : Math.min(1000 * attempt, 4000));
      }
    }

    const reason =
      lastError instanceof Error ? lastError.message.slice(0, 1000) : "WhatsApp provider error";
    await whatsAppMessageRepository.updateById(String(created._id), {
      status: "FAILED",
      failureReason: reason,
    });
    logger.warn(
      { messageId: created.messageId, phoneNumber: maskPhone(input.phoneNumber) },
      "WhatsApp outbound failed",
    );
    return whatsAppMessageRepository.toPublic(created.toJSON() as Record<string, unknown>);
  },

  async sendTemplateMessage(phoneNumber: string, templateName: string, params: string[] = []) {
    return this.sendTextMessage({
      phoneNumber,
      message: [templateName, ...params].filter(Boolean).join("\n"),
      conversationId: "SYSTEM",
    });
  },

  async sendInteractiveMessage(phoneNumber: string, message: string) {
    return this.sendTextMessage({ phoneNumber, message, conversationId: "SYSTEM" });
  },
};

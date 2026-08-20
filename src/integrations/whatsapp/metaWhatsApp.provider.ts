import crypto from "crypto";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { e164Digits } from "../../utils/phone";
import { mapMetaPayload } from "./whatsappMessage.mapper";
import type {
  ParsedWhatsAppEvent,
  SendTextResult,
  WhatsAppProvider,
  WhatsAppVerifyQuery,
} from "./whatsappProvider.interface";

export class WhatsAppProviderRequestError extends Error {
  statusCode: number;
  retryable: boolean;

  constructor(message: string, statusCode: number, retryable: boolean) {
    super(message);
    this.name = "WhatsAppProviderRequestError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

function timingSafeEqualHex(expectedHex: string, actualHex: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    if (expected.length === 0 || expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  verifyWebhook(query: WhatsAppVerifyQuery, configuredToken: string): string | null {
    if (!configuredToken || query.mode !== "subscribe" || !query.challenge) return null;
    if (query.token !== configuredToken) return null;
    return query.challenge;
  }

  verifySignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
    if (!appSecret) return false;
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
    const actual = signatureHeader.slice("sha256=".length).trim();
    const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    return timingSafeEqualHex(expected, actual);
  }

  parseIncomingPayload(payload: unknown): ParsedWhatsAppEvent[] {
    return mapMetaPayload(payload);
  }

  async sendTextMessage(phoneNumber: string, message: string): Promise<SendTextResult> {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw new WhatsAppProviderRequestError("WhatsApp provider is not configured", 503, false);
    }
    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.WHATSAPP_MESSAGE_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: e164Digits(phoneNumber),
          type: "text",
          text: { body: message, preview_url: false },
        }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        logger.warn({ statusCode: response.status, provider: "meta" }, "WhatsApp provider request failed");
        throw new WhatsAppProviderRequestError("WhatsApp provider request failed", response.status, retryable);
      }
      const messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : [];
      const providerMessageId = String(messages[0]?.id ?? "");
      return { providerMessageId, statusCode: response.status };
    } catch (error) {
      if (error instanceof WhatsAppProviderRequestError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new WhatsAppProviderRequestError(aborted ? "WhatsApp provider timeout" : "WhatsApp provider network error", 504, true);
    } finally {
      clearTimeout(timer);
    }
  }

  sendInteractiveMessage(phoneNumber: string, message: string): Promise<SendTextResult> {
    return this.sendTextMessage(phoneNumber, message);
  }

  sendTemplateMessage(phoneNumber: string, templateName: string, params: string[] = []): Promise<SendTextResult> {
    return this.sendTextMessage(phoneNumber, [templateName, ...params].filter(Boolean).join("\n"));
  }
}

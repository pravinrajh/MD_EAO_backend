import type { WhatsAppMessageType } from "../../utils/constants";

export type WhatsAppVerifyQuery = {
  mode?: string;
  token?: string;
  challenge?: string;
};

export type ParsedInboundMessage = {
  providerMessageId: string;
  phoneNumber: string;
  timestamp: Date;
  messageType: WhatsAppMessageType;
  text: string;
};

export type ParsedStatusEvent = {
  providerMessageId: string;
  phoneNumber: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  timestamp: Date;
  error?: string;
};

export type ParsedWhatsAppEvent =
  | { kind: "message"; message: ParsedInboundMessage }
  | { kind: "status"; status: ParsedStatusEvent }
  | { kind: "unknown" };

export type SendTextResult = {
  providerMessageId: string;
  statusCode: number;
};

export type WhatsAppProviderError = {
  statusCode: number;
  retryable: boolean;
  message: string;
};

export interface WhatsAppProvider {
  readonly name: string;
  verifyWebhook(query: WhatsAppVerifyQuery, configuredToken: string): string | null;
  verifySignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean;
  parseIncomingPayload(payload: unknown): ParsedWhatsAppEvent[];
  sendTextMessage(phoneNumber: string, message: string): Promise<SendTextResult>;
  sendInteractiveMessage?(phoneNumber: string, message: string): Promise<SendTextResult>;
  sendTemplateMessage?(phoneNumber: string, templateName: string, params?: string[]): Promise<SendTextResult>;
}

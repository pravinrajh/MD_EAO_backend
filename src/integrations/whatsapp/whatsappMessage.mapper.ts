import type { WhatsAppMessageType } from "../../utils/constants";
import { toE164 } from "../../utils/phone";
import type { ParsedInboundMessage, ParsedStatusEvent, ParsedWhatsAppEvent } from "./whatsappProvider.interface";

const TYPE_MAP: Record<string, WhatsAppMessageType> = {
  text: "TEXT",
  image: "IMAGE",
  document: "DOCUMENT",
  audio: "AUDIO",
  video: "VIDEO",
  location: "LOCATION",
  interactive: "INTERACTIVE",
  button: "BUTTON",
};

const STATUS_MAP: Record<string, ParsedStatusEvent["status"]> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function extractText(message: Record<string, unknown>): string {
  const text = asRecord(message.text);
  if (typeof text?.body === "string") return text.body;
  const button = asRecord(message.button);
  if (typeof button?.text === "string") return button.text;
  const interactive = asRecord(message.interactive);
  const buttonReply = asRecord(interactive?.button_reply);
  if (typeof buttonReply?.title === "string") return buttonReply.title;
  return "";
}

export function mapMetaPayload(payload: unknown): ParsedWhatsAppEvent[] {
  const root = asRecord(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const events: ParsedWhatsAppEvent[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(asRecord(entry)?.changes) ? (asRecord(entry)?.changes as unknown[]) : [];
    for (const change of changes) {
      const value = asRecord(asRecord(change)?.value);
      if (!value) continue;

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const item of messages) {
        const message = asRecord(item);
        if (!message) continue;
        const from = String(message.from ?? "");
        const id = String(message.id ?? "");
        if (!from || !id) continue;
        const type = TYPE_MAP[String(message.type ?? "")] ?? "UNKNOWN";
        const parsed: ParsedInboundMessage = {
          providerMessageId: id,
          phoneNumber: toE164(from),
          timestamp: new Date(Number(message.timestamp ?? Date.now()) * (String(message.timestamp).length < 13 ? 1000 : 1)),
          messageType: type,
          text: extractText(message).slice(0, 4096),
        };
        events.push({ kind: "message", message: parsed });
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const item of statuses) {
        const status = asRecord(item);
        if (!status) continue;
        const id = String(status.id ?? "");
        const mapped = STATUS_MAP[String(status.status ?? "")];
        if (!id || !mapped) continue;
        const errors = Array.isArray(status.errors) ? status.errors : [];
        const firstError = asRecord(errors[0]);
        events.push({
          kind: "status",
          status: {
            providerMessageId: id,
            phoneNumber: toE164(String(status.recipient_id ?? "")),
            status: mapped,
            timestamp: new Date(Number(status.timestamp ?? Date.now()) * 1000),
            error: typeof firstError?.title === "string" ? firstError.title.slice(0, 1000) : undefined,
          },
        });
      }
    }
  }

  if (events.length === 0) events.push({ kind: "unknown" });
  return events;
}

import { WHATSAPP_TEXT_LIMIT } from "../../utils/constants";

const INTERNAL_ERROR = "I couldn't complete that request. Please try again.";

export function sanitizeWhatsAppText(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const cleaned = text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/Mongo\w*Error[^\n]*/gi, INTERNAL_ERROR)
    .replace(/ECONNREFUSED[^\n]*/gi, INTERNAL_ERROR)
    .replace(/stack:?\s+at\s+/gi, "")
    .trim();
  if (!cleaned) return INTERNAL_ERROR;
  if (/Mongo|ECONNREFUSED|at\s+\S+\s+\(/.test(cleaned)) return INTERNAL_ERROR;
  return cleaned;
}

export function splitWhatsAppText(text: string, limit = WHATSAPP_TEXT_LIMIT): string[] {
  const input = sanitizeWhatsAppText(text);
  if (input.length <= limit) return [input];
  const chunks: string[] = [];
  let remaining = input;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const breakAt =
      window.lastIndexOf("\n\n") > limit * 0.4
        ? window.lastIndexOf("\n\n")
        : window.lastIndexOf("\n") > limit * 0.4
          ? window.lastIndexOf("\n")
          : window.lastIndexOf(" ") > limit * 0.4
            ? window.lastIndexOf(" ")
            : limit;
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

export const HELP_TEXT = `I can help with:

• Tasks
• Projects
• Meetings
• Sales
• Finance
• Daily reports
• Reminders

Examples:
'What tasks are pending?'
'How is Chennai project?'
'Give me today's report.'`;

export const UNKNOWN_NUMBER_TEXT =
  "Your WhatsApp number is not linked to an account. Please contact your administrator.";

export const UNSUPPORTED_MEDIA_TEXT =
  "I currently support text-based Assistant requests. Please send your request as text.";

export const FALLBACK_TEXT =
  "I can currently help with tasks, projects, meetings, sales, finance, reports, and reminders. Try asking: 'What needs my attention today?'";

export const BLOCKED_TEXT = "I can't process this request right now.";

export const LINK_SUCCESS_TEXT = "Your WhatsApp number is now linked. You can ask about tasks, projects, meetings, and reports.";

export const LINK_INVALID_TEXT = "That linking code is invalid or expired.";

export const LINK_TAKEN_TEXT = "This WhatsApp number is already linked to another account.";

export const COMMAND_PROMPTS: Record<string, string> = {
  "/tasks": "What tasks are pending?",
  "/meetings": "What meetings do I have today?",
  "/summary": "What needs my attention today?",
  "/report": "Give me today's report.",
  "/reminders": "What reminders do I have today?",
};

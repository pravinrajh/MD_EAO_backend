import { logger } from "../../config/logger";
import { ASSISTANT_MOM_TIMEOUT_MS } from "../../utils/constants";
import { TimeoutError } from "../../utils/errors";
import { getLlmProvider, type RawActionItem } from "./gemini.provider";
import { entityResolver } from "./entityResolver.service";
import { aiPermissionAdapter } from "./permission.adapter";
import { toolRegistry } from "./toolRegistry";
import type { ActionActor, ExtractedActionEntities } from "./action.types";

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError("Processing the meeting minutes took too long. Try a shorter excerpt."));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const MAX_ITEMS = 20;
const ALLOWED_DATE_PHRASES = new Set([
  "today",
  "tomorrow",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "next week",
]);
const ALLOWED_PRIORITIES = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

type ParsedItem = {
  title: string;
  employeeName?: string;
  datePhrase?: string;
  priority?: string;
};

function sanitizeItems(raw: RawActionItem[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const title = typeof entry.title === "string" ? entry.title.trim().slice(0, 200) : "";
    if (!title) continue;
    const employeeNameRaw = typeof entry.employeeName === "string" ? entry.employeeName.trim().slice(0, 80) : "";
    const datePhraseRaw = typeof entry.datePhrase === "string" ? entry.datePhrase.trim().toLowerCase() : "";
    const priorityRaw = typeof entry.priority === "string" ? entry.priority.trim().toUpperCase() : "";
    out.push({
      title,
      employeeName: employeeNameRaw || undefined,
      datePhrase: ALLOWED_DATE_PHRASES.has(datePhraseRaw) ? datePhraseRaw : undefined,
      priority: ALLOWED_PRIORITIES.has(priorityRaw) ? priorityRaw : undefined,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

// Used when Gemini is disabled/unreachable so the feature still works without
// an API key: keeps only lines that read as a commitment or follow-up, not
// general discussion or attendee notes.
const BULLET_PREFIX = /^\s*(?:[-*•]|\d+[.)]|action\s*item\s*\d*\s*[:.-]?|ai\s*[:.-])\s*/i;
const ACTION_LINE =
  /\b(will|to |action|todo|to-do|follow[- ]?up|need to|needs to|must|should|assign|complete|prepare|send|share|schedule|review|update|finalize|submit|collect|verify|confirm)\b/i;
const OWNER_SUFFIX = /\(?\b(?:owner|assigned to|assignee|by)\b\s*[:-]?\s*([A-Za-z][A-Za-z .'-]{1,40})\)?\s*$/i;

function heuristicExtract(text: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (line.length < 4) continue;
    line = line.replace(BULLET_PREFIX, "").trim();
    if (!line || !ACTION_LINE.test(line)) continue;

    let employeeName: string | undefined;
    const ownerMatch = line.match(OWNER_SUFFIX);
    if (ownerMatch?.[1] && ownerMatch.index !== undefined) {
      employeeName = ownerMatch[1].trim();
      line = line.slice(0, ownerMatch.index).trim().replace(/[-:]\s*$/, "").trim();
    }
    const title = line.slice(0, 200);
    if (!title) continue;
    out.push({ title, employeeName });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export type MomImportItemResult = {
  title: string;
  employeeName?: string;
  taskId?: string;
  status: "CREATED" | "SKIPPED";
  reason?: string;
};

export type MomImportResult = {
  itemsFound: number;
  created: MomImportItemResult[];
  skipped: MomImportItemResult[];
  usedAi: boolean;
};

export const momImportService = {
  importMinutes(input: { text: string; actor: ActionActor }): Promise<MomImportResult> {
    return withTimeout(this._importMinutes(input), ASSISTANT_MOM_TIMEOUT_MS);
  },

  async _importMinutes(input: { text: string; actor: ActionActor }): Promise<MomImportResult> {
    const text = input.text.trim();
    if (!text) return { itemsFound: 0, created: [], skipped: [], usedAi: false };

    let items: ParsedItem[] = [];
    let usedAi = false;
    const provider = getLlmProvider();
    if (provider.isEnabled() && provider.extractActionItems) {
      try {
        const aiItems = await provider.extractActionItems({ text });
        if (aiItems) {
          items = sanitizeItems(aiItems);
          usedAi = true;
        }
      } catch (error) {
        logger.warn({ err: error }, "Gemini action-item extraction failed, falling back to heuristic parsing");
      }
    }
    if (items.length === 0) {
      items = heuristicExtract(text);
      usedAi = false;
    }

    const created: MomImportItemResult[] = [];
    const skipped: MomImportItemResult[] = [];

    for (const item of items) {
      try {
        const extracted: ExtractedActionEntities = {
          title: item.title,
          employeeName: item.employeeName,
          datePhrase: item.datePhrase,
          priority: item.priority,
        };
        const resolved = await entityResolver.resolveAction(extracted, input.actor, { intent: "CREATE_TASK" });
        if (resolved.notFound) {
          skipped.push({
            title: item.title,
            employeeName: item.employeeName,
            status: "SKIPPED",
            reason: `Couldn't find an employee matching "${resolved.notFound.name}"`,
          });
          continue;
        }
        if (resolved.clarification) {
          skipped.push({
            title: item.title,
            employeeName: item.employeeName,
            status: "SKIPPED",
            reason: resolved.clarification.question,
          });
          continue;
        }
        aiPermissionAdapter.assertAction("CREATE_TASK", input.actor, {
          hasAssignee: Boolean(resolved.assigneeId),
        });
        const executed = await toolRegistry.executeAction("CREATE_TASK", input.actor, resolved);
        const result = executed.result as Record<string, unknown>;
        created.push({
          title: item.title,
          employeeName: resolved.employeeName,
          taskId: String(result.taskId ?? result.id ?? ""),
          status: "CREATED",
        });
      } catch (error) {
        skipped.push({
          title: item.title,
          employeeName: item.employeeName,
          status: "SKIPPED",
          reason: error instanceof Error ? error.message.replace(/^CLARIFICATION:/, "") : "Could not create task",
        });
      }
    }

    return { itemsFound: items.length, created, skipped, usedAi };
  },
};

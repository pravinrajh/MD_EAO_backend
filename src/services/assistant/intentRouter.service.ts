import { employeeService } from "../employee.service";
import { customerService } from "../customer.service";
import { leadService } from "../lead.service";
import { opportunityService } from "../opportunity.service";
import { projectService } from "../project.service";
import { defaultQueryEngine } from "./queryEngine";
import type {
  AssistantActor,
  DetectedIntent,
  ExtractedEntities,
  ResolvedEntities,
} from "./types";

const SPELLING: Array<[RegExp, string]> = [
  [/\bover due\b/g, "overdue"],
  [/\bpendng\b/g, "pending"],
  [/\bmeetins\b/g, "meetings"],
  [/\bfinanical\b/g, "financial"],
  [/\bpipelines?\b/g, "pipeline"],
  [/\boppertunit/g, "opportunit"],
  [/\battension\b/g, "attention"],
];

const NAME_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "our",
  "my",
  "this",
  "that",
  "company",
  "all",
  "any",
  "current",
  "today",
  "pending",
  "overdue",
  "open",
  "new",
  "how",
  "is",
  "are",
  "was",
  "show",
  "list",
  "give",
  "much",
  "has",
  "have",
  "had",
  "did",
  "does",
  "for",
  "on",
  "about",
  "of",
  "what",
]);

function captureOriginalCasing(message: string, matched: string): string {
  const escaped = matched.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = message.match(new RegExp(escaped, "i"));
  return found?.[0]?.trim() || matched.trim();
}

function extractProjectName(original: string): string | undefined {
  const match = original.match(/\b([A-Za-z][A-Za-z0-9 &.'-]{0,60}?)\s+projects?\b/i);
  if (!match?.[1]) return undefined;
  const words = match[1]
    .trim()
    .split(/\s+/)
    .filter((word) => !NAME_STOPWORDS.has(word.toLowerCase()));
  const name = words.slice(-3).join(" ");
  return usableName(name);
}

export function normalizeQuery(message: string): { original: string; normalized: string } {
  let text = message.normalize("NFKC").trim().toLowerCase();
  text = text.replace(/[?!.,;:()[\]{}"“”]/g, " ");
  text = text.replace(/\bwhat['’]s\b/g, "what is");
  text = text.replace(/\bhow['’]s\b/g, "how is");
  text = text.replace(/\bi['’]m\b/g, "i am");
  text = text.replace(/\bdo i have\b/g, "do i have");
  text = text.replace(/['’]s\b/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of SPELLING) {
    text = text.replace(pattern, replacement);
  }
  return { original: message.trim(), normalized: text };
}

export function detectIntent(normalized: string): DetectedIntent {
  return defaultQueryEngine.detectIntent(normalized);
}

function usableName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 80) return undefined;
  if (NAME_STOPWORDS.has(cleaned.toLowerCase())) return undefined;
  return cleaned;
}

export function extractEntities(original: string, normalized: string): ExtractedEntities {
  const entities: ExtractedEntities = {};

  const projectName = extractProjectName(original);
  if (projectName) entities.projectName = captureOriginalCasing(original, projectName);

  const employeeMatch =
    original.match(/\b([A-Za-z][A-Za-z.'-]{1,40}?)(?:'s|’s)\s+(?:overdue\s+|pending\s+|today(?:'s)?\s+)?tasks?\b/i) ||
    original.match(/\b(?:show|list)\s+([A-Za-z][A-Za-z.'-]{1,40}?)\s+(?:overdue\s+|pending\s+|today(?:'s)?\s+)?tasks?\b/i);
  const employeeName = usableName(employeeMatch?.[1]);
  if (employeeName && !["project", "company", "all", "my"].includes(employeeName.toLowerCase())) {
    entities.employeeName = captureOriginalCasing(original, employeeName);
  }

  const customerMatch = original.match(/\b([A-Za-z0-9][A-Za-z0-9 &.'-]{1,40}?)\s+customers?\b/i);
  const customerName = usableName(customerMatch?.[1]);
  if (customerName) entities.customerName = captureOriginalCasing(original, customerName);

  const leadMatch = original.match(/\b(?:lead|leads)\s+([A-Za-z0-9][A-Za-z0-9 &.'-]{1,40})/i);
  if (leadMatch?.[1]) {
    const name = usableName(leadMatch[1]);
    if (name) entities.leadName = captureOriginalCasing(original, name);
  }

  const opportunityMatch = original.match(/\bopportunity\s+([A-Za-z0-9][A-Za-z0-9 &.'-]{1,40})/i);
  if (opportunityMatch?.[1]) {
    const name = usableName(opportunityMatch[1]);
    if (name) entities.opportunityName = captureOriginalCasing(original, name);
  }

  if (/\bthis month\b|\bcurrent month\b|\bmonthly\b/.test(normalized)) {
    entities.dateRange = "CURRENT_MONTH";
  } else if (/\bthis week\b|\bcurrent week\b|\bweekly\b/.test(normalized)) {
    entities.dateRange = "CURRENT_WEEK";
  } else if (/\btoday\b/.test(normalized)) {
    entities.dateRange = "TODAY";
  }

  if (/\bcritical\b/.test(normalized)) entities.priority = "CRITICAL";
  else if (/\bhigh\b/.test(normalized)) entities.priority = "HIGH";
  else if (/\bmedium\b/.test(normalized)) entities.priority = "MEDIUM";
  else if (/\blow\b/.test(normalized)) entities.priority = "LOW";

  if (/\boverdue\b/.test(normalized)) entities.status = "OVERDUE";
  else if (/\bpending\b/.test(normalized)) entities.status = "PENDING";
  else if (/\bcompleted\b/.test(normalized)) entities.status = "COMPLETED";

  return entities;
}

function displayName(item: Record<string, unknown>, fallbacks: string[]): string {
  for (const key of fallbacks) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return String(item.id ?? "");
}

export async function resolveEntities(
  extracted: ExtractedEntities,
  actor: AssistantActor,
  options: { requireProject?: boolean; requireEmployee?: boolean } = {},
): Promise<ResolvedEntities> {
  const resolved: ResolvedEntities = { ...extracted };
  const lookups: Array<Promise<void>> = [];

  if (extracted.projectName || options.requireProject) {
    lookups.push(
      (async () => {
        const search = extracted.projectName ?? "";
        const result = await projectService.list(
          { search: search || undefined, limit: 5, page: 1, sortBy: "name", sortOrder: "asc" },
          actor,
        );
        const items = result.items as Array<Record<string, unknown>>;
        if (extracted.projectName) {
          if (items.length === 0) {
            resolved.notFound = { field: "project", name: extracted.projectName };
            return;
          }
          if (items.length > 1) {
            resolved.clarification = {
              field: "project",
              question: `I found ${items.length} projects matching ${extracted.projectName}. Which one do you mean?`,
              options: items.map((item) => ({
                id: String(item.id),
                name: displayName(item, ["name"]),
              })),
            };
            return;
          }
          resolved.projectId = String(items[0].id);
          resolved.projectName = displayName(items[0], ["name"]);
          return;
        }

        if (items.length === 0) {
          resolved.notFound = { field: "project", name: "the project" };
          return;
        }
        if (items.length > 1) {
          resolved.clarification = {
            field: "project",
            question: "Which project would you like me to check?",
            options: items.slice(0, 5).map((item) => ({
              id: String(item.id),
              name: displayName(item, ["name"]),
            })),
          };
          return;
        }
        resolved.projectId = String(items[0].id);
        resolved.projectName = displayName(items[0], ["name"]);
      })(),
    );
  }

  if (extracted.employeeName) {
    lookups.push(
      (async () => {
        const result = await employeeService.list({
          search: extracted.employeeName,
          status: "ACTIVE",
          limit: 5,
          page: 1,
          sortBy: "firstName",
          sortOrder: "asc",
        });
        const items = result.items as Array<Record<string, unknown>>;
        if (items.length === 0) {
          resolved.notFound = { field: "employee", name: extracted.employeeName as string };
          return;
        }
        if (items.length > 1) {
          resolved.clarification = {
            field: "employee",
            question: `I found ${items.length} employees matching ${extracted.employeeName}. Which one do you mean?`,
            options: items.map((item) => ({
              id: String(item.id),
              name: displayName(item, ["displayName", "firstName"]),
            })),
          };
          return;
        }
        resolved.employeeId = String(items[0].id);
        resolved.employeeName = displayName(items[0], ["displayName", "firstName"]);
      })(),
    );
  }

  if (extracted.customerName) {
    lookups.push(
      (async () => {
        const result = await customerService.list({ search: extracted.customerName, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        if (items.length === 0) {
          resolved.notFound = { field: "customer", name: extracted.customerName as string };
          return;
        }
        if (items.length > 1) {
          resolved.clarification = {
            field: "customer",
            question: `I found ${items.length} customers matching ${extracted.customerName}. Which one do you mean?`,
            options: items.map((item) => ({
              id: String(item.id),
              name: displayName(item, ["name", "companyName"]),
            })),
          };
          return;
        }
        resolved.customerId = String(items[0].id);
      })(),
    );
  }

  if (extracted.leadName) {
    lookups.push(
      (async () => {
        const result = await leadService.list({ search: extracted.leadName, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        if (items.length === 0) {
          resolved.notFound = { field: "lead", name: extracted.leadName as string };
          return;
        }
        if (items.length > 1) {
          resolved.clarification = {
            field: "lead",
            question: `I found ${items.length} leads matching ${extracted.leadName}. Which one do you mean?`,
            options: items.map((item) => ({
              id: String(item.id),
              name: displayName(item, ["name", "companyName"]),
            })),
          };
          return;
        }
        resolved.leadId = String(items[0].id);
      })(),
    );
  }

  if (extracted.opportunityName) {
    lookups.push(
      (async () => {
        const result = await opportunityService.list({ search: extracted.opportunityName, limit: 5, page: 1 }, actor);
        const items = result.items as Array<Record<string, unknown>>;
        if (items.length === 0) {
          resolved.notFound = { field: "opportunity", name: extracted.opportunityName as string };
          return;
        }
        if (items.length > 1) {
          resolved.clarification = {
            field: "opportunity",
            question: `I found ${items.length} opportunities matching ${extracted.opportunityName}. Which one do you mean?`,
            options: items.map((item) => ({
              id: String(item.id),
              name: displayName(item, ["title", "opportunityId"]),
            })),
          };
          return;
        }
        resolved.opportunityId = String(items[0].id);
      })(),
    );
  }

  if (lookups.length > 0) await Promise.all(lookups);
  return resolved;
}

export const intentRouterService = {
  normalizeQuery,
  detectIntent,
  extractEntities,
  resolveEntities,
};

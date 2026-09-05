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
  [/\bstaus\b/g, "status"],
  [/\bstauts\b/g, "status"],
  [/\btomrw\b/g, "tomorrow"],
  [/\btommorow\b/g, "tomorrow"],
  [/\bchenai\b/g, "chennai"],
  [/\bcollecton\b/g, "collection"],
  [/\bsathis\b/gi, "sathish"],
  [/\bsathishh\b/gi, "sathish"],
  [/\bassing\b/gi, "assign"],
  [/\basign\b/gi, "assign"],
  [/\bcreat\b/gi, "create"],
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
  "which",
  "who",
  "whom",
  "whose",
  "where",
  "when",
  "why",
  "delayed",
  "assigned",
  "employee",
  "employees",
  "task",
  "tasks",
  "most",
  "highest",
  "because",
  "many",
  "too",
  "workload",
  "overloaded",
  "working",
  "and",
  "or",
  "with",
  "from",
  "into",
  "by",
  "in",
  "at",
  "inside",
  "affected",
  "enna",
  "entha",
  "ethu",
  "epdi",
  "panna",
  "working",
  "work",
]);

function captureOriginalCasing(message: string, matched: string): string {
  const escaped = matched.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = message.match(new RegExp(escaped, "i"));
  return found?.[0]?.trim() || matched.trim();
}

function extractProjectName(original: string, normalized: string): string | undefined {
  if (/\b(which|what|who|entha|enna)\b/.test(normalized) && /\b(work|working|panna|assigned)\b/.test(normalized)) {
    return undefined;
  }
  const matches = [...original.matchAll(/\b([A-Za-z][A-Za-z0-9 &.'-]{0,40}?)\s+projects?\b/gi)];
  const last = matches.at(-1)?.[1];
  if (!last) return undefined;
  const words = last
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

  const projectName = extractProjectName(original, normalized);
  if (projectName) entities.projectName = captureOriginalCasing(original, projectName);

  const personAtStart = original.match(
    /^([A-Za-z][A-Za-z.'-]{1,40}(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?)(?:\s+(?:ku|kku))?\b/,
  );
  const startName = usableName(personAtStart?.[1]);
  const startParts = startName?.split(/\s+/) ?? [];
  const startFirst = (startParts[0] || "").toLowerCase().replace(/['’]s$/, "").replace(/['’]/g, "");
  const startSecond = startParts[1]?.toLowerCase() || "";
  const trailingCue = new Set(["status", "staus", "today", "handling", "doing", "work", "enna", "panraru"]);
  const notPerson = new Set([
    "what",
    "whats",
    "which",
    "who",
    "show",
    "list",
    "how",
    "give",
    "create",
    "assign",
    "update",
    "schedule",
    "cancel",
    "mark",
    "complete",
    "please",
    "is",
    "are",
    "was",
    "were",
    "do",
    "does",
    "did",
    "can",
    "could",
    "run",
    "call",
    "the",
    "this",
    "that",
    "our",
    "my",
  ]);
  if (
    startName &&
    !notPerson.has(startFirst) &&
    !["project", "projects", "task", "tasks", "meeting", "meetings"].includes(startSecond)
  ) {
    const person =
      startSecond && (NAME_STOPWORDS.has(startSecond) || trailingCue.has(startSecond))
        ? usableName(startParts[0])
        : startName;
    if (person) entities.employeeName = captureOriginalCasing(original, person);
  }

  const employeeMatch =
    original.match(/\b([A-Za-z][A-Za-z.'-]{1,40}?)(?:'s|’s)\s+(?:overdue\s+|pending\s+|today(?:'s)?\s+)?tasks?\b/i) ||
    original.match(/\b(?:show|list)\s+([A-Za-z][A-Za-z.'-]{1,40}?)\s+(?:overdue\s+|pending\s+|today(?:'s)?\s+)?tasks?\b/i) ||
    original.match(/\b([A-Za-z][A-Za-z.'-]{1,40}?)(?:'s|’s)\s+(?:status|staus|work)\b/i) ||
    original.match(/\b(?:how is|what is|whats|what's|show me)\s+([A-Za-z][A-Za-z.'-]{1,40}?)(?:'s|’s)?\s+(?:status|staus|work|doing|handling)/i) ||
    original.match(/\b(?:what'?s)\s+([A-Za-z][A-Za-z.'-]{1,40}?)\s+(?:handling|doing|status)/i) ||
    original.match(/^([A-Za-z][A-Za-z.'-]{1,40})(?:\s+enna|\s+today|\s+status|\s+staus)\b/i) ||
    original.match(/\b(?:how is|what is)\s+([A-Za-z][A-Za-z.'-]{1,40})\s+today\b/i);
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

  const minPendingMatch = normalized.match(/\b(?:more than|over|at least)\s+(\d{1,4})\b/);
  if (minPendingMatch) {
    const value = Number(minPendingMatch[1]);
    if (Number.isFinite(value) && value > 0) entities.minPending = value;
  } else if (/\boverloaded\b/.test(normalized)) {
    entities.minPending = 10;
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
  else if (/\bavailable\b/.test(normalized) && /\b(land|parcel)/.test(normalized)) entities.status = "AVAILABLE";
  else if (/\bpending\b/.test(normalized)) entities.status = "PENDING";
  else if (/\bcompleted\b/.test(normalized)) entities.status = "COMPLETED";

  return entities;
}

function editDistance(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(grid[i - 1][j] + 1, grid[i][j - 1] + 1, grid[i - 1][j - 1] + cost);
    }
  }
  return grid[left.length][right.length];
}

function nameMatchScore(query: string, candidate: string): number {
  const q = query.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (!q || !c) return 0;
  if (c === q || c.includes(q) || q.includes(c)) return 1;
  const qFirst = q.split(/\s+/)[0] || "";
  const cFirst = c.split(/\s+/)[0] || "";
  if (!qFirst || !cFirst) return 0;
  const dist = editDistance(qFirst, cFirst);
  const maxLen = Math.max(qFirst.length, cFirst.length);
  if (maxLen < 4) return 0;
  const ratio = 1 - dist / maxLen;
  return ratio >= 0.7 ? ratio : 0;
}

async function lookupEmployees(name: string): Promise<Array<Record<string, unknown>>> {
  const searchOnce = async (search: string) => {
    const result = await employeeService.list({
      search,
      status: "ACTIVE",
      limit: 8,
      page: 1,
      sortBy: "firstName",
      sortOrder: "asc",
    });
    return result.items as Array<Record<string, unknown>>;
  };
  const direct = await searchOnce(name);
  if (direct.length) return direct;
  const first = name.trim().split(/\s+/)[0];
  if (first && first !== name) {
    const byFirst = await searchOnce(first);
    if (byFirst.length) return byFirst;
  }
  const pool = await employeeService.list({
    status: "ACTIVE",
    limit: 50,
    page: 1,
    sortBy: "firstName",
    sortOrder: "asc",
  });
  return (pool.items as Array<Record<string, unknown>>)
    .map((item) => ({ item, score: nameMatchScore(name, displayName(item, ["displayName", "firstName"])) }))
    .filter((row) => row.score >= 0.72)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => row.item);
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

  if (extracted.projectId && !extracted.projectName) {
    // Conversation already resolved the project.
  } else if (extracted.projectName || options.requireProject) {
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

  if (options.requireEmployee && !extracted.employeeName) {
    resolved.clarification = {
      field: "employee",
      question: "Which employee should I check?",
      options: [],
    };
  }

  if (extracted.employeeName) {
    lookups.push(
      (async () => {
        const items = await lookupEmployees(extracted.employeeName as string);
        if (items.length === 0) {
          resolved.notFound = { field: "employee", name: extracted.employeeName as string };
          return;
        }
        if (items.length > 1) {
          resolved.clarification = {
            field: "employee",
            question: `I found multiple employees named ${extracted.employeeName}. Please select the correct employee.`,
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

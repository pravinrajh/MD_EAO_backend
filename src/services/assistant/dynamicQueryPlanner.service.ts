import { env } from "../../config/env";
import { compactSchemaForLlm, BUSINESS_SCHEMA, type BqlDomain } from "./businessSchema";
import {
  isUnsafeUserQuestion,
  validateBqlPlan,
  type BqlDateRange,
  type BqlFilter,
  type BqlOperation,
  type BqlPlan,
} from "./bql";
import { getLlmProvider, type LlmConversationTurn } from "./gemini.provider";
import type { ExtractedEntities } from "./types";

const DATE_PHRASES: Array<[RegExp, BqlDateRange]> = [
  [/\btoday\b/, "TODAY"],
  [/\byesterday\b/, "YESTERDAY"],
  [/\bthis week\b/, "THIS_WEEK"],
  [/\blast week\b/, "LAST_WEEK"],
  [/\bthis month\b/, "THIS_MONTH"],
  [/\blast month\b/, "LAST_MONTH"],
  [/\bthis quarter\b/, "THIS_QUARTER"],
  [/\blast quarter\b/, "LAST_QUARTER"],
  [/\bthis year\b/, "THIS_YEAR"],
  [/\b(recently|lately|last few days)\b/, "RECENT"],
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function dateRangeFromText(normalized: string): BqlDateRange | undefined {
  for (const [pattern, range] of DATE_PHRASES) {
    if (pattern.test(normalized)) return range;
  }
  return undefined;
}

function operationFromTokens(tokens: Set<string>): BqlOperation {
  if (tokens.has("compare") || tokens.has("versus") || tokens.has("vs")) return "COMPARE";
  if (tokens.has("count") || tokens.has("how") || tokens.has("many")) return "COUNT";
  if (tokens.has("most") || tokens.has("highest") || tokens.has("rank") || tokens.has("group")) return "AGGREGATE";
  if (tokens.has("summary") || tokens.has("situation") || tokens.has("today")) return "SUMMARY";
  if (
    tokens.has("analyze") ||
    tokens.has("why") ||
    tokens.has("risk") ||
    tokens.has("behind") ||
    tokens.has("attention") ||
    tokens.has("happening") ||
    tokens.has("performing") ||
    tokens.has("overloaded")
  ) {
    return "ANALYZE";
  }
  return "LIST";
}

export function planFromSchema(input: {
  original: string;
  normalized: string;
  extracted: ExtractedEntities;
}): BqlPlan | null {
  if (isUnsafeUserQuestion(input.original) || isUnsafeUserQuestion(input.normalized)) return null;
  const tokens = new Set(tokenize(input.normalized));
  const sources: BqlDomain[] = [];
  const filters: BqlFilter[] = [];

  for (const domain of BUSINESS_SCHEMA) {
    if (domain.aliases.some((alias) => tokens.has(alias))) {
      sources.push(domain.name);
    }
    for (const field of domain.fields) {
      if (tokens.has(field.name) && field.type === "virtual") {
        if (!sources.includes(domain.name)) sources.push(domain.name);
        if (field.name === "overdue" || field.name === "delayed" || field.name === "workload") {
          filters.push({ source: domain.name, field: field.name, operator: "equals", value: true });
        }
      }
      if (field.valueAliases) {
        for (const [enumValue, aliases] of Object.entries(field.valueAliases)) {
          if (aliases.some((alias) => tokens.has(alias)) || tokens.has(enumValue.toLowerCase())) {
            if (!sources.includes(domain.name) && domain.aliases.some((alias) => tokens.has(alias))) {
              sources.push(domain.name);
            }
            if (sources.includes(domain.name)) {
              filters.push({
                source: domain.name,
                field: field.name,
                operator: "equals",
                value: enumValue,
              });
            }
          }
        }
      }
    }
  }

  if (input.extracted.projectName && !sources.includes("projects")) sources.push("projects");
  if (input.extracted.employeeName && !sources.includes("employees")) sources.push("employees");
  if (
    input.extracted.employeeName &&
    (tokens.has("working") || tokens.has("work") || tokens.has("panna") || tokens.has("task") || tokens.has("tasks"))
  ) {
    if (!sources.includes("tasks")) sources.push("tasks");
  }
  if (
    input.extracted.employeeName &&
    (tokens.has("project") || tokens.has("projects") || tokens.has("working") || tokens.has("work") || tokens.has("panna"))
  ) {
    if (!sources.includes("projects")) sources.push("projects");
  }

  if (sources.length === 0) return null;

  const operation = operationFromTokens(tokens);
  if (operation === "AGGREGATE" && sources.includes("tasks") && !sources.includes("employees") && tokens.has("employee")) {
    sources.push("employees");
  }
  if ((operation === "ANALYZE" || operation === "SUMMARY") && sources.includes("dashboard") === false && sources.length > 1) {
    // keep selected domains
  }
  if (operation === "ANALYZE" && sources.length === 1 && sources[0] === "dashboard") {
    sources.push("projects", "tasks");
  }

  const groupBy: string[] = [];
  if (operation === "AGGREGATE" && sources.includes("tasks")) {
    groupBy.push(tokens.has("project") ? "projectId" : "assignedTo");
  }

  return validateBqlPlan({
    type: operation === "COMPARE" ? "COMPARISON" : operation === "ANALYZE" || operation === "SUMMARY" ? "ANALYSIS" : "QUERY",
    operation,
    sources,
    filters,
    relationships: [],
    groupBy,
    sort:
      operation === "AGGREGATE"
        ? [{ field: filters.some((item) => item.field === "overdue") ? "overdueTasks" : "count", direction: "DESC" }]
        : [],
    limit: 20,
    dateRange: dateRangeFromText(input.normalized),
    entityHints: {
      projectName: input.extracted.projectName,
      employeeName: input.extracted.employeeName,
    },
  });
}

export const dynamicQueryPlanner = {
  planFromSchema,
  validate: validateBqlPlan,
  schema: () => compactSchemaForLlm(),

  async plan(input: {
    original: string;
    normalized: string;
    extracted: ExtractedEntities;
    context?: LlmConversationTurn[];
  }): Promise<BqlPlan | null> {
    if (isUnsafeUserQuestion(input.original)) return null;
    const fallback = planFromSchema(input);
    const llm = getLlmProvider();
    if (!llm.plan || !llm.isEnabled()) return fallback;
    const drafted = await llm.plan({
      message: input.original,
      context: input.context ?? [],
      schema: compactSchemaForLlm(),
      timezone: env.APP_TIMEZONE,
    });
    if (!drafted) return fallback;
    try {
      const validated = validateBqlPlan(drafted);
      if (input.extracted.projectName && !validated.entityHints?.projectName) {
        validated.entityHints = { ...validated.entityHints, projectName: input.extracted.projectName };
      }
      if (input.extracted.employeeName && !validated.entityHints?.employeeName) {
        validated.entityHints = { ...validated.entityHints, employeeName: input.extracted.employeeName };
      }
      return validated;
    } catch {
      return fallback;
    }
  },
};

export function looksLikeMissingDomain(normalized: string): string | null {
  const tokens = new Set(tokenize(normalized));
  const missing = ["inventory", "warehouse", "stock", "payroll", "attendance", "salary", "leave"];
  return missing.find((domain) => tokens.has(domain)) ?? null;
}

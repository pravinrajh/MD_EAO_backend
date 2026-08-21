import { ASSISTANT_QUERY_PLAN_MAX_LIMIT } from "../../utils/constants";
import { env } from "../../config/env";
import { getZonedDayRange, getZonedMonthRange, getZonedWeekRange } from "../../utils/timezone";
import { BQL_DOMAINS, getSchemaDomain, schemaField, type BqlDomain } from "./businessSchema";
import { QueryPlanValidationError } from "./queryPlan.types";

export const BQL_OPERATIONS = ["LIST", "COUNT", "AGGREGATE", "ANALYZE", "COMPARE", "SUMMARY"] as const;
export type BqlOperation = (typeof BQL_OPERATIONS)[number];

export const BQL_OPERATORS = ["equals", "notEquals", "in", "gt", "gte", "lt", "lte"] as const;
export type BqlOperator = (typeof BQL_OPERATORS)[number];

export const BQL_DATE_RANGES = [
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_QUARTER",
  "LAST_QUARTER",
  "THIS_YEAR",
  "RECENT",
] as const;
export type BqlDateRange = (typeof BQL_DATE_RANGES)[number];

export type BqlFilter = {
  source: BqlDomain;
  field: string;
  operator: BqlOperator;
  value: string | number | boolean | string[];
};

export type BqlPlan = {
  type: "QUERY" | "ANALYSIS" | "SUMMARY" | "COMPARISON";
  operation: BqlOperation;
  sources: BqlDomain[];
  filters: BqlFilter[];
  relationships: Array<{ from: BqlDomain; to: BqlDomain; via: string }>;
  groupBy: string[];
  sort: Array<{ field: string; direction: "ASC" | "DESC" }>;
  limit: number;
  dateRange?: BqlDateRange;
  entityHints?: {
    projectName?: string;
    employeeName?: string;
    compareNames?: string[];
  };
};

const FORBIDDEN = /\$|aggregate|mongoose|find\(|function\s*\(|db\./i;

function rejectForbidden(value: unknown, path = "plan"): void {
  if (typeof value === "string" && FORBIDDEN.test(value) && path !== "plan.entityHints.projectName" && !path.includes("entityHints")) {
    if (/[$\{\}]/.test(value) || FORBIDDEN.test(value)) {
      throw new QueryPlanValidationError(`Unsafe value at ${path}`);
    }
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectForbidden(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("$") || key.includes(".") || FORBIDDEN.test(key)) {
      throw new QueryPlanValidationError(`Unsafe field ${path}.${key} is not allowed`);
    }
    rejectForbidden(nested, `${path}.${key}`);
  }
}

export function clampBqlLimit(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 20;
  return Math.min(Math.floor(value), ASSISTANT_QUERY_PLAN_MAX_LIMIT);
}

function asDomain(value: unknown): BqlDomain | null {
  const name = String(value ?? "").toLowerCase();
  return (BQL_DOMAINS as readonly string[]).includes(name) ? (name as BqlDomain) : null;
}

export function resolveBqlDateRange(range: BqlDateRange, now = new Date(), timeZone = env.APP_TIMEZONE): { start: Date; end: Date } {
  if (range === "TODAY") return getZonedDayRange(now, timeZone);
  if (range === "YESTERDAY") {
    const today = getZonedDayRange(now, timeZone);
    return getZonedDayRange(new Date(today.start.getTime() - 12 * 60 * 60 * 1000), timeZone);
  }
  if (range === "THIS_WEEK") return getZonedWeekRange(now, timeZone);
  if (range === "LAST_WEEK") {
    const current = getZonedWeekRange(now, timeZone);
    return getZonedWeekRange(new Date(current.start.getTime() - 12 * 60 * 60 * 1000), timeZone);
  }
  if (range === "THIS_MONTH") return getZonedMonthRange(now, timeZone);
  if (range === "LAST_MONTH") {
    const current = getZonedMonthRange(now, timeZone);
    return getZonedMonthRange(new Date(current.start.getTime() - 12 * 60 * 60 * 1000), timeZone);
  }
  if (range === "THIS_QUARTER" || range === "LAST_QUARTER") {
    const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" })
      .format(now)
      .split("-")
      .map(Number);
    const quarterStartMonth = range === "THIS_QUARTER" ? Math.floor((month - 1) / 3) * 3 + 1 : Math.floor((month - 1) / 3) * 3 - 2;
    const startMonth = quarterStartMonth > 0 ? quarterStartMonth : quarterStartMonth + 12;
    const startYear = quarterStartMonth > 0 ? year : year - 1;
    const start = getZonedMonthRange(new Date(Date.UTC(startYear, startMonth - 1, 15)), timeZone).start;
    const endMonth = startMonth + 3;
    const end = getZonedMonthRange(new Date(Date.UTC(endMonth > 12 ? startYear + 1 : startYear, (endMonth - 1) % 12, 15)), timeZone).start;
    return { start, end };
  }
  if (range === "THIS_YEAR") {
    const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(now));
    const start = getZonedMonthRange(new Date(Date.UTC(year, 0, 15)), timeZone).start;
    const end = getZonedMonthRange(new Date(Date.UTC(year + 1, 0, 15)), timeZone).start;
    return { start, end };
  }
  const recent = getZonedDayRange(now, timeZone);
  return { start: new Date(recent.start.getTime() - 7 * 24 * 60 * 60 * 1000), end: recent.end };
}

export function validateBqlPlan(raw: unknown): BqlPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new QueryPlanValidationError("Business query plan must be an object");
  }
  rejectForbidden(raw);
  const record = raw as Record<string, unknown>;
  const typeRaw = String(record.type ?? "QUERY").toUpperCase();
  const type =
    typeRaw === "ANALYSIS" || typeRaw === "SUMMARY" || typeRaw === "COMPARISON" ? typeRaw : "QUERY";
  const operationRaw = String(record.operation ?? "LIST").toUpperCase();
  if (!(BQL_OPERATIONS as readonly string[]).includes(operationRaw)) {
    throw new QueryPlanValidationError("Unknown operation");
  }
  const operation = operationRaw as BqlOperation;

  const sourceList = Array.isArray(record.sources)
    ? record.sources
    : record.source
      ? [record.source]
      : [];
  const sources = sourceList.map(asDomain).filter((item): item is BqlDomain => Boolean(item));
  if (sources.length === 0) {
    throw new QueryPlanValidationError("Unknown or missing dataset");
  }

  const filtersRaw = Array.isArray(record.filters) ? record.filters : [];
  const filters: BqlFilter[] = [];
  for (const item of filtersRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const source = asDomain(row.source) ?? sources[0];
    const domain = getSchemaDomain(source);
    const field = String(row.field ?? "");
    if (!domain || !field || !schemaField(domain, field)) {
      throw new QueryPlanValidationError(`Unknown field ${field} on ${source}`);
    }
    const operator = String(row.operator ?? "equals");
    if (!(BQL_OPERATORS as readonly string[]).includes(operator)) {
      throw new QueryPlanValidationError("Operator not allowed");
    }
    const spec = schemaField(domain, field)!;
    let value = row.value;
    if (spec.type === "enum" && typeof value === "string") {
      const upper = value.toUpperCase();
      if (spec.enumValues && !spec.enumValues.includes(upper)) {
        const aliased = Object.entries(spec.valueAliases ?? {}).find(([, aliases]) =>
          aliases.includes(value as string),
        );
        if (!aliased) throw new QueryPlanValidationError(`Invalid enum value for ${field}`);
        value = aliased[0];
      } else {
        value = upper;
      }
    }
    if (spec.type === "boolean") value = value === true || value === "true";
    if (spec.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new QueryPlanValidationError(`Invalid number for ${field}`);
      value = n;
    }
    filters.push({
      source,
      field,
      operator: operator as BqlOperator,
      value: value as BqlFilter["value"],
    });
  }

  const groupBy = (Array.isArray(record.groupBy) ? record.groupBy : []).map((item) => String(item));
  for (const field of groupBy) {
    const ok = sources.some((source) => getSchemaDomain(source)?.groupFields.includes(field));
    if (!ok) throw new QueryPlanValidationError("Invalid groupBy field");
  }

  const sortRaw = Array.isArray(record.sort) ? record.sort : record.sort ? [record.sort] : [];
  const sort: BqlPlan["sort"] = [];
  for (const item of sortRaw) {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const field = String(row.field ?? "");
    const ok = sources.some((source) => getSchemaDomain(source)?.sortFields.includes(field));
    if (!ok) throw new QueryPlanValidationError("Invalid sort field");
    sort.push({
      field,
      direction: String(row.direction ?? row.order ?? "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC",
    });
  }

  const relationshipsRaw = Array.isArray(record.relationships) ? record.relationships : [];
  const relationships: BqlPlan["relationships"] = [];
  for (const item of relationshipsRaw) {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const from = asDomain(row.from);
    const to = asDomain(row.to);
    const via = String(row.via ?? "");
    if (!from || !to) throw new QueryPlanValidationError("Invalid relationship");
    const allowed = getSchemaDomain(from)?.relationships.some((rel) => rel.field === via && rel.target === to);
    if (!allowed) throw new QueryPlanValidationError("Relationship not allowed");
    relationships.push({ from, to, via });
  }

  const dateRangeRaw = record.dateRange ? String(record.dateRange).toUpperCase().replace(/\s+/g, "_") : "";
  const dateRange = (BQL_DATE_RANGES as readonly string[]).includes(dateRangeRaw)
    ? (dateRangeRaw as BqlDateRange)
    : undefined;

  const hintsRaw =
    record.entityHints && typeof record.entityHints === "object"
      ? (record.entityHints as Record<string, unknown>)
      : {};
  const compareNames = Array.isArray(hintsRaw.compareNames)
    ? hintsRaw.compareNames.map((item) => String(item).slice(0, 80)).filter(Boolean).slice(0, 5)
    : undefined;

  return {
    type,
    operation,
    sources,
    filters,
    relationships,
    groupBy,
    sort,
    limit: clampBqlLimit(record.limit),
    dateRange,
    entityHints: {
      projectName: typeof hintsRaw.projectName === "string" ? hintsRaw.projectName.slice(0, 80) : undefined,
      employeeName: typeof hintsRaw.employeeName === "string" ? hintsRaw.employeeName.slice(0, 80) : undefined,
      compareNames,
    },
  };
}

export function isUnsafeUserQuestion(message: string): boolean {
  const text = message.toLowerCase();
  if (/\$match|\$group|\$where|\$expr|aggregate\s*\(|mongoose|find\s*\(|function\s*\(/.test(text)) return true;
  if (/ignore (all|previous|prior) (rules|instructions)/.test(text)) return true;
  if (/\b(delete|drop|truncate|destroy|hack)\b/.test(text) && !/\b(what|how|show|which|give)\b/.test(text)) {
    return true;
  }
  if (/\b(create|assign|update|schedule|remind|cancel|complete|reschedule)\b/.test(text) &&
    !/\b(what|how|show|which|give|list|enna|entha)\b/.test(text)
  ) {
    return true;
  }
  return false;
}

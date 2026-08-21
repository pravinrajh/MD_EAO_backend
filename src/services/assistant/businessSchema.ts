import {
  EMPLOYEE_SAFE_FIELDS,
  EMPLOYEE_STATUSES,
  LEAD_STATUSES,
  MEETING_SAFE_FIELDS,
  MEETING_STATUSES,
  OPEN_OPPORTUNITY_STAGES,
  PROJECT_SAFE_FIELDS,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_SAFE_FIELDS,
  TASK_STATUSES,
} from "../../utils/constants";

export const BQL_DOMAINS = [
  "projects",
  "tasks",
  "employees",
  "meetings",
  "crm",
  "finance",
  "dashboard",
] as const;
export type BqlDomain = (typeof BQL_DOMAINS)[number];

export type SchemaField = {
  name: string;
  type: "string" | "enum" | "date" | "number" | "objectId" | "boolean" | "virtual";
  enumValues?: readonly string[];
  valueAliases?: Record<string, string[]>;
};

export type SchemaDomain = {
  name: BqlDomain;
  aliases: string[];
  fields: SchemaField[];
  relationships: Array<{ field: string; target: BqlDomain }>;
  groupFields: string[];
  sortFields: string[];
};

function fieldsFromSafe(safe: string, extras: SchemaField[] = []): SchemaField[] {
  const names = safe.split(/\s+/).filter(Boolean);
  const extraNames = new Set(extras.map((item) => item.name));
  const base: SchemaField[] = names
    .filter((name) => !extraNames.has(name))
    .map((name) => {
      if (name.endsWith("Id") || name === "members" || name === "participants") {
        return { name, type: "objectId" as const };
      }
      if (name.endsWith("At") || name.endsWith("Date") || name === "dueDate") {
        return { name, type: "date" as const };
      }
      if (name === "progress" || name === "budget" || name === "actualExpense") {
        return { name, type: "number" as const };
      }
      if (name.startsWith("is")) return { name, type: "boolean" as const };
      return { name, type: "string" as const };
    });
  return [...extras, ...base];
}

export const BUSINESS_SCHEMA: SchemaDomain[] = [
  {
    name: "projects",
    aliases: ["project", "projects", "site", "sites"],
    fields: fieldsFromSafe(PROJECT_SAFE_FIELDS, [
      {
        name: "status",
        type: "enum",
        enumValues: PROJECT_STATUSES,
        valueAliases: {
          ACTIVE: ["going", "ongoing", "running", "underway", "live", "current"],
          AT_RISK: ["delayed", "late", "slipping", "behind"],
          COMPLETED: ["done", "finished", "complete"],
          ON_HOLD: ["paused", "hold"],
        },
      },
      { name: "delayed", type: "virtual" },
      { name: "health", type: "virtual" },
    ]),
    relationships: [
      { field: "managerId", target: "employees" },
      { field: "members", target: "employees" },
    ],
    groupFields: ["status", "managerId"],
    sortFields: ["createdAt", "progress", "name", "status"],
  },
  {
    name: "tasks",
    aliases: ["task", "tasks", "work", "workload", "todo"],
    fields: fieldsFromSafe(TASK_SAFE_FIELDS, [
      {
        name: "status",
        type: "enum",
        enumValues: TASK_STATUSES,
        valueAliases: {
          PENDING: ["pending", "open", "waiting"],
          IN_PROGRESS: ["progress", "started"],
          COMPLETED: ["done", "finished", "complete"],
        },
      },
      { name: "priority", type: "enum", enumValues: TASK_PRIORITIES },
      { name: "overdue", type: "virtual" },
    ]),
    relationships: [
      { field: "assignedTo", target: "employees" },
      { field: "projectId", target: "projects" },
    ],
    groupFields: ["assignedTo", "projectId", "status"],
    sortFields: ["dueDate", "createdAt", "priority", "count", "pendingTasks", "overdueTasks"],
  },
  {
    name: "employees",
    aliases: ["employee", "employees", "staff", "team", "person", "people", "who"],
    fields: fieldsFromSafe(EMPLOYEE_SAFE_FIELDS, [
      { name: "status", type: "enum", enumValues: EMPLOYEE_STATUSES },
      { name: "workload", type: "virtual" },
    ]),
    relationships: [{ field: "managerId", target: "employees" }],
    groupFields: ["department", "status"],
    sortFields: ["createdAt", "pendingTasks", "overdueTasks", "count"],
  },
  {
    name: "meetings",
    aliases: ["meeting", "meetings", "calendar"],
    fields: fieldsFromSafe(MEETING_SAFE_FIELDS, [
      { name: "status", type: "enum", enumValues: MEETING_STATUSES },
    ]),
    relationships: [
      { field: "projectId", target: "projects" },
      { field: "participants", target: "employees" },
    ],
    groupFields: ["status", "projectId"],
    sortFields: ["startTime", "createdAt"],
  },
  {
    name: "crm",
    aliases: ["crm", "sales", "lead", "leads", "opportunity", "opportunities", "pipeline", "customer", "customers"],
    fields: [
      { name: "status", type: "enum", enumValues: LEAD_STATUSES },
      { name: "stage", type: "enum", enumValues: OPEN_OPPORTUNITY_STAGES },
    ],
    relationships: [],
    groupFields: ["status", "stage"],
    sortFields: ["createdAt"],
  },
  {
    name: "finance",
    aliases: ["finance", "financial", "money", "budget", "expense", "expenses", "income", "cash", "spending", "spend"],
    fields: [
      { name: "type", type: "string" },
      { name: "amount", type: "number" },
    ],
    relationships: [{ field: "projectId", target: "projects" }],
    groupFields: ["type"],
    sortFields: ["createdAt", "amount"],
  },
  {
    name: "dashboard",
    aliases: [
      "dashboard",
      "company",
      "business",
      "summary",
      "situation",
      "attention",
      "problems",
      "risk",
      "behind",
      "happening",
      "performing",
      "performance",
      "today",
      "overloaded",
      "compare",
    ],
    fields: [],
    relationships: [],
    groupFields: [],
    sortFields: [],
  },
];

export function getSchemaDomain(name: string): SchemaDomain | undefined {
  return BUSINESS_SCHEMA.find((item) => item.name === name);
}

export function schemaField(domain: SchemaDomain, field: string): SchemaField | undefined {
  return domain.fields.find((item) => item.name === field);
}

export function compactSchemaForLlm(): Record<string, unknown> {
  return {
    timezone: "application timezone, default Asia/Kolkata",
    domains: BUSINESS_SCHEMA.map((domain) => ({
      name: domain.name,
      aliases: domain.aliases,
      fields: domain.fields.map((field) => ({
        name: field.name,
        type: field.type,
        enumValues: field.enumValues,
        valueAliases: field.valueAliases,
      })),
      relationships: domain.relationships,
      groupFields: domain.groupFields,
      sortFields: domain.sortFields,
    })),
    missing: "If the user asks about a domain that is not listed, do not invent it.",
  };
}

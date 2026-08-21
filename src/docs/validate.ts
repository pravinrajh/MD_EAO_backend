const SECRET_PATTERNS = [
  /JWT_SECRET/i,
  /MONGODB_URI/i,
  /GEMINI_API_KEY/i,
  /WHATSAPP_ACCESS_TOKEN/i,
  /WHATSAPP_APP_SECRET/i,
  /passwordHash/i,
  /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\./,
];

function walkRefs(value: unknown, acc: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walkRefs(item, acc);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === "string") acc.push(record.$ref);
  for (const nested of Object.values(record)) walkRefs(nested, acc);
}

function collectOperations(paths: Record<string, Record<string, unknown>>) {
  const operations: Array<{ method: string; path: string; operationId?: string; tag?: string }> = [];
  for (const [path, item] of Object.entries(paths)) {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const op = item[method] as Record<string, unknown> | undefined;
      if (!op) continue;
      const tags = Array.isArray(op.tags) ? (op.tags as string[]) : [];
      operations.push({
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === "string" ? op.operationId : undefined,
        tag: tags[0],
      });
    }
  }
  return operations;
}

export type OpenApiValidationResult = {
  ok: true;
  endpointCount: number;
  tagCounts: Record<string, number>;
  operations: Array<{ method: string; path: string; tag?: string }>;
};

export function assertValidOpenApi(document: {
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}): OpenApiValidationResult {
  const refs: string[] = [];
  walkRefs(document, refs);

  const missing: string[] = [];
  for (const ref of refs) {
    const match = ref.match(/^#\/components\/(schemas|responses|parameters|securitySchemes)\/(.+)$/);
    if (!match) {
      missing.push(ref);
      continue;
    }
    const collection = document.components?.[match[1] as keyof NonNullable<typeof document.components>];
    if (!collection || !(match[2] in collection)) missing.push(ref);
  }
  if (missing.length > 0) {
    throw new Error(`Unresolved OpenAPI $ref values:\n${[...new Set(missing)].join("\n")}`);
  }

  const serialized = JSON.stringify(document);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`OpenAPI document appears to contain a secret matching ${pattern}`);
    }
  }

  const operations = collectOperations(document.paths);
  if (operations.length === 0) throw new Error("OpenAPI document has no paths");

  const ids = operations.map((item) => item.operationId).filter(Boolean) as string[];
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate operationId values: ${[...new Set(duplicates)].join(", ")}`);
  }

  const tagCounts: Record<string, number> = {};
  for (const operation of operations) {
    const tag = operation.tag ?? "Untagged";
    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }

  return {
    ok: true,
    endpointCount: operations.length,
    tagCounts,
    operations: operations.map(({ method, path, tag }) => ({ method, path, tag })),
  };
}

export const EXPRESS_ROUTE_INVENTORY: Array<{ method: string; path: string }> = [
  { method: "GET", path: "/api/v1/health" },
  { method: "GET", path: "/api/v1/health/database" },
  { method: "POST", path: "/api/v1/auth/register" },
  { method: "POST", path: "/api/v1/auth/login" },
  { method: "POST", path: "/api/v1/auth/refresh" },
  { method: "GET", path: "/api/v1/auth/me" },
  { method: "PATCH", path: "/api/v1/auth/me" },
  { method: "POST", path: "/api/v1/auth/logout" },
  { method: "GET", path: "/api/v1/users" },
  { method: "POST", path: "/api/v1/users" },
  { method: "PATCH", path: "/api/v1/users/{id}/status" },
  { method: "GET", path: "/api/v1/users/{id}" },
  { method: "PATCH", path: "/api/v1/users/{id}" },
  { method: "DELETE", path: "/api/v1/users/{id}" },
  { method: "GET", path: "/api/v1/employees" },
  { method: "POST", path: "/api/v1/employees" },
  { method: "PATCH", path: "/api/v1/employees/{id}/status" },
  { method: "GET", path: "/api/v1/employees/{id}" },
  { method: "PATCH", path: "/api/v1/employees/{id}" },
  { method: "DELETE", path: "/api/v1/employees/{id}" },
  { method: "GET", path: "/api/v1/tasks/my" },
  { method: "GET", path: "/api/v1/tasks/created-by-me" },
  { method: "GET", path: "/api/v1/tasks/overdue" },
  { method: "GET", path: "/api/v1/tasks/today" },
  { method: "GET", path: "/api/v1/tasks/counts" },
  { method: "GET", path: "/api/v1/tasks" },
  { method: "POST", path: "/api/v1/tasks" },
  { method: "PATCH", path: "/api/v1/tasks/{id}/status" },
  { method: "PATCH", path: "/api/v1/tasks/{id}/assignee" },
  { method: "GET", path: "/api/v1/tasks/{id}" },
  { method: "PATCH", path: "/api/v1/tasks/{id}" },
  { method: "DELETE", path: "/api/v1/tasks/{id}" },
  { method: "GET", path: "/api/v1/projects" },
  { method: "POST", path: "/api/v1/projects" },
  { method: "GET", path: "/api/v1/projects/{id}/tasks/summary" },
  { method: "GET", path: "/api/v1/projects/{id}/tasks" },
  { method: "GET", path: "/api/v1/projects/{id}/summary" },
  { method: "GET", path: "/api/v1/projects/{id}/meetings" },
  { method: "PATCH", path: "/api/v1/projects/{id}/status" },
  { method: "PATCH", path: "/api/v1/projects/{id}/manager" },
  { method: "PATCH", path: "/api/v1/projects/{id}/members" },
  { method: "GET", path: "/api/v1/projects/{id}" },
  { method: "PATCH", path: "/api/v1/projects/{id}" },
  { method: "DELETE", path: "/api/v1/projects/{id}" },
  { method: "GET", path: "/api/v1/meetings/today" },
  { method: "GET", path: "/api/v1/meetings/upcoming" },
  { method: "GET", path: "/api/v1/meetings/my" },
  { method: "GET", path: "/api/v1/meetings/calendar" },
  { method: "GET", path: "/api/v1/meetings/counts" },
  { method: "GET", path: "/api/v1/meetings" },
  { method: "POST", path: "/api/v1/meetings" },
  { method: "PATCH", path: "/api/v1/meetings/{id}/status" },
  { method: "PATCH", path: "/api/v1/meetings/{id}/reschedule" },
  { method: "PATCH", path: "/api/v1/meetings/{id}/cancel" },
  { method: "GET", path: "/api/v1/meetings/{id}" },
  { method: "PATCH", path: "/api/v1/meetings/{id}" },
  { method: "DELETE", path: "/api/v1/meetings/{id}" },
  { method: "GET", path: "/api/v1/leads" },
  { method: "POST", path: "/api/v1/leads" },
  { method: "PATCH", path: "/api/v1/leads/{id}/status" },
  { method: "PATCH", path: "/api/v1/leads/{id}/follow-up" },
  { method: "POST", path: "/api/v1/leads/{id}/convert" },
  { method: "GET", path: "/api/v1/leads/{id}" },
  { method: "PATCH", path: "/api/v1/leads/{id}" },
  { method: "DELETE", path: "/api/v1/leads/{id}" },
  { method: "GET", path: "/api/v1/customers" },
  { method: "POST", path: "/api/v1/customers" },
  { method: "PATCH", path: "/api/v1/customers/{id}/status" },
  { method: "GET", path: "/api/v1/customers/{id}" },
  { method: "PATCH", path: "/api/v1/customers/{id}" },
  { method: "DELETE", path: "/api/v1/customers/{id}" },
  { method: "GET", path: "/api/v1/opportunities/pipeline" },
  { method: "GET", path: "/api/v1/opportunities/forecast" },
  { method: "GET", path: "/api/v1/opportunities" },
  { method: "POST", path: "/api/v1/opportunities" },
  { method: "PATCH", path: "/api/v1/opportunities/{id}/stage" },
  { method: "GET", path: "/api/v1/opportunities/{id}" },
  { method: "PATCH", path: "/api/v1/opportunities/{id}" },
  { method: "DELETE", path: "/api/v1/opportunities/{id}" },
  { method: "GET", path: "/api/v1/sales-activities" },
  { method: "POST", path: "/api/v1/sales-activities" },
  { method: "PATCH", path: "/api/v1/sales-activities/{id}/status" },
  { method: "GET", path: "/api/v1/sales-activities/{id}" },
  { method: "PATCH", path: "/api/v1/sales-activities/{id}" },
  { method: "DELETE", path: "/api/v1/sales-activities/{id}" },
  { method: "GET", path: "/api/v1/sales/summary" },
  { method: "GET", path: "/api/v1/sales/my" },
  { method: "GET", path: "/api/v1/sales/follow-ups" },
  { method: "GET", path: "/api/v1/finance/accounts" },
  { method: "POST", path: "/api/v1/finance/accounts" },
  { method: "GET", path: "/api/v1/finance/accounts/{id}" },
  { method: "PATCH", path: "/api/v1/finance/accounts/{id}" },
  { method: "GET", path: "/api/v1/finance/categories" },
  { method: "POST", path: "/api/v1/finance/categories" },
  { method: "GET", path: "/api/v1/finance/categories/{id}" },
  { method: "PATCH", path: "/api/v1/finance/categories/{id}" },
  { method: "DELETE", path: "/api/v1/finance/categories/{id}" },
  { method: "GET", path: "/api/v1/finance/summary" },
  { method: "GET", path: "/api/v1/finance/reports/monthly" },
  { method: "GET", path: "/api/v1/finance/reports/expenses-by-category" },
  { method: "GET", path: "/api/v1/finance/projects/{id}/summary" },
  { method: "GET", path: "/api/v1/finance/customers/{id}/summary" },
  { method: "GET", path: "/api/v1/finance/budgets" },
  { method: "POST", path: "/api/v1/finance/budgets" },
  { method: "GET", path: "/api/v1/finance/budgets/{id}/summary" },
  { method: "GET", path: "/api/v1/finance/budgets/{id}" },
  { method: "PATCH", path: "/api/v1/finance/budgets/{id}" },
  { method: "DELETE", path: "/api/v1/finance/budgets/{id}" },
  { method: "POST", path: "/api/v1/finance/transactions/income" },
  { method: "POST", path: "/api/v1/finance/transactions/expense" },
  { method: "POST", path: "/api/v1/finance/transactions/transfer" },
  { method: "GET", path: "/api/v1/finance/transactions" },
  { method: "PATCH", path: "/api/v1/finance/transactions/{id}/status" },
  { method: "GET", path: "/api/v1/finance/transactions/{id}" },
  { method: "GET", path: "/api/v1/dashboard" },
  { method: "GET", path: "/api/v1/dashboard/md" },
  { method: "GET", path: "/api/v1/dashboard/me" },
  { method: "GET", path: "/api/v1/dashboard/attention" },
  { method: "GET", path: "/api/v1/dashboard/project-health" },
  { method: "GET", path: "/api/v1/dashboard/weekly-financial-requirement" },
  { method: "GET", path: "/api/v1/dashboard/upcoming-meetings" },
  { method: "GET", path: "/api/v1/dashboard/activity" },
  { method: "GET", path: "/api/v1/dashboard/morning-report" },
  { method: "POST", path: "/api/v1/assistant/query" },
  { method: "POST", path: "/api/v1/assistant/chat" },
  { method: "GET", path: "/api/v1/assistant/history" },
  { method: "POST", path: "/api/v1/assistant/action" },
  { method: "POST", path: "/api/v1/assistant/action/{actionId}/confirm" },
  { method: "GET", path: "/api/v1/assistant/actions/history" },
  { method: "POST", path: "/api/v1/ai/query" },
  { method: "POST", path: "/api/v1/ai/action" },
  { method: "POST", path: "/api/v1/ai/chat" },
  { method: "GET", path: "/api/v1/reminders/today" },
  { method: "GET", path: "/api/v1/reminders/upcoming" },
  { method: "GET", path: "/api/v1/reminders" },
  { method: "POST", path: "/api/v1/reminders" },
  { method: "GET", path: "/api/v1/reminders/{id}" },
  { method: "PATCH", path: "/api/v1/reminders/{id}" },
  { method: "PATCH", path: "/api/v1/reminders/{id}/complete" },
  { method: "PATCH", path: "/api/v1/reminders/{id}/cancel" },
  { method: "PATCH", path: "/api/v1/reminders/{id}/snooze" },
  { method: "GET", path: "/api/v1/notifications/unread-count" },
  { method: "PATCH", path: "/api/v1/notifications/read-all" },
  { method: "GET", path: "/api/v1/notifications" },
  { method: "GET", path: "/api/v1/notifications/{id}" },
  { method: "PATCH", path: "/api/v1/notifications/{id}/read" },
  { method: "PATCH", path: "/api/v1/notifications/{id}/unread" },
  { method: "DELETE", path: "/api/v1/notifications/{id}" },
  { method: "GET", path: "/api/v1/notification-preferences" },
  { method: "PATCH", path: "/api/v1/notification-preferences" },
  { method: "GET", path: "/api/v1/webhooks/whatsapp" },
  { method: "POST", path: "/api/v1/webhooks/whatsapp" },
  { method: "POST", path: "/api/v1/whatsapp/link-code" },
  { method: "DELETE", path: "/api/v1/whatsapp/link-code" },
];

export function assertMatchesExpressInventory(operations: Array<{ method: string; path: string }>) {
  const documented = new Set(operations.map((item) => `${item.method} ${item.path}`));
  const expected = new Set(EXPRESS_ROUTE_INVENTORY.map((item) => `${item.method} ${item.path}`));
  const undocumented = [...expected].filter((item) => !documented.has(item));
  const extra = [...documented].filter((item) => !expected.has(item));
  if (undocumented.length || extra.length) {
    const lines = [
      undocumented.length ? `Undocumented Express routes:\n${undocumented.join("\n")}` : "",
      extra.length ? `Documented paths that do not exist:\n${extra.join("\n")}` : "",
    ].filter(Boolean);
    throw new Error(lines.join("\n\n"));
  }
}

import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  BUDGET_STATUSES,
  FINANCE_CATEGORY_STATUSES,
  FINANCE_CATEGORY_TYPES,
  FINANCE_TRANSACTION_STATUSES,
  FINANCE_TRANSACTION_TYPES,
  PAYMENT_METHODS,
  PROJECT_STATUSES,
  DASHBOARD_HEALTH,
} from "../utils/constants";
import {
  JWT,
  created,
  idParam,
  item,
  jsonBody,
  jwtReadErrors,
  jwtWriteErrors,
  list,
  op,
  pageQuery,
  queryDateTime,
  queryEnum,
  queryObjectId,
  searchQuery,
  sortBy,
  sortOrder,
  success,
  type OperationObject,
  type ParameterObject,
} from "./helpers";

type PathItem = Partial<Record<"get" | "post" | "patch" | "delete", OperationObject>>;

function jwtOp(
  tag: string,
  summary: string,
  extra: Omit<OperationObject, "tags" | "summary" | "operationId" | "security"> & { roles?: string },
): OperationObject {
  const description = [extra.description, extra.roles ? `Authorization: ${extra.roles}` : ""].filter(Boolean).join("\n\n");
  return op({
    tags: [tag],
    summary,
    description: description || undefined,
    operationId: `${tag}_${summary}`.replace(/[^A-Za-z0-9]+/g, "_"),
    security: JWT,
    parameters: extra.parameters,
    requestBody: extra.requestBody,
    responses: extra.responses,
  });
}

const financeNote =
  "Sensitive finance data. EMPLOYEE cannot access company finance. Amounts are whole INR integers, not paise.";

const finance: Record<string, PathItem> = {
  "/api/v1/finance/accounts": {
    get: jwtOp("Finance", "List accounts", {
      description: financeNote,
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryEnum("type", ACCOUNT_TYPES),
        queryEnum("status", ACCOUNT_STATUSES),
        sortBy(["name", "code", "createdAt", "type", "currentBalance"]),
        sortOrder,
      ],
      responses: { "200": list("Account"), ...jwtReadErrors },
    }),
    post: jwtOp("Finance", "Create account", {
      roles: "MD or ADMIN.",
      requestBody: jsonBody("CreateAccountRequest"),
      responses: { "201": created("Account"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/accounts/{id}": {
    get: jwtOp("Finance", "Get account", { parameters: [idParam], responses: { "200": item("Account"), ...jwtReadErrors } }),
    patch: jwtOp("Finance", "Update account", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateAccountRequest"),
      responses: { "200": item("Account"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/categories": {
    get: jwtOp("Finance", "List finance categories", {
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryEnum("type", FINANCE_CATEGORY_TYPES),
        queryEnum("status", FINANCE_CATEGORY_STATUSES),
        sortBy(["name", "code", "createdAt", "type"]),
        sortOrder,
      ],
      responses: { "200": list("FinanceCategory"), ...jwtReadErrors },
    }),
    post: jwtOp("Finance", "Create finance category", {
      roles: "MD or ADMIN.",
      requestBody: jsonBody("CreateFinanceCategoryRequest"),
      responses: { "201": created("FinanceCategory"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/categories/{id}": {
    get: jwtOp("Finance", "Get finance category", {
      parameters: [idParam],
      responses: { "200": item("FinanceCategory"), ...jwtReadErrors },
    }),
    patch: jwtOp("Finance", "Update finance category", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateFinanceCategoryRequest"),
      responses: { "200": item("FinanceCategory"), ...jwtWriteErrors },
    }),
    delete: jwtOp("Finance", "Delete finance category", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      responses: { "200": item("FinanceCategory"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/summary": {
    get: jwtOp("Finance", "Finance summary", {
      description: financeNote,
      parameters: [queryDateTime("from"), queryDateTime("to"), queryObjectId("projectId"), queryObjectId("accountId")],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/finance/reports/monthly": {
    get: jwtOp("Finance", "Monthly finance report", {
      parameters: [
        { name: "year", in: "query", schema: { type: "integer", minimum: 2000, maximum: 2100 } },
        queryObjectId("projectId"),
      ],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/finance/reports/expenses-by-category": {
    get: jwtOp("Finance", "Expenses by category", {
      parameters: [queryDateTime("from"), queryDateTime("to"), queryObjectId("projectId")],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/finance/projects/{id}/summary": {
    get: jwtOp("Finance", "Project finance summary", {
      parameters: [idParam],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/finance/customers/{id}/summary": {
    get: jwtOp("Finance", "Customer finance summary", {
      parameters: [idParam],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/finance/budgets": {
    get: jwtOp("Finance", "List budgets", {
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryObjectId("projectId"),
        queryObjectId("categoryId"),
        queryEnum("status", BUDGET_STATUSES),
        sortBy(["createdAt", "periodStart", "periodEnd", "amount", "name"]),
        sortOrder,
      ],
      responses: { "200": list("Budget"), ...jwtReadErrors },
    }),
    post: jwtOp("Finance", "Create budget", {
      requestBody: jsonBody("CreateBudgetRequest"),
      responses: { "201": created("Budget"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/budgets/{id}/summary": {
    get: jwtOp("Finance", "Budget utilization summary", {
      parameters: [idParam],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/finance/budgets/{id}": {
    get: jwtOp("Finance", "Get budget", { parameters: [idParam], responses: { "200": item("Budget"), ...jwtReadErrors } }),
    patch: jwtOp("Finance", "Update budget", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateBudgetRequest"),
      responses: { "200": item("Budget"), ...jwtWriteErrors },
    }),
    delete: jwtOp("Finance", "Delete budget", {
      parameters: [idParam],
      responses: { "200": item("Budget"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/transactions/income": {
    post: jwtOp("Finance", "Record income", {
      requestBody: jsonBody("CreateIncomeRequest"),
      responses: { "201": created("FinanceTransaction"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/transactions/expense": {
    post: jwtOp("Finance", "Record expense", {
      requestBody: jsonBody("CreateExpenseRequest"),
      responses: { "201": created("FinanceTransaction"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/transactions/transfer": {
    post: jwtOp("Finance", "Transfer between accounts", {
      roles: "MD or ADMIN.",
      requestBody: jsonBody("CreateTransferRequest"),
      responses: { "201": created("FinanceTransaction"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/transactions": {
    get: jwtOp("Finance", "List transactions", {
      parameters: [
        ...pageQuery,
        queryEnum("type", FINANCE_TRANSACTION_TYPES),
        queryEnum("status", FINANCE_TRANSACTION_STATUSES),
        queryObjectId("accountId"),
        queryObjectId("categoryId"),
        queryObjectId("projectId"),
        queryObjectId("customerId"),
        queryObjectId("opportunityId"),
        queryEnum("paymentMethod", PAYMENT_METHODS),
        queryDateTime("from"),
        queryDateTime("to"),
        sortBy(["transactionDate", "createdAt", "amount", "status", "type"]),
        sortOrder,
      ],
      responses: { "200": list("FinanceTransaction"), ...jwtReadErrors },
    }),
  },
  "/api/v1/finance/transactions/{id}/status": {
    patch: jwtOp("Finance", "Update transaction status", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateTransactionStatusRequest"),
      responses: { "200": item("FinanceTransaction"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/finance/transactions/{id}": {
    get: jwtOp("Finance", "Get transaction", {
      parameters: [idParam],
      responses: { "200": item("FinanceTransaction"), ...jwtReadErrors },
    }),
  },
};

const dashboardQuery: ParameterObject[] = [
  { name: "date", in: "query", schema: { type: "string", format: "date", example: "2026-08-21" }, description: "Business date in APP_TIMEZONE" },
  queryDateTime("from"),
  queryDateTime("to"),
];

const dashboard: Record<string, PathItem> = {
  "/api/v1/dashboard": {
    get: jwtOp("Dashboard", "Role-scoped dashboard", {
      description: "MD/ADMIN company view, MANAGER team/project scope, EMPLOYEE assigned work (no company finance).",
      parameters: dashboardQuery,
      responses: {
        "200": item("Dashboard", {
          example: { success: true, message: "Dashboard fetched successfully", data: { timezone: "Asia/Kolkata" } },
        }),
        ...jwtReadErrors,
      },
    }),
  },
  "/api/v1/dashboard/md": {
    get: jwtOp("Dashboard", "MD company dashboard", {
      roles: "MD or ADMIN.",
      parameters: dashboardQuery,
      responses: { "200": item("Dashboard"), ...jwtReadErrors },
    }),
  },
  "/api/v1/dashboard/me": {
    get: jwtOp("Dashboard", "Personal dashboard", {
      parameters: dashboardQuery,
      responses: { "200": item("Dashboard"), ...jwtReadErrors },
    }),
  },
  "/api/v1/dashboard/attention": {
    get: jwtOp("Dashboard", "Items needing attention", {
      parameters: dashboardQuery,
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/dashboard/project-health": {
    get: jwtOp("Dashboard", "Project health", {
      description: "HEALTHY/ATTENTION/CRITICAL mapped to GREEN/YELLOW/RED for Flutter.",
      parameters: [
        { name: "date", in: "query", schema: { type: "string", format: "date" } },
        ...pageQuery,
        queryEnum("status", PROJECT_STATUSES),
        queryEnum("health", [...DASHBOARD_HEALTH, "HEALTHY", "ATTENTION", "CRITICAL", "AT_RISK"]),
      ],
      responses: { "200": success({ type: "object", additionalProperties: true }, { meta: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/dashboard/weekly-financial-requirement": {
    get: jwtOp("Dashboard", "Weekly cash requirement", {
      roles: "MD, ADMIN, or MANAGER. Uses completed and pending finance transactions dated this week.",
      parameters: dashboardQuery,
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/dashboard/upcoming-meetings": {
    get: jwtOp("Dashboard", "Upcoming meetings widget", {
      parameters: [
        { name: "date", in: "query", schema: { type: "string", format: "date" } },
        { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 31 } },
      ],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/dashboard/activity": {
    get: jwtOp("Dashboard", "Recent activity", {
      parameters: [
        ...dashboardQuery,
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20 } },
      ],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/dashboard/morning-report": {
    get: jwtOp("Dashboard", "Morning report", {
      parameters: dashboardQuery,
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
};

export const financePaths = { ...finance, ...dashboard };

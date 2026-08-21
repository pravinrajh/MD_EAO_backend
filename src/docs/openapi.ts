import { swaggerServerUrl } from "../config/env";
import { componentResponses, componentSchemas, componentSecuritySchemes } from "./components";
import { corePaths } from "./paths.core";
import { engagementPaths } from "./paths.engagement";
import { financePaths } from "./paths.finance";
import { salesPaths } from "./paths.sales";
import { assertValidOpenApi } from "./validate";

export const OPENAPI_VERSION = "3.0.3";

export const OPENAPI_TAGS = [
  { name: "Authentication", description: "Register, login, refresh, and session management." },
  { name: "Users", description: "Application user accounts and status." },
  { name: "Employees", description: "Company employee profiles linked to user accounts." },
  { name: "Tasks", description: "Task assignment, status, and filters." },
  { name: "Projects", description: "Projects, members, health, and related work." },
  { name: "Meetings", description: "Meetings, calendar, reschedule, and cancellation." },
  { name: "Sales", description: "Sales activities, summaries, and follow-ups." },
  { name: "CRM", description: "Leads, customers, opportunities, and pipeline." },
  { name: "Finance", description: "Accounts, categories, transactions, budgets, and reports. Amounts are whole INR integers." },
  { name: "Dashboard", description: "Executive-level business intelligence and KPI APIs." },
  { name: "Assistant Query", description: "Read-only natural-language business queries." },
  { name: "Assistant Action", description: "Controlled business actions executed through the AI Assistant." },
  { name: "Reminders", description: "Scheduled reminders and reminder lifecycle management." },
  { name: "Notifications", description: "In-app notifications and notification state management." },
  { name: "Notification Preferences", description: "Channel, category, and quiet-hour preferences." },
  { name: "WhatsApp", description: "WhatsApp webhook and identity integration." },
  { name: "AI", description: "AI orchestration aliases for assistant query, action, and chatbot chat." },
  { name: "Health", description: "Liveness and database connectivity checks." },
] as const;

export function buildOpenApiDocument() {
  const document = {
    openapi: OPENAPI_VERSION,
    info: {
      title: "AI Executive Office API",
      version: "1.0.0",
      description:
        "Production REST API for the AI Executive Office / AI Chief of Staff. Flutter and WhatsApp are transports; this API is the business brain. Money fields are whole INR rupees (integers). Date-times are ISO-8601 UTC; IANA timezones such as Asia/Kolkata appear on meeting and reminder records.",
    },
    servers: [
      {
        url: swaggerServerUrl(),
        description: "Configured API origin (SWAGGER_SERVER_URL or localhost)",
      },
    ],
    tags: OPENAPI_TAGS.map((tag) => ({ name: tag.name, description: tag.description })),
    security: [{ BearerAuth: [] }],
    paths: {
      ...corePaths,
      ...salesPaths,
      ...financePaths,
      ...engagementPaths,
    },
    components: {
      securitySchemes: componentSecuritySchemes,
      schemas: componentSchemas,
      responses: componentResponses,
    },
  };

  assertValidOpenApi(document);
  return document;
}

let cached: ReturnType<typeof buildOpenApiDocument> | null = null;

export function getOpenApiDocument() {
  if (!cached) cached = buildOpenApiDocument();
  return cached;
}

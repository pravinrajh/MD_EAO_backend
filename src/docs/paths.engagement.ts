import {
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_TYPES,
  REMINDER_PRIORITIES,
  REMINDER_STATUSES,
  REMINDER_TYPES,
} from "../utils/constants";
import {
  JWT,
  PUBLIC,
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
  success,
  type OperationObject,
  type ParameterObject,
} from "./helpers";

type PathItem = Partial<Record<"get" | "post" | "patch" | "delete", OperationObject>>;

function jwtOp(
  tag: string,
  summary: string,
  extra: Omit<OperationObject, "tags" | "summary" | "operationId" | "security"> & {
    roles?: string;
    public?: boolean;
  },
): OperationObject {
  const description = [extra.description, extra.roles ? `Authorization: ${extra.roles}` : ""].filter(Boolean).join("\n\n");
  return op({
    tags: [tag],
    summary,
    description: description || undefined,
    operationId: `${tag}_${summary}`.replace(/[^A-Za-z0-9]+/g, "_"),
    security: extra.public ? PUBLIC : JWT,
    parameters: extra.parameters,
    requestBody: extra.requestBody,
    responses: extra.responses,
  });
}

const assistant: Record<string, PathItem> = {
  "/api/v1/assistant/query": {
    post: jwtOp("Assistant Query", "Natural-language read query", {
      description:
        "Read-only. Identify the user from the JWT, never from the body. Write requests such as 'create a task' are UNSUPPORTED here — use Assistant Action.",
      requestBody: jsonBody("AssistantQueryRequest", { message: "What tasks are pending?", conversationId: "CONV-001" }),
      responses: {
        "200": item("AssistantQueryResponse", {
          example: {
            success: true,
            message: "Query processed successfully",
            data: {
              queryId: "QRY-000001",
              intent: "PENDING_TASKS",
              answer: "You have 12 pending tasks.",
              data: {},
              sources: [],
              confidence: 0.98,
            },
          },
        }),
        ...jwtWriteErrors,
      },
    }),
  },
  "/api/v1/assistant/history": {
    get: jwtOp("Assistant Query", "Query history for current user", {
      parameters: [
        ...pageQuery,
        { name: "conversationId", in: "query", schema: { type: "string", maxLength: 100 } },
      ],
      responses: { "200": list("AssistantQueryHistoryItem"), ...jwtReadErrors },
    }),
  },
  "/api/v1/assistant/action": {
    post: jwtOp("Assistant Action", "Natural-language write action", {
      description:
        "Controlled intents only. Optional Idempotency-Key (max 128) returns the stored result and does not repeat the business write. Finance writes and bulk deletes return UNSUPPORTED.",
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          schema: { type: "string", maxLength: 128 },
          description: "Optional idempotency key for retries",
        },
      ],
      requestBody: jsonBody("AssistantActionRequest", { message: "Create a task to call ABC tomorrow" }),
      responses: {
        "200": item("AssistantActionResponse", {
          example: {
            success: true,
            message: "Action processed successfully",
            data: {
              actionId: "ACT-000001",
              intent: "CREATE_TASK",
              status: "COMPLETED",
              message: "Task created.",
              result: { taskId: "TASK-000002" },
              requiresConfirmation: false,
            },
          },
        }),
        ...jwtWriteErrors,
      },
    }),
  },
  "/api/v1/assistant/action/{actionId}/confirm": {
    post: jwtOp("Assistant Action", "Confirm or reject a pending action", {
      description: "Bound to actionId + current user. Another user receives 404. Statuses: COMPLETED, FAILED, REQUIRES_CONFIRMATION, CLARIFICATION_REQUIRED, UNAUTHORIZED, UNSUPPORTED.",
      parameters: [
        {
          name: "actionId",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^ACT-\\d{6}$", example: "ACT-000001" },
        },
      ],
      requestBody: jsonBody("ConfirmActionRequest", { confirmed: true }),
      responses: { "200": item("AssistantActionResponse"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/assistant/actions/history": {
    get: jwtOp("Assistant Action", "Action history for current user", {
      parameters: [
        ...pageQuery,
        { name: "conversationId", in: "query", schema: { type: "string", maxLength: 100 } },
      ],
      responses: { "200": list("AssistantActionHistoryItem"), ...jwtReadErrors },
    }),
  },
};

const reminderQuery: ParameterObject[] = [
  ...pageQuery,
  queryEnum("status", REMINDER_STATUSES),
  queryEnum("reminderType", REMINDER_TYPES),
  queryEnum("priority", REMINDER_PRIORITIES),
  queryDateTime("from"),
  queryDateTime("to"),
];

const reminders: Record<string, PathItem> = {
  "/api/v1/reminders/today": {
    get: jwtOp("Reminders", "Today's reminders", {
      parameters: reminderQuery,
      responses: { "200": list("Reminder"), ...jwtReadErrors },
    }),
  },
  "/api/v1/reminders/upcoming": {
    get: jwtOp("Reminders", "Upcoming reminders", {
      parameters: [...pageQuery, { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 30 } }],
      responses: { "200": list("Reminder"), ...jwtReadErrors },
    }),
  },
  "/api/v1/reminders": {
    get: jwtOp("Reminders", "List reminders", {
      description: "userId always comes from the JWT.",
      parameters: reminderQuery,
      responses: { "200": list("Reminder"), ...jwtReadErrors },
    }),
    post: jwtOp("Reminders", "Create reminder", {
      requestBody: jsonBody("CreateReminderRequest", {
        title: "Call ABC Industries",
        scheduledAt: "2026-08-21T10:00:00.000Z",
        timezone: "Asia/Kolkata",
        priority: "HIGH",
      }),
      responses: { "201": created("Reminder"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/reminders/{id}": {
    get: jwtOp("Reminders", "Get reminder", { parameters: [idParam], responses: { "200": item("Reminder"), ...jwtReadErrors } }),
    patch: jwtOp("Reminders", "Update reminder", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateReminderRequest"),
      responses: { "200": item("Reminder"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/reminders/{id}/complete": {
    patch: jwtOp("Reminders", "Complete reminder", {
      parameters: [idParam],
      responses: { "200": item("Reminder"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/reminders/{id}/cancel": {
    patch: jwtOp("Reminders", "Cancel reminder", {
      parameters: [idParam],
      responses: { "200": item("Reminder"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/reminders/{id}/snooze": {
    patch: jwtOp("Reminders", "Snooze reminder", {
      parameters: [idParam],
      requestBody: jsonBody("SnoozeReminderRequest"),
      responses: { "200": item("Reminder"), ...jwtWriteErrors },
    }),
  },
};

const notifications: Record<string, PathItem> = {
  "/api/v1/notifications/unread-count": {
    get: jwtOp("Notifications", "Unread notification count", {
      responses: { "200": item("UnreadCount"), ...jwtReadErrors },
    }),
  },
  "/api/v1/notifications/read-all": {
    patch: jwtOp("Notifications", "Mark all notifications read", {
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtWriteErrors },
    }),
  },
  "/api/v1/notifications": {
    get: jwtOp("Notifications", "List notifications", {
      parameters: [
        ...pageQuery,
        { name: "isRead", in: "query", schema: { type: "boolean" } },
        queryEnum("type", NOTIFICATION_TYPES),
        queryEnum("priority", NOTIFICATION_PRIORITIES),
        queryDateTime("from"),
        queryDateTime("to"),
      ],
      responses: { "200": list("Notification"), ...jwtReadErrors },
    }),
  },
  "/api/v1/notifications/{id}": {
    get: jwtOp("Notifications", "Get notification", {
      parameters: [idParam],
      responses: { "200": item("Notification"), ...jwtReadErrors },
    }),
    delete: jwtOp("Notifications", "Delete notification", {
      parameters: [idParam],
      responses: { "200": item("Notification"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/notifications/{id}/read": {
    patch: jwtOp("Notifications", "Mark notification read", {
      parameters: [idParam],
      responses: { "200": item("Notification"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/notifications/{id}/unread": {
    patch: jwtOp("Notifications", "Mark notification unread", {
      parameters: [idParam],
      responses: { "200": item("Notification"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/notification-preferences": {
    get: jwtOp("Notification Preferences", "Get notification preferences", {
      responses: { "200": item("NotificationPreference"), ...jwtReadErrors },
    }),
    patch: jwtOp("Notification Preferences", "Update notification preferences", {
      requestBody: jsonBody("UpdateNotificationPreferenceRequest", {
        channels: { inApp: true, email: false, sms: false, push: false, whatsapp: false },
        categories: { tasks: true, meetings: true, projects: true, crm: true, finance: false, reminders: true, system: true },
      }),
      responses: { "200": item("NotificationPreference"), ...jwtWriteErrors },
    }),
  },
};

const whatsapp: Record<string, PathItem> = {
  "/api/v1/webhooks/whatsapp": {
    get: jwtOp("WhatsApp", "Verify Meta webhook", {
      public: true,
      description:
        "Provider-facing. Not JWT. Meta sends hub.mode, hub.verify_token, and hub.challenge. The API returns the challenge as plain text only when the verify token matches the configured value. The token is never echoed.",
      parameters: [
        { name: "hub.mode", in: "query", schema: { type: "string", example: "subscribe" } },
        { name: "hub.verify_token", in: "query", schema: { type: "string", example: "<verify-token>" } },
        { name: "hub.challenge", in: "query", schema: { type: "string", example: "challenge-token" } },
      ],
      responses: {
        "200": {
          description: "Plain-text challenge",
          content: { "text/plain": { schema: { type: "string", example: "challenge-token" } } },
        },
        "403": {
          description: "Invalid or missing verification parameters",
          content: { "text/plain": { schema: { type: "string", example: "Forbidden" } } },
        },
      },
    }),
    post: jwtOp("WhatsApp", "Receive Meta webhook", {
      public: true,
      description:
        "Provider-facing. Not JWT. Requires header X-Hub-Signature-256 = sha256=<hmac of raw body>. Missing signature → 401. Invalid signature → 403. Acknowledges with HTTP 200 after persisting the event; Assistant work runs asynchronously. Do not send provider secrets in examples.",
      parameters: [
        {
          name: "X-Hub-Signature-256",
          in: "header",
          required: true,
          schema: { type: "string", example: "sha256=<hex-digest>" },
          description: "HMAC-SHA256 of the raw JSON body. This is not a static API key.",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/WhatsAppWebhookPayload" },
          },
        },
      },
      responses: {
        "200": {
          description: "Provider acknowledgement. Assistant work is not returned on this request.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WhatsAppWebhookAck" },
              example: { success: true },
            },
          },
        },
        "401": { $ref: "#/components/responses/Unauthorized" },
        "403": { $ref: "#/components/responses/Forbidden" },
        "429": { $ref: "#/components/responses/TooManyRequests" },
      },
    }),
  },
  "/api/v1/whatsapp/link-code": {
    post: jwtOp("WhatsApp", "Create WhatsApp linking code", {
      description: "Authenticated user. Returns a 6-digit single-use code (hashed at rest) that expires. Send LINK 482913 from WhatsApp to bind the phone.",
      responses: { "201": created("WhatsAppLinkCodeResponse"), ...jwtWriteErrors },
    }),
    delete: jwtOp("WhatsApp", "Cancel pending linking code", {
      responses: { "200": item("WhatsAppLinkCancelResponse"), ...jwtWriteErrors },
    }),
  },
};

export const engagementPaths = { ...assistant, ...reminders, ...notifications, ...whatsapp };

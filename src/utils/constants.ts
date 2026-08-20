export const ROLES = ["MD", "ADMIN", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_SAFE_FIELDS =
  "name email phone role status isActive lastLoginAt createdAt updatedAt";

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_SAFE_FIELDS =
  "employeeId userId employeeCode firstName lastName displayName email phone department designation managerId joiningDate employmentType location status profileImage createdAt updatedAt";

export const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_SAFE_FIELDS =
  "taskId title description assignedTo createdBy projectId customerId meetingId priority status dueDate reminderAt startedAt completedAt cancelledAt completionNote cancellationReason isDeleted deletedAt deletedBy createdAt updatedAt";

export const OPEN_TASK_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS"];

export const PROJECT_TYPES = [
  "RESIDENTIAL",
  "COMMERCIAL",
  "INFRASTRUCTURE",
  "LAND_DEVELOPMENT",
  "INTERNAL",
  "OTHER",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "AT_RISK"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_HEALTH = ["HEALTHY", "ATTENTION", "CRITICAL"] as const;
export type ProjectHealth = (typeof PROJECT_HEALTH)[number];

export const PROJECT_SAFE_FIELDS =
  "projectId name code description location projectType managerId members customerId status progress budget actualExpense startDate expectedEndDate completedAt createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const MAX_PROJECT_MEMBERS = 50;

export const MEETING_TYPES = [
  "INTERNAL",
  "CLIENT",
  "VENDOR",
  "PROJECT_REVIEW",
  "TEAM",
  "MANAGEMENT",
  "SITE_VISIT",
  "OTHER",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_SAFE_FIELDS =
  "meetingId title description meetingType organizerId participants projectId customerId location startTime endTime timezone status notes cancellationReason cancelledAt completedAt createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const MAX_MEETING_PARTICIPANTS = 50;
export const MAX_CALENDAR_RANGE_DAYS = 93;
export const MAX_CALENDAR_RESULTS = 2000;

export const LEAD_SOURCES = [
  "WEBSITE",
  "REFERRAL",
  "PHONE",
  "EMAIL",
  "SOCIAL_MEDIA",
  "ADVERTISEMENT",
  "EVENT",
  "DIRECT",
  "OTHER",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LEAD_SAFE_FIELDS =
  "leadId name companyName email phone alternatePhone source industry location description assignedTo status priority estimatedValue expectedCloseDate nextFollowUpAt convertedAt convertedCustomerId convertedOpportunityId createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const CUSTOMER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_SAFE_FIELDS =
  "customerId name companyName email phone alternatePhone industry location address taxIdentifier assignedTo sourceLeadId status notes createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const OPPORTUNITY_STAGES = [
  "NEW",
  "QUALIFICATION",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPEN_OPPORTUNITY_STAGES: OpportunityStage[] = [
  "NEW",
  "QUALIFICATION",
  "PROPOSAL",
  "NEGOTIATION",
];

export const OPPORTUNITY_STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  NEW: 10,
  QUALIFICATION: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

export const OPPORTUNITY_SAFE_FIELDS =
  "opportunityId title customerId leadId projectId assignedTo stage probability estimatedValue expectedCloseDate description nextFollowUpAt lostReason wonAt lostAt createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const SALES_ACTIVITY_TYPES = [
  "CALL",
  "EMAIL",
  "MEETING",
  "FOLLOW_UP",
  "SITE_VISIT",
  "NOTE",
  "OTHER",
] as const;
export type SalesActivityType = (typeof SALES_ACTIVITY_TYPES)[number];

export const SALES_ACTIVITY_STATUSES = ["PENDING", "COMPLETED", "CANCELLED"] as const;
export type SalesActivityStatus = (typeof SALES_ACTIVITY_STATUSES)[number];

export const SALES_ACTIVITY_SAFE_FIELDS =
  "activityId type title description leadId customerId opportunityId employeeId scheduledAt completedAt status createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const MY_SALES_LIMIT = 20;

export const ACCOUNT_TYPES = [
  "CASH",
  "BANK",
  "RECEIVABLE",
  "PAYABLE",
  "INCOME",
  "EXPENSE",
  "ASSET",
  "LIABILITY",
  "EQUITY",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_SAFE_FIELDS =
  "accountId name code type description openingBalance currentBalance currency status createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const FINANCE_CATEGORY_TYPES = ["INCOME", "EXPENSE"] as const;
export type FinanceCategoryType = (typeof FINANCE_CATEGORY_TYPES)[number];

export const FINANCE_CATEGORY_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type FinanceCategoryStatus = (typeof FINANCE_CATEGORY_STATUSES)[number];

export const FINANCE_CATEGORY_SAFE_FIELDS =
  "categoryId name code type description status createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const FINANCE_TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export type FinanceTransactionType = (typeof FINANCE_TRANSACTION_TYPES)[number];

export const FINANCE_TRANSACTION_STATUSES = ["PENDING", "COMPLETED", "CANCELLED"] as const;
export type FinanceTransactionStatus = (typeof FINANCE_TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "UPI", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const FINANCE_CURRENCIES = ["INR"] as const;
export type FinanceCurrency = (typeof FINANCE_CURRENCIES)[number];

export const FINANCE_TRANSACTION_SAFE_FIELDS =
  "transactionId type accountId counterpartyAccountId categoryId amount currency description referenceType referenceId projectId customerId opportunityId transactionDate status paymentMethod externalReference idempotencyKey notes createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const BUDGET_STATUSES = ["ACTIVE", "CLOSED", "CANCELLED"] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const BUDGET_SAFE_FIELDS =
  "budgetId name projectId categoryId amount currency periodStart periodEnd status createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

export const DEFAULT_CURRENCY: FinanceCurrency = "INR";

export const PAGINATION = {
  defaultPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
} as const;

export const DASHBOARD_HEALTH = ["GREEN", "YELLOW", "RED"] as const;
export type DashboardHealth = (typeof DASHBOARD_HEALTH)[number];

export const DASHBOARD_LIMITS = {
  overdueTasks: 10,
  attention: 10,
  activity: 20,
  todayMeetings: 20,
  upcomingMeetings: 50,
  projectHealthMax: 50,
  projectHealthDefault: 10,
} as const;

export const DASHBOARD_BUDGET_ATTENTION_PERCENT = 80;
export const DASHBOARD_SERIOUS_OVERDUE_TASKS = 5;
export const DASHBOARD_MEETING_SOON_MS = 2 * 60 * 60 * 1000;

export const ASSISTANT_INTENTS = [
  "PENDING_TASKS",
  "OVERDUE_TASKS",
  "TODAY_TASKS",
  "TASK_SUMMARY",
  "PROJECT_STATUS",
  "PROJECT_HEALTH",
  "PROJECT_TASKS",
  "PROJECT_FINANCE",
  "TODAY_MEETINGS",
  "UPCOMING_MEETINGS",
  "MEETING_SUMMARY",
  "SALES_SUMMARY",
  "SALES_PIPELINE",
  "LEAD_SUMMARY",
  "OPPORTUNITY_SUMMARY",
  "FINANCE_SUMMARY",
  "MONTHLY_FINANCE",
  "WEEKLY_FINANCIAL_REQUIREMENT",
  "BUDGET_SUMMARY",
  "ATTENTION_ITEMS",
  "MORNING_REPORT",
  "COMPANY_SUMMARY",
  "MY_WORK_SUMMARY",
  "UNSUPPORTED",
] as const;
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

export const ASSISTANT_QUERY_STATUSES = ["SUCCESS", "FAILED", "UNSUPPORTED"] as const;
export type AssistantQueryStatus = (typeof ASSISTANT_QUERY_STATUSES)[number];

export const ASSISTANT_SAFE_FIELDS =
  "queryId userId conversationId message intent entities answer data sources confidence status processingTimeMs createdAt";

export const ASSISTANT_LIST_LIMIT = 10;
export const ASSISTANT_LIST_MAX = 20;
export const ASSISTANT_QUERY_TIMEOUT_MS = 8000;
export const ASSISTANT_MESSAGE_MAX = 2000;

export const ASSISTANT_ACTION_INTENTS = [
  "CREATE_TASK",
  "UPDATE_TASK",
  "ASSIGN_TASK",
  "COMPLETE_TASK",
  "CREATE_MEETING",
  "UPDATE_MEETING",
  "CANCEL_MEETING",
  "CREATE_PROJECT",
  "UPDATE_PROJECT",
  "CREATE_LEAD",
  "UPDATE_LEAD",
  "CREATE_OPPORTUNITY",
  "UPDATE_OPPORTUNITY",
  "CREATE_CUSTOMER",
  "UPDATE_CUSTOMER",
  "CREATE_REMINDER",
  "UNSUPPORTED",
] as const;
export type AssistantActionIntent = (typeof ASSISTANT_ACTION_INTENTS)[number];

export const ASSISTANT_ACTION_STATUSES = [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "REQUIRES_CONFIRMATION",
  "CLARIFICATION_REQUIRED",
  "UNAUTHORIZED",
  "UNSUPPORTED",
] as const;
export type AssistantActionStatus = (typeof ASSISTANT_ACTION_STATUSES)[number];

export const ASSISTANT_CONFIRMATION_STATUSES = ["NOT_REQUIRED", "PENDING", "CONFIRMED", "REJECTED"] as const;
export type AssistantConfirmationStatus = (typeof ASSISTANT_CONFIRMATION_STATUSES)[number];

export const ASSISTANT_ACTION_SAFE_FIELDS =
  "actionId userId conversationId message intent entities status confirmationStatus pendingInput result error idempotencyKey createdAt completedAt processingTimeMs";

export const ASSISTANT_ACTION_HISTORY_FIELDS = "actionId intent status message createdAt completedAt processingTimeMs";

export const ASSISTANT_ACTION_TIMEOUT_MS = 8000;
export const ASSISTANT_DEFAULT_MEETING_MINUTES = 60;
export const ASSISTANT_IDEMPOTENCY_MAX = 128;

export const REMINDER_TYPES = [
  "TASK",
  "MEETING",
  "PROJECT",
  "CRM",
  "FOLLOW_UP",
  "FINANCE",
  "CUSTOM",
  "SYSTEM",
] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_SOURCE_TYPES = [
  "TASK",
  "MEETING",
  "PROJECT",
  "LEAD",
  "CUSTOMER",
  "OPPORTUNITY",
  "FINANCE",
  "CUSTOM",
  "SYSTEM",
] as const;
export type ReminderSourceType = (typeof REMINDER_SOURCE_TYPES)[number];

export const REMINDER_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];

export const REMINDER_STATUSES = [
  "SCHEDULED",
  "PROCESSING",
  "TRIGGERED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ReminderFrequency = (typeof REMINDER_FREQUENCIES)[number];

export const REMINDER_WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
export type ReminderWeekday = (typeof REMINDER_WEEKDAYS)[number];

export const REMINDER_SAFE_FIELDS =
  "reminderId userId createdBy title description reminderType sourceType sourceId scheduledAt timezone priority status recurrence actionUrl metadata triggeredAt completedAt cancelledAt lastProcessedAt nextRunAt processingAttempts failureReason createdAt updatedAt";

export const NOTIFICATION_TYPES = [
  "TASK_ASSIGNED",
  "TASK_DUE",
  "TASK_OVERDUE",
  "MEETING_CREATED",
  "MEETING_UPDATED",
  "MEETING_CANCELLED",
  "MEETING_REMINDER",
  "PROJECT_UPDATED",
  "PROJECT_AT_RISK",
  "LEAD_ASSIGNED",
  "LEAD_FOLLOW_UP",
  "OPPORTUNITY_FOLLOW_UP",
  "FINANCE_ALERT",
  "BUDGET_ALERT",
  "REMINDER_DUE",
  "SYSTEM_ALERT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CATEGORIES = [
  "tasks",
  "meetings",
  "projects",
  "crm",
  "finance",
  "reminders",
  "system",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_DELIVERY_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export const NOTIFICATION_SAFE_FIELDS =
  "notificationId recipientId type category title message priority isRead readAt status sourceType sourceId actionUrl metadata reminderId occurrenceKey sentAt expiresAt deliveryAttempts lastAttemptAt failureReason isDeleted deletedAt createdAt updatedAt";

export const NOTIFICATION_CHANNELS = ["inApp", "email", "sms", "push", "whatsapp"] as const;
export type NotificationChannelName = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_PREFERENCE_SAFE_FIELDS = "userId channels categories quietHours createdAt updatedAt";

export const REMINDER_WORKER_INTERVAL_MS = 30_000;
export const REMINDER_CLAIM_STALE_MS = 5 * 60 * 1000;
export const REMINDER_MAX_ATTEMPTS = 3;
export const REMINDER_PROCESS_BATCH = 50;
export const NOTIFICATION_BULK_MAX = 500;
export const REMINDER_METADATA_MAX_BYTES = 2000;
export const DEFAULT_MEETING_REMINDER_MINUTES = 15;
export const NOTIFICATION_CHANNEL_MAX_RETRIES = 3;

export const WHATSAPP_EVENT_STATUSES = ["RECEIVED", "PROCESSING", "PROCESSED", "IGNORED", "FAILED"] as const;
export type WhatsAppEventStatus = (typeof WHATSAPP_EVENT_STATUSES)[number];

export const WHATSAPP_EVENT_TYPES = ["MESSAGE", "STATUS", "UNKNOWN"] as const;
export type WhatsAppEventType = (typeof WHATSAPP_EVENT_TYPES)[number];

export const WHATSAPP_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export type WhatsAppDirection = (typeof WHATSAPP_DIRECTIONS)[number];

export const WHATSAPP_MESSAGE_TYPES = [
  "TEXT",
  "IMAGE",
  "DOCUMENT",
  "AUDIO",
  "VIDEO",
  "LOCATION",
  "INTERACTIVE",
  "BUTTON",
  "UNKNOWN",
] as const;
export type WhatsAppMessageType = (typeof WHATSAPP_MESSAGE_TYPES)[number];

export const WHATSAPP_MESSAGE_STATUSES = ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"] as const;
export type WhatsAppMessageStatus = (typeof WHATSAPP_MESSAGE_STATUSES)[number];

export const WHATSAPP_CONVERSATION_STATUSES = ["ACTIVE", "BLOCKED", "CLOSED"] as const;
export type WhatsAppConversationStatus = (typeof WHATSAPP_CONVERSATION_STATUSES)[number];

export const WHATSAPP_IDENTITY_STATUSES = ["ACTIVE", "BLOCKED", "REVOKED"] as const;
export type WhatsAppIdentityStatus = (typeof WHATSAPP_IDENTITY_STATUSES)[number];

export const WHATSAPP_LINK_STATUSES = ["PENDING", "USED", "EXPIRED", "CANCELLED"] as const;
export type WhatsAppLinkStatus = (typeof WHATSAPP_LINK_STATUSES)[number];

export const WHATSAPP_EVENT_SAFE_FIELDS =
  "eventId provider providerMessageId eventType phoneNumber userId rawEventHash payloadType snapshot processingStatus error receivedAt processedAt lastProcessedAt processingAttempts createdAt updatedAt";

export const WHATSAPP_MESSAGE_SAFE_FIELDS =
  "messageId provider providerMessageId userId phoneNumber conversationId direction messageType text status idempotencyKey sentAt receivedAt failureReason createdAt updatedAt";

export const WHATSAPP_CONVERSATION_SAFE_FIELDS =
  "conversationId userId phoneNumber provider status lastMessageAt lastInboundAt lastOutboundAt pendingActionId metadata createdAt updatedAt";

export const WHATSAPP_IDENTITY_SAFE_FIELDS =
  "identityId userId phoneNumber provider verified status createdAt updatedAt";

export const WHATSAPP_LINK_SAFE_FIELDS = "_id userId codeHash expiresAt usedAt status createdAt updatedAt";

export const WHATSAPP_TEXT_LIMIT = 4096;
export const WHATSAPP_PROCESS_BATCH = 25;
export const WHATSAPP_CLAIM_STALE_MS = 5 * 60 * 1000;
export const WHATSAPP_INBOUND_RATE_MAX = 30;
export const WHATSAPP_INBOUND_RATE_WINDOW_MS = 15 * 60 * 1000;
export const WHATSAPP_WORKER_INTERVAL_MS = 2_000;

export const API_PREFIX = "/api/v1";

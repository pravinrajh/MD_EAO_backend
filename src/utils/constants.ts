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
  "taskId title description assignedTo createdBy projectId priority status dueDate reminderAt startedAt completedAt cancelledAt completionNote cancellationReason isDeleted deletedAt deletedBy createdAt updatedAt";

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
  "projectId name code description location projectType managerId members status progress budget actualExpense startDate expectedEndDate completedAt createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

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
  "meetingId title description meetingType organizerId participants projectId location startTime endTime timezone status notes cancellationReason cancelledAt completedAt createdBy isDeleted deletedAt deletedBy createdAt updatedAt";

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

export const PAGINATION = {
  defaultPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
} as const;

export const API_PREFIX = "/api/v1";

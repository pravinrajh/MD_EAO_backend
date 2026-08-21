import type { AssistantActionIntent, AssistantIntent } from "../../utils/constants";
import { actionExecutorService } from "./actionExecutor.service";
import { intentExecutorService } from "./intentExecutor.service";
import type { ActionActor, ResolvedActionEntities } from "./action.types";
import type { AssistantActor, ResolvedEntities } from "./types";

export const QUERY_TOOLS = {
  PENDING_TASKS: "get_pending_tasks",
  OVERDUE_TASKS: "get_overdue_tasks",
  TODAY_TASKS: "get_today_tasks",
  TASK_SUMMARY: "get_task_summary",
  PROJECT_STATUS: "get_project_status",
  PROJECT_HEALTH: "get_at_risk_projects",
  PROJECT_TASKS: "get_project_tasks",
  PROJECT_FINANCE: "get_project_finance",
  TODAY_MEETINGS: "get_today_meetings",
  UPCOMING_MEETINGS: "get_upcoming_meetings",
  MEETING_SUMMARY: "get_meeting_summary",
  SALES_SUMMARY: "get_sales_summary",
  SALES_PIPELINE: "get_sales_pipeline",
  LEAD_SUMMARY: "get_lead_summary",
  OPPORTUNITY_SUMMARY: "get_opportunity_summary",
  FINANCE_SUMMARY: "get_finance_summary",
  MONTHLY_FINANCE: "get_monthly_finance",
  WEEKLY_FINANCIAL_REQUIREMENT: "get_weekly_financial_requirement",
  BUDGET_SUMMARY: "get_budget_summary",
  ATTENTION_ITEMS: "get_attention_items",
  MORNING_REPORT: "get_morning_report",
  COMPANY_SUMMARY: "get_company_summary",
  MY_WORK_SUMMARY: "get_my_work_summary",
  EMPLOYEE_OVERDUE_RANKING: "get_overdue_by_employee",
  EMPLOYEE_WORKLOAD: "get_employee_workload",
  DELAYED_PROJECT_WORKLOAD: "get_project_task_workload",
  EMPLOYEE_DAILY_STATUS: "get_employee_daily_status",
  INVOICE_SUMMARY: "get_invoice_summary",
  VENDOR_LIST: "get_vendor_list",
  LAND_PARCEL_LIST: "get_land_parcel_list",
  MD_NOTES: "get_md_notes",
  DYNAMIC_QUERY: "get_dynamic_query",
} as const satisfies Partial<Record<AssistantIntent, string>>;

export const ACTION_TOOLS = {
  CREATE_TASK: "create_task",
  UPDATE_TASK: "update_task",
  ASSIGN_TASK: "assign_task",
  COMPLETE_TASK: "complete_task",
  CREATE_MEETING: "create_meeting",
  UPDATE_MEETING: "update_meeting",
  CANCEL_MEETING: "cancel_meeting",
  CREATE_PROJECT: "create_project",
  UPDATE_PROJECT: "update_project",
  CREATE_LEAD: "create_lead",
  UPDATE_LEAD: "update_lead",
  CREATE_OPPORTUNITY: "create_opportunity",
  UPDATE_OPPORTUNITY: "update_opportunity",
  CREATE_CUSTOMER: "create_customer",
  UPDATE_CUSTOMER: "update_customer",
  CREATE_REMINDER: "create_reminder",
  DELETE_TASK: "delete_task",
  CREATE_INVOICE: "create_invoice",
  UPDATE_INVOICE: "update_invoice",
  RECORD_INVOICE_PAYMENT: "record_invoice_payment",
  CREATE_VENDOR: "create_vendor",
  UPDATE_VENDOR: "update_vendor",
  CREATE_LAND_PARCEL: "create_land_parcel",
  UPDATE_LAND_PARCEL: "update_land_parcel",
  CREATE_MD_NOTE: "create_md_note",
  UPDATE_MD_NOTE: "update_md_note",
} as const satisfies Partial<Record<AssistantActionIntent, string>>;

export function queryToolName(intent: AssistantIntent): string | null {
  if (intent === "UNSUPPORTED" || intent === "SMALLTALK") return null;
  return QUERY_TOOLS[intent as keyof typeof QUERY_TOOLS] ?? null;
}

export function actionToolName(intent: AssistantActionIntent): string | null {
  if (intent === "UNSUPPORTED") return null;
  return ACTION_TOOLS[intent as keyof typeof ACTION_TOOLS] ?? null;
}

export const toolRegistry = {
  queryToolName,
  actionToolName,
  isQueryToolRegistered(intent: AssistantIntent) {
    return queryToolName(intent) !== null;
  },
  isActionToolRegistered(intent: AssistantActionIntent) {
    return actionToolName(intent) !== null;
  },
  executeQuery(intent: AssistantIntent, actor: AssistantActor, entities: ResolvedEntities) {
    if (!this.isQueryToolRegistered(intent)) {
      throw new Error("UNSUPPORTED_TOOL");
    }
    return intentExecutorService.execute(intent, actor, entities);
  },
  executeAction(intent: AssistantActionIntent, actor: ActionActor, entities: ResolvedActionEntities) {
    if (!this.isActionToolRegistered(intent)) {
      throw new Error("UNSUPPORTED_TOOL");
    }
    return actionExecutorService.execute(intent, actor, entities);
  },
};

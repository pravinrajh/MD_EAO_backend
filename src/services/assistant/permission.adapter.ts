import type { AssistantActionIntent, AssistantIntent } from "../../utils/constants";
import { assertCanCreateCustomer, assertCanCreateOpportunity } from "../crm.policy";
import { assertCanViewCompanyFinance } from "../finance.policy";
import { assertCanCreate as assertCanCreateMeeting } from "../meeting.policy";
import { assertCanCreate as assertCanCreateProject } from "../project.policy";
import { assertCanAssign, assertCanCreate as assertCanCreateTask, assertCanDelete as assertCanDeleteTask } from "../task.policy";
import { assertCanManageOffice } from "../office.policy";
import type { ActionActor } from "./action.types";
import type { AssistantActor } from "./types";

const FINANCE_QUERY_INTENTS = new Set<AssistantIntent>([
  "FINANCE_SUMMARY",
  "MONTHLY_FINANCE",
  "WEEKLY_FINANCIAL_REQUIREMENT",
  "BUDGET_SUMMARY",
]);

export const aiPermissionAdapter = {
  assertQuery(intent: AssistantIntent, actor: AssistantActor) {
    if (FINANCE_QUERY_INTENTS.has(intent)) {
      assertCanViewCompanyFinance(actor);
    }
  },

  assertAction(intent: AssistantActionIntent, actor: ActionActor, options?: { hasAssignee?: boolean }) {
    switch (intent) {
      case "CREATE_TASK":
        assertCanCreateTask(actor);
        if (options?.hasAssignee) assertCanAssign(actor);
        return;
      case "ASSIGN_TASK":
        assertCanAssign(actor);
        return;
      case "CREATE_PROJECT":
        assertCanCreateProject(actor);
        return;
      case "CREATE_MEETING":
        assertCanCreateMeeting(actor);
        return;
      case "CREATE_CUSTOMER":
        assertCanCreateCustomer(actor);
        return;
      case "CREATE_OPPORTUNITY":
        assertCanCreateOpportunity(actor);
        return;
      case "DELETE_TASK":
        assertCanDeleteTask(actor);
        return;
      case "CREATE_INVOICE":
      case "UPDATE_INVOICE":
      case "RECORD_INVOICE_PAYMENT":
      case "CREATE_VENDOR":
      case "UPDATE_VENDOR":
      case "CREATE_LAND_PARCEL":
      case "UPDATE_LAND_PARCEL":
      case "CREATE_MD_NOTE":
      case "UPDATE_MD_NOTE":
        assertCanManageOffice(actor);
        return;
      default:
        return;
    }
  },
};

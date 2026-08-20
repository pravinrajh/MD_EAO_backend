import type { ClientSession } from "mongoose";
import { Counter } from "../models/Counter";

export async function nextSequence(name: string, session?: ClientSession | null): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, ...(session ? { session } : {}) },
  );
  if (!doc) {
    throw new Error(`Failed to allocate sequence for ${name}`);
  }
  return doc.seq;
}

function padded(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

export async function nextEmployeeCode(session?: ClientSession | null): Promise<string> {
  return padded("EMP", await nextSequence("employeeCode", session));
}

export async function nextTaskId(session?: ClientSession | null): Promise<string> {
  return padded("TASK", await nextSequence("taskId", session));
}

export async function nextProjectId(session?: ClientSession | null): Promise<string> {
  return padded("PROJ", await nextSequence("projectId", session));
}

export async function nextMeetingId(session?: ClientSession | null): Promise<string> {
  return padded("MTG", await nextSequence("meetingId", session));
}

export async function nextLeadId(session?: ClientSession | null): Promise<string> {
  return padded("LEAD", await nextSequence("leadId", session));
}

export async function nextCustomerId(session?: ClientSession | null): Promise<string> {
  return padded("CUST", await nextSequence("customerId", session));
}

export async function nextOpportunityId(session?: ClientSession | null): Promise<string> {
  return padded("OPP", await nextSequence("opportunityId", session));
}

export async function nextActivityId(session?: ClientSession | null): Promise<string> {
  return padded("ACT", await nextSequence("activityId", session));
}

export async function nextAccountId(session?: ClientSession | null): Promise<string> {
  return padded("ACC", await nextSequence("accountId", session));
}

export async function nextFinanceCategoryId(session?: ClientSession | null): Promise<string> {
  return padded("CAT", await nextSequence("financeCategoryId", session));
}

export async function nextTransactionId(session?: ClientSession | null): Promise<string> {
  return padded("TXN", await nextSequence("transactionId", session));
}

export async function nextBudgetId(session?: ClientSession | null): Promise<string> {
  return padded("BUD", await nextSequence("budgetId", session));
}

export async function nextQueryId(session?: ClientSession | null): Promise<string> {
  return padded("QRY", await nextSequence("queryId", session));
}

export async function nextAssistantActionId(session?: ClientSession | null): Promise<string> {
  return padded("ACT", await nextSequence("assistantActionId", session));
}

export async function nextReminderId(session?: ClientSession | null): Promise<string> {
  return padded("REM", await nextSequence("reminderId", session));
}

export async function nextNotificationId(session?: ClientSession | null): Promise<string> {
  return padded("NOTIF", await nextSequence("notificationId", session));
}

export async function nextWhatsAppEventId(session?: ClientSession | null): Promise<string> {
  return padded("WAEVT", await nextSequence("whatsappEventId", session));
}

export async function nextWhatsAppMessageId(session?: ClientSession | null): Promise<string> {
  return padded("WAMSG", await nextSequence("whatsappMessageId", session));
}

export async function nextWhatsAppConversationId(session?: ClientSession | null): Promise<string> {
  return padded("WACONV", await nextSequence("whatsappConversationId", session));
}

export async function nextWhatsAppIdentityId(session?: ClientSession | null): Promise<string> {
  return padded("WAID", await nextSequence("whatsappIdentityId", session));
}

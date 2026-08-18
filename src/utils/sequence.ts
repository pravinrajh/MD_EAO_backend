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

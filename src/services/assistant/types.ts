import type { AssistantIntent, AssistantQueryStatus, Role } from "../../utils/constants";

export type AssistantActor = {
  id: string;
  role: Role;
};

export type AssistantSource = {
  type: string;
  count?: number;
};

export type ExtractedEntities = {
  projectName?: string;
  projectId?: string;
  employeeName?: string;
  customerName?: string;
  leadName?: string;
  opportunityName?: string;
  dateRange?: "TODAY" | "CURRENT_WEEK" | "CURRENT_MONTH";
  priority?: string;
  status?: string;
  minPending?: number;
};

export type ResolvedEntities = ExtractedEntities & {
  projectId?: string;
  projectIds?: string[];
  employeeId?: string;
  employeeIds?: string[];
  customerId?: string;
  leadId?: string;
  opportunityId?: string;
  clarification?: {
    field: "project" | "employee" | "customer" | "lead" | "opportunity";
    question: string;
    options: Array<{ id: string; name: string }>;
  };
  notFound?: {
    field: string;
    name: string;
  };
};

export type DetectedIntent = {
  intent: AssistantIntent;
  confidence: number;
  matchType: "pattern" | "keyword" | "none";
};

export type ExecutorPayload = {
  intent: AssistantIntent;
  data: Record<string, unknown>;
  sources: AssistantSource[];
};

export interface AssistantQueryEngine {
  detectIntent(normalized: string): DetectedIntent;
}

export type FormattedAssistantAnswer = {
  answer: string;
  data: Record<string, unknown>;
  sources: AssistantSource[];
};

export type AssistantQueryResult = {
  queryId: string;
  intent: AssistantIntent;
  answer: string;
  data: Record<string, unknown>;
  sources: AssistantSource[];
  confidence: number;
  toolsUsed?: string[];
};

export type StoredQueryStatus = AssistantQueryStatus;

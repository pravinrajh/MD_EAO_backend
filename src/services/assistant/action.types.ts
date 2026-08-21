import type {
  AssistantActionIntent,
  AssistantActionStatus,
  AssistantConfirmationStatus,
  Role,
} from "../../utils/constants";

export type ActionActor = {
  id: string;
  role: Role;
};

export type ExtractedActionEntities = {
  title?: string;
  description?: string;
  taskTitle?: string;
  meetingTitle?: string;
  projectName?: string;
  employeeName?: string;
  customerName?: string;
  leadName?: string;
  opportunityName?: string;
  datePhrase?: string;
  timePhrase?: string;
  endTimePhrase?: string;
  priority?: string;
  status?: string;
  progress?: number;
  budget?: number;
  location?: string;
  stage?: string;
  taskId?: string;
  invoiceNumber?: string;
  vendorName?: string;
  parcelName?: string;
  noteBody?: string;
  amount?: number;
  postToFinance?: boolean;
};

export type ResolvedActionEntities = ExtractedActionEntities & {
  taskId?: string;
  meetingId?: string;
  projectId?: string;
  employeeId?: string;
  assigneeId?: string;
  customerId?: string;
  leadId?: string;
  opportunityId?: string;
  invoiceId?: string;
  vendorId?: string;
  parcelId?: string;
  noteId?: string;
  accountId?: string;
  categoryId?: string;
  participantIds?: string[];
  dueDate?: Date;
  startTime?: Date;
  endTime?: Date;
  remindAt?: Date;
  postToFinance?: boolean;
  clarification?: {
    field: string;
    question: string;
    options?: Array<{ id: string; name: string }>;
  };
  notFound?: { field: string; name: string };
};

export type DetectedActionIntent = {
  intent: AssistantActionIntent;
  confidence: number;
};

export interface AssistantActionEngine {
  detectIntent(normalized: string): DetectedActionIntent;
}

export type ActionDto = Record<string, unknown>;

export type ActionExecution = {
  dto: ActionDto;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
};

export type PublicActionResult = {
  actionId: string;
  intent: AssistantActionIntent;
  status: AssistantActionStatus;
  message: string;
  result: Record<string, unknown>;
  requiresConfirmation: boolean;
};

export type StoredActionStatus = AssistantActionStatus;
export type StoredConfirmationStatus = AssistantConfirmationStatus;

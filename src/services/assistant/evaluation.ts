export const AI_FAILURE_TYPES = [
  "INTENT_FAILURE",
  "ENTITY_FAILURE",
  "QUERY_FAILURE",
  "DATA_FAILURE",
  "PERMISSION_FAILURE",
  "CONTEXT_FAILURE",
  "SPELLING_FAILURE",
  "LANGUAGE_FAILURE",
  "HALLUCINATION",
  "ACTION_FAILURE",
  "RESPONSE_FAILURE",
  "TIME_FAILURE",
  "UNKNOWN",
] as const;

export type AiFailureType = (typeof AI_FAILURE_TYPES)[number];

export type EvaluationStatus = "PASS" | "FAIL" | "PARTIAL";

export type QueryEvaluation = {
  originalQuestion: string;
  normalizedQuestion: string;
  userRole: string;
  intent: string;
  serviceCalled: string | null;
  status: EvaluationStatus;
  failureType?: AiFailureType;
  failureReason?: string;
  requiresHumanReview: boolean;
};

export function classifyQueryEvaluation(input: {
  originalQuestion: string;
  normalizedQuestion: string;
  userRole: string;
  intent: string;
  serviceCalled: string | null;
  dataStatus?: string;
  queryStatus: string;
  missingDomain?: string;
  notFoundField?: string;
  clarification?: boolean;
  timeout?: boolean;
  forbidden?: boolean;
}): QueryEvaluation {
  const base = {
    originalQuestion: input.originalQuestion.slice(0, 2000),
    normalizedQuestion: input.normalizedQuestion.slice(0, 2000),
    userRole: input.userRole,
    intent: input.intent,
    serviceCalled: input.serviceCalled,
  };

  if (input.timeout) {
    return {
      ...base,
      status: "FAIL",
      failureType: "TIME_FAILURE",
      failureReason: "Query exceeded the assistant timeout",
      requiresHumanReview: true,
    };
  }
  if (input.forbidden) {
    return {
      ...base,
      status: "FAIL",
      failureType: "PERMISSION_FAILURE",
      failureReason: "Requester is not allowed to view that information",
      requiresHumanReview: false,
    };
  }
  if (input.clarification) {
    return {
      ...base,
      status: "PARTIAL",
      failureType: "ENTITY_FAILURE",
      failureReason: "Multiple matches; clarification required",
      requiresHumanReview: false,
    };
  }
  if (input.notFoundField) {
    return {
      ...base,
      status: "FAIL",
      failureType: "ENTITY_FAILURE",
      failureReason: `No matching ${input.notFoundField} in live records`,
      requiresHumanReview: false,
    };
  }
  if (input.missingDomain) {
    return {
      ...base,
      status: "FAIL",
      failureType: "DATA_FAILURE",
      failureReason: `${input.missingDomain} is not connected to the system`,
      requiresHumanReview: false,
    };
  }
  if (input.intent === "UNSUPPORTED" || input.queryStatus === "UNSUPPORTED") {
    return {
      ...base,
      status: "FAIL",
      failureType: "INTENT_FAILURE",
      failureReason: "No supported business intent for this question",
      requiresHumanReview: true,
    };
  }
  if (input.queryStatus === "FAILED") {
    return {
      ...base,
      status: "FAIL",
      failureType: "QUERY_FAILURE",
      failureReason: "Backend query execution failed",
      requiresHumanReview: true,
    };
  }
  return {
    ...base,
    status: "PASS",
    requiresHumanReview: false,
  };
}

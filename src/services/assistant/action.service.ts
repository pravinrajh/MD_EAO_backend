import { logger } from "../../config/logger";
import {
  ASSISTANT_ACTION_TIMEOUT_MS,
  type AssistantActionIntent,
  type AssistantActionStatus,
  type AssistantConfirmationStatus,
} from "../../utils/constants";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TimeoutError,
  ValidationError,
} from "../../utils/errors";
import { isDuplicateKey } from "../../utils/mongo";
import { buildPaginationMeta, parsePagination } from "../../utils/pagination";
import { nextAssistantActionId } from "../../utils/sequence";
import { assistantActionRepository } from "../../repositories/assistantAction.repository";
import { canUpdateBudget } from "../project.policy";
import { meetingService } from "../meeting.service";
import { actionExecutorService } from "./actionExecutor.service";
import { detectActionIntent, extractActionEntities, resolveActionEntities } from "./actionIntentRouter.service";
import { normalizeQuery } from "./intentRouter.service";
import type { ActionActor, PublicActionResult, ResolvedActionEntities } from "./action.types";

const ID_RETRIES = 3;
const DATE_KEYS = ["dueDate", "startTime", "endTime", "remindAt"] as const;
const UNSUPPORTED_MESSAGE =
  "I can't perform that action. I can create and update tasks, meetings, projects, and CRM records, but not finance or bulk deletes.";
const UNAUTHORIZED_MESSAGE = "You don't have permission to perform that action.";

function scrub(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 2000);
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(value);
  if (json.length <= 8000) return value;
  return { summary: true };
}

function snapshot(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(compact(value))) as Record<string, unknown>;
}

function reviveEntities(raw: Record<string, unknown> | null | undefined): ResolvedActionEntities {
  const entities = { ...(raw ?? {}) } as ResolvedActionEntities;
  for (const key of DATE_KEYS) {
    const value = entities[key];
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) (entities as Record<string, unknown>)[key] = date;
    }
  }
  return entities;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("That action took too long.")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseTaggedError(error: unknown): { kind: "CLARIFICATION" | "UNAUTHORIZED"; message: string } | null {
  if (!(error instanceof Error)) return null;
  if (error.message.startsWith("CLARIFICATION:")) {
    return { kind: "CLARIFICATION", message: error.message.slice("CLARIFICATION:".length) };
  }
  if (error.message.startsWith("UNAUTHORIZED:")) {
    return { kind: "UNAUTHORIZED", message: error.message.slice("UNAUTHORIZED:".length) };
  }
  return null;
}

function publicFromRecord(record: Record<string, unknown>): PublicActionResult {
  const status = String(record.status) as AssistantActionStatus;
  const stored = record.result && typeof record.result === "object" ? (record.result as Record<string, unknown>) : {};
  const nested = stored.result && typeof stored.result === "object" ? (stored.result as Record<string, unknown>) : {};
  const hasEnvelope = typeof stored.message === "string";
  return {
    actionId: String(record.actionId),
    intent: record.intent as AssistantActionIntent,
    status,
    message: String(stored.message ?? record.error ?? statusMessage(status)),
    result: hasEnvelope ? nested : stored,
    requiresConfirmation: status === "REQUIRES_CONFIRMATION",
  };
}

function statusMessage(status: AssistantActionStatus): string {
  if (status === "COMPLETED") return "Action completed successfully.";
  if (status === "REQUIRES_CONFIRMATION") return "This action needs your confirmation.";
  if (status === "CLARIFICATION_REQUIRED") return "I need a bit more information.";
  if (status === "UNAUTHORIZED") return UNAUTHORIZED_MESSAGE;
  if (status === "UNSUPPORTED") return UNSUPPORTED_MESSAGE;
  return "Action failed.";
}

function needFlags(intent: AssistantActionIntent) {
  return {
    intent,
    needTask: intent === "UPDATE_TASK" || intent === "ASSIGN_TASK" || intent === "COMPLETE_TASK",
    needMeeting: intent === "UPDATE_MEETING" || intent === "CANCEL_MEETING",
    needProject: intent === "UPDATE_PROJECT",
    needEmployee: intent === "ASSIGN_TASK" || intent === "CREATE_MEETING",
  };
}

function toPublicResult(
  actionId: string,
  intent: AssistantActionIntent,
  status: AssistantActionStatus,
  message: string,
  result: Record<string, unknown>,
): PublicActionResult {
  return {
    actionId,
    intent,
    status,
    message,
    result,
    requiresConfirmation: status === "REQUIRES_CONFIRMATION",
  };
}

function storedResult(message: string, result: Record<string, unknown>) {
  return { message, result };
}

async function confirmationPreview(intent: AssistantActionIntent, entities: ResolvedActionEntities, actor: ActionActor) {
  const base = actionExecutorService.confirmationFor(intent, entities);
  if (!base.required) return base;
  if (intent === "CANCEL_MEETING" && entities.meetingId) {
    try {
      const meeting = (await meetingService.getById(entities.meetingId, actor)) as Record<string, unknown>;
      const start = meeting.startTime ? new Date(String(meeting.startTime)) : null;
      const when = start
        ? new Intl.DateTimeFormat("en-IN", {
            timeZone: String(meeting.timezone ?? "Asia/Kolkata"),
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            weekday: "long",
          }).format(start)
        : "the scheduled time";
      const count = Array.isArray(meeting.participants) ? meeting.participants.length : 0;
      const title = String(meeting.title ?? entities.meetingTitle ?? "The meeting");
      return {
        required: true,
        message: `The ${title} is scheduled for ${when} with ${count} participant${count === 1 ? "" : "s"}. Do you want me to cancel it?`,
      };
    } catch {
      return base;
    }
  }
  return base;
}

async function insertPending(record: {
  actionId: string;
  userId: string;
  conversationId?: string;
  message: string;
  intent: AssistantActionIntent;
  entities: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<{ actionId: string; duplicate?: Record<string, unknown> }> {
  let actionId = record.actionId;
  for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
    try {
      await assistantActionRepository.create({
        actionId,
        userId: record.userId,
        conversationId: record.conversationId ?? null,
        message: scrub(record.message),
        intent: record.intent,
        entities: compact(record.entities),
        status: "PENDING",
        confirmationStatus: "NOT_REQUIRED",
        pendingInput: null,
        result: {},
        error: "",
        idempotencyKey: record.idempotencyKey ?? "",
        processingTimeMs: 0,
        completedAt: null,
      });
      return { actionId };
    } catch (error) {
      if (isDuplicateKey(error, "idempotencyKey") && record.idempotencyKey) {
        const existing = await assistantActionRepository.findByIdempotencyKey(record.userId, record.idempotencyKey);
        if (existing) return { actionId, duplicate: existing as Record<string, unknown> };
      }
      if (isDuplicateKey(error, "actionId") && attempt < ID_RETRIES - 1) {
        actionId = await nextAssistantActionId();
        continue;
      }
      throw error;
    }
  }
  return { actionId };
}

async function finalize(
  actionId: string,
  patch: {
    status: AssistantActionStatus;
    confirmationStatus?: AssistantConfirmationStatus;
    pendingInput?: Record<string, unknown> | null;
    result?: Record<string, unknown>;
    error?: string;
    entities?: Record<string, unknown>;
    processingTimeMs: number;
  },
) {
  await assistantActionRepository.updateByActionId(actionId, {
    status: patch.status,
    confirmationStatus: patch.confirmationStatus,
    pendingInput: patch.pendingInput,
    result: patch.result,
    error: patch.error,
    completedAt: patch.status === "REQUIRES_CONFIRMATION" ? null : new Date(),
    processingTimeMs: patch.processingTimeMs,
  });
}

function mapExecuteError(error: unknown): {
  status: AssistantActionStatus;
  message: string;
  appError?: AppError;
} {
  const tagged = parseTaggedError(error);
  if (tagged?.kind === "CLARIFICATION") {
    return { status: "CLARIFICATION_REQUIRED", message: tagged.message };
  }
  if (tagged?.kind === "UNAUTHORIZED" || error instanceof ForbiddenError) {
    return { status: "UNAUTHORIZED", message: UNAUTHORIZED_MESSAGE };
  }
  if (error instanceof NotFoundError) {
    return { status: "CLARIFICATION_REQUIRED", message: "I couldn't find that record." };
  }
  if (error instanceof ConflictError) {
    return { status: "CLARIFICATION_REQUIRED", message: error.message };
  }
  if (error instanceof ValidationError || error instanceof BadRequestError) {
    return { status: "CLARIFICATION_REQUIRED", message: error.message };
  }
  if (error instanceof TimeoutError) {
    return { status: "FAILED", message: error.message, appError: error };
  }
  return { status: "FAILED", message: "Action failed." };
}

export const assistantActionService = {
  detectActionIntent,
  extractEntities: extractActionEntities,
  resolveEntities: resolveActionEntities,

  async getHistory(actor: ActionActor, query: Record<string, unknown>) {
    const { page, limit, skip } = parsePagination(query);
    const conversationId = typeof query.conversationId === "string" ? query.conversationId : undefined;
    const result = await assistantActionRepository.list({ userId: actor.id, conversationId, skip, limit });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  async processAction(input: {
    message: string;
    conversationId?: string;
    actor: ActionActor;
    idempotencyKey?: string;
  }): Promise<PublicActionResult> {
    const started = Date.now();
    if (input.idempotencyKey) {
      const existing = await assistantActionRepository.findByIdempotencyKey(input.actor.id, input.idempotencyKey);
      if (existing && existing.status !== "PENDING") {
        return publicFromRecord(existing as Record<string, unknown>);
      }
    }

    const { original, normalized } = normalizeQuery(input.message);
    const detected = this.detectActionIntent(normalized);
    const extracted = this.extractEntities(original, normalized);
    const reserved = await insertPending({
      actionId: await nextAssistantActionId(),
      userId: input.actor.id,
      conversationId: input.conversationId,
      message: original,
      intent: detected.intent,
      entities: extracted,
      idempotencyKey: input.idempotencyKey,
    });
    if (reserved.duplicate) return publicFromRecord(reserved.duplicate);
    const actionId = reserved.actionId;

    const finish = async (
      status: AssistantActionStatus,
      message: string,
      result: Record<string, unknown>,
      extras: {
        confirmationStatus?: AssistantConfirmationStatus;
        pendingInput?: Record<string, unknown> | null;
        error?: string;
      } = {},
    ): Promise<PublicActionResult> => {
      const processingTimeMs = Date.now() - started;
      await finalize(actionId, {
        status,
        confirmationStatus: extras.confirmationStatus ?? "NOT_REQUIRED",
        pendingInput: extras.pendingInput ?? null,
        result: storedResult(message, result),
        error: extras.error ?? "",
        processingTimeMs,
      });
      logger.info(
        { actionId, userId: input.actor.id, intent: detected.intent, status, processingTimeMs },
        "Assistant action processed",
      );
      return toPublicResult(actionId, detected.intent, status, message, result);
    };

    if (detected.intent === "UNSUPPORTED") {
      return finish("UNSUPPORTED", UNSUPPORTED_MESSAGE, {});
    }

    try {
      return await withTimeout(
        (async () => {
          if (detected.intent === "UPDATE_PROJECT" && /\bbudget\b/.test(normalized) && !canUpdateBudget(input.actor.role)) {
            return finish("UNAUTHORIZED", UNAUTHORIZED_MESSAGE, { status: "UNAUTHORIZED" });
          }

          const resolved = await this.resolveEntities(extracted, input.actor, needFlags(detected.intent));
          if (resolved.clarification) {
            return finish("CLARIFICATION_REQUIRED", resolved.clarification.question, {
              field: resolved.clarification.field,
              options: resolved.clarification.options ?? [],
            });
          }
          if (resolved.notFound) {
            return finish(
              "CLARIFICATION_REQUIRED",
              `I couldn't find a ${resolved.notFound.field} matching ${resolved.notFound.name}.`,
              { field: resolved.notFound.field },
            );
          }

          const missing = this.validateAction(detected.intent, resolved);
          if (missing) return finish("CLARIFICATION_REQUIRED", missing, {});

          const confirm = this.requiresConfirmation(detected.intent, resolved)
            ? await confirmationPreview(detected.intent, resolved, input.actor)
            : { required: false as const };
          if (confirm.required) {
            return finish("REQUIRES_CONFIRMATION", confirm.message ?? "Do you want me to continue?", {}, {
              confirmationStatus: "PENDING",
              pendingInput: snapshot(resolved as Record<string, unknown>),
            });
          }

          const executed = await this.executeAction(detected.intent, input.actor, resolved);
          return finish("COMPLETED", executed.message, executed.result);
        })(),
        ASSISTANT_ACTION_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        await finalize(actionId, {
          status: "FAILED",
          result: storedResult(error.message, {}),
          error: error.message,
          processingTimeMs: Date.now() - started,
        });
        throw error;
      }
      const mapped = mapExecuteError(error);
      return finish(mapped.status, mapped.message, { status: mapped.status }, {
        error: error instanceof Error ? error.message.slice(0, 1000) : "Action failed",
      });
    }
  },

  validateAction(intent: AssistantActionIntent, entities: ResolvedActionEntities): string | null {
    if ((intent === "UPDATE_TASK" || intent === "ASSIGN_TASK" || intent === "COMPLETE_TASK") && !entities.taskId) {
      if (intent === "ASSIGN_TASK") {
        return `Which task should I assign to ${entities.employeeName ?? "them"}?`;
      }
      return "Which task do you mean?";
    }
    if (intent === "ASSIGN_TASK" && !entities.assigneeId) {
      return "Who should I assign the task to?";
    }
    if (intent === "CREATE_TASK" && !entities.title) {
      return "What should I title the task?";
    }
    if ((intent === "UPDATE_MEETING" || intent === "CANCEL_MEETING") && !entities.meetingId) {
      return "Which meeting do you mean?";
    }
    if (intent === "CREATE_MEETING" && !entities.startTime) {
      return "What time should I schedule the meeting?";
    }
    if (intent === "CREATE_MEETING" && entities.startTime && entities.endTime && entities.endTime <= entities.startTime) {
      return "The meeting end time must be after the start time.";
    }
    if (intent === "UPDATE_PROJECT" && !entities.projectId) {
      return "Which project should I update?";
    }
    if (intent === "CREATE_PROJECT" && !(entities.projectName || entities.title)) {
      return "What should I name the project?";
    }
    if (intent === "UPDATE_LEAD" && !entities.leadId) {
      return "Which lead should I update?";
    }
    if (intent === "UPDATE_OPPORTUNITY" && !entities.opportunityId) {
      return "Which opportunity should I update?";
    }
    if (intent === "UPDATE_CUSTOMER" && !entities.customerId) {
      return "Which customer should I update?";
    }
    if (intent === "CREATE_OPPORTUNITY" && !entities.customerId) {
      return "Which customer is this opportunity for?";
    }
    if (intent === "CREATE_REMINDER" && !entities.remindAt && !entities.dueDate) {
      return "When should I remind you?";
    }
    return null;
  },

  checkAuthorization(_intent: AssistantActionIntent, _actor: ActionActor): boolean {
    return true;
  },

  requiresConfirmation(intent: AssistantActionIntent, entities: ResolvedActionEntities) {
    return actionExecutorService.confirmationFor(intent, entities).required;
  },

  executeAction(intent: AssistantActionIntent, actor: ActionActor, entities: ResolvedActionEntities) {
    return actionExecutorService.execute(intent, actor, entities);
  },

  async confirmAction(input: {
    actionId: string;
    actor: ActionActor;
    confirmed: boolean;
    conversationId?: string;
  }): Promise<PublicActionResult> {
    const existing = await assistantActionRepository.findByActionId(input.actionId, input.actor.id);
    if (!existing) throw new NotFoundError("Action not found");

    const record = existing as Record<string, unknown>;
    if (input.conversationId && String(record.conversationId ?? "") !== input.conversationId) {
      throw new ForbiddenError("Action does not belong to this conversation");
    }
    if (record.status === "COMPLETED" || record.confirmationStatus === "REJECTED" || record.status === "FAILED") {
      return publicFromRecord(record);
    }
    if (record.status !== "REQUIRES_CONFIRMATION") {
      throw new ValidationError("This action is not waiting for confirmation");
    }

    if (!input.confirmed) {
      await assistantActionRepository.updateByActionId(input.actionId, {
        status: "FAILED",
        confirmationStatus: "REJECTED",
        completedAt: new Date(),
        pendingInput: null,
        result: storedResult("Action was not confirmed.", {}),
      });
      return toPublicResult(input.actionId, record.intent as AssistantActionIntent, "FAILED", "Action was not confirmed.", {});
    }

    const claimed = await assistantActionRepository.claimConfirmation(input.actionId, input.actor.id);
    if (!claimed) {
      const latest = await assistantActionRepository.findByActionId(input.actionId, input.actor.id);
      if (latest) return publicFromRecord(latest as Record<string, unknown>);
      throw new NotFoundError("Action not found");
    }

    const claimedRecord = assistantActionRepository.toPublic(claimed);
    const intent = claimedRecord.intent as AssistantActionIntent;
    const pending = reviveEntities(claimedRecord.pendingInput as Record<string, unknown> | null);
    try {
      const executed = await this.executeAction(intent, input.actor, pending);
      await assistantActionRepository.updateByActionId(input.actionId, {
        status: "COMPLETED",
        confirmationStatus: "CONFIRMED",
        pendingInput: null,
        completedAt: new Date(),
        result: storedResult(executed.message, executed.result),
      });
      return toPublicResult(input.actionId, intent, "COMPLETED", executed.message, executed.result);
    } catch (error) {
      const mapped = mapExecuteError(error);
      await assistantActionRepository.updateByActionId(input.actionId, {
        status: mapped.status,
        confirmationStatus: "CONFIRMED",
        completedAt: new Date(),
        error: error instanceof Error ? error.message.slice(0, 1000) : "failed",
        result: storedResult(mapped.message, {}),
      });
      if (error instanceof TimeoutError) throw error;
      return toPublicResult(input.actionId, intent, mapped.status, mapped.message, {});
    }
  },
};

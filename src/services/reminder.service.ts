import { env } from "../config/env";
import { logger } from "../config/logger";
import { reminderRepository } from "../repositories/reminder.repository";
import {
  DEFAULT_MEETING_REMINDER_MINUTES,
  REMINDER_MAX_ATTEMPTS,
  REMINDER_METADATA_MAX_BYTES,
  REMINDER_PROCESS_BATCH,
  type NotificationType,
  type ReminderPriority,
  type ReminderSourceType,
  type ReminderStatus,
  type ReminderType,
  type Role,
} from "../utils/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextReminderId } from "../utils/sequence";
import { getZonedDayRange, isValidTimeZone } from "../utils/timezone";
import { isPrivileged } from "./task.policy";
import { notificationService } from "./notification.service";
import { computeNextRunAt, normalizeRecurrence, type RecurrenceInput } from "./reminder/recurrence";

export type ReminderActor = { id: string; role: Role };

export type CreateReminderInput = {
  title: string;
  description?: string;
  message?: string;
  reminderType?: ReminderType;
  sourceType?: ReminderSourceType;
  sourceId?: string | null;
  scheduledAt?: Date;
  remindAt?: Date;
  timezone?: string;
  priority?: ReminderPriority;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  recurrence?: RecurrenceInput;
  userId?: string;
};

const ID_RETRIES = 3;
const SAFE_ACTION_URL = /^\/(?:tasks|projects|meetings|leads|customers|opportunities|reminders|dashboard|employees|finance|notifications)(?:\/[A-Za-z0-9._-]+)*\/?$/;

const UPDATE_FIELDS = ["title", "description", "scheduledAt", "timezone", "priority", "actionUrl"] as const;

function asPublic(value: unknown) {
  return reminderRepository.toPublic(value as Record<string, unknown>);
}

function ownerScope(actor: ReminderActor): string {
  return actor.id;
}

function assertOwner(actor: ReminderActor, userId: string) {
  if (actor.id !== userId) throw new NotFoundError("Reminder not found");
}

export function assertSafeActionUrl(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    throw new ValidationError("Unsafe action URL", [{ field: "actionUrl" }]);
  }
  if (!SAFE_ACTION_URL.test(trimmed)) {
    throw new ValidationError("actionUrl must be a safe internal path", [{ field: "actionUrl" }]);
  }
  return trimmed;
}

export function sanitizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  const keys = Object.keys(value);
  if (keys.some((key) => key.startsWith("$"))) {
    throw new ValidationError("MongoDB operators are not allowed in metadata");
  }
  const compact: Record<string, unknown> = {};
  for (const key of keys.slice(0, 20)) {
    const item = value[key];
    if (item === null || ["string", "number", "boolean"].includes(typeof item)) {
      compact[key] = typeof item === "string" ? item.slice(0, 200) : item;
    }
  }
  if (JSON.stringify(compact).length > REMINDER_METADATA_MAX_BYTES) {
    throw new ValidationError("metadata is too large", [{ field: "metadata" }]);
  }
  return compact;
}

function reminderToNotificationType(reminderType: ReminderType, sourceType?: string): NotificationType {
  if (reminderType === "TASK") return "TASK_DUE";
  if (reminderType === "MEETING") return "MEETING_REMINDER";
  if (reminderType === "PROJECT") return "PROJECT_UPDATED";
  if (reminderType === "CRM" || reminderType === "FOLLOW_UP") {
    return sourceType === "LEAD" ? "LEAD_FOLLOW_UP" : "OPPORTUNITY_FOLLOW_UP";
  }
  if (reminderType === "FINANCE") return "FINANCE_ALERT";
  if (reminderType === "SYSTEM") return "SYSTEM_ALERT";
  return "REMINDER_DUE";
}

async function persistReminder(data: Record<string, unknown>) {
  for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
    try {
      const created = await reminderRepository.create({
        ...data,
        reminderId: await nextReminderId(),
      });
      return asPublic(created);
    } catch (error) {
      if (isDuplicateKey(error, "sourceId") || isDuplicateKey(error, "metadata.offsetMinutes")) {
        const sourceType = String(data.sourceType ?? "");
        const sourceId = String(data.sourceId ?? "");
        const offset = Number((data.metadata as Record<string, unknown> | undefined)?.offsetMinutes);
        const existing = await reminderRepository.findSourceReminder(sourceType, sourceId, offset);
        if (existing) return asPublic(existing);
      }
      if (isDuplicateKey(error, "reminderId") && attempt < ID_RETRIES - 1) continue;
      throw error;
    }
  }
  throw new ConflictError("Unable to generate a unique reminder ID");
}

export const reminderService = {
  async createReminder(input: CreateReminderInput, actor: ReminderActor) {
    const scheduledAt = input.scheduledAt ?? input.remindAt;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new ValidationError("scheduledAt is required");
    }
    const timezone = input.timezone || env.APP_TIMEZONE;
    if (!isValidTimeZone(timezone)) {
      throw new ValidationError("Invalid timezone", [{ field: "timezone" }]);
    }
    const ownerId = input.userId && input.userId !== actor.id ? input.userId : actor.id;
    if (ownerId !== actor.id && !isPrivileged(actor.role)) {
      throw new ForbiddenError("You cannot create a reminder for another user");
    }
    if (input.sourceId) assertObjectId(input.sourceId, "sourceId");

    const recurrence = normalizeRecurrence(input.recurrence);
    const nextRunAt = scheduledAt;
    const created = await persistReminder({
      userId: ownerId,
      createdBy: actor.id,
      title: input.title.slice(0, 200),
      description: (input.description ?? input.message ?? "").slice(0, 4000),
      reminderType: input.reminderType ?? "CUSTOM",
      sourceType: input.sourceType ?? "CUSTOM",
      sourceId: input.sourceId ?? null,
      scheduledAt,
      timezone,
      priority: input.priority ?? "NORMAL",
      status: "SCHEDULED",
      recurrence,
      actionUrl: assertSafeActionUrl(input.actionUrl),
      metadata: sanitizeMetadata(input.metadata),
      nextRunAt,
      processingAttempts: 0,
      failureReason: "",
    });
    logger.info({ reminderId: created.reminderId, userId: ownerId }, "Reminder created");
    return created;
  },

  async getReminders(actor: ReminderActor, query: Record<string, unknown>) {
    const { page, limit, skip } = parsePagination(query);
    const result = await reminderRepository.list({
      userId: ownerScope(actor),
      status: typeof query.status === "string" ? (query.status as ReminderStatus) : undefined,
      reminderType: typeof query.reminderType === "string" ? (query.reminderType as ReminderType) : undefined,
      priority: typeof query.priority === "string" ? (query.priority as ReminderPriority) : undefined,
      from: query.from instanceof Date ? query.from : undefined,
      to: query.to instanceof Date ? query.to : undefined,
      skip,
      limit,
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  async getReminder(id: string, actor: ReminderActor) {
    assertObjectId(id);
    const item = await reminderRepository.findById(id);
    if (!item) throw new NotFoundError("Reminder not found");
    assertOwner(actor, String(item.userId));
    return asPublic(item);
  },

  async updateReminder(id: string, input: Record<string, unknown>, actor: ReminderActor) {
    const current = await this.getReminder(id, actor);
    if (current.status !== "SCHEDULED") {
      throw new ConflictError("Only scheduled reminders can be updated");
    }
    const patch: Record<string, unknown> = {};
    for (const field of UPDATE_FIELDS) {
      if (input[field] !== undefined) patch[field] = input[field];
    }
    if (typeof patch.actionUrl === "string") patch.actionUrl = assertSafeActionUrl(patch.actionUrl);
    if (typeof patch.timezone === "string" && !isValidTimeZone(patch.timezone)) {
      throw new ValidationError("Invalid timezone", [{ field: "timezone" }]);
    }
    if (patch.scheduledAt instanceof Date) patch.nextRunAt = patch.scheduledAt;
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("At least one field is required");
    }
    const updated = await reminderRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Reminder not found");
    return asPublic(updated);
  },

  async completeReminder(id: string, actor: ReminderActor) {
    const current = await this.getReminder(id, actor);
    if (current.status === "COMPLETED") return current;
    if (current.status === "CANCELLED") throw new ConflictError("Cancelled reminders cannot be completed");
    const updated = await reminderRepository.updateById(id, {
      status: "COMPLETED",
      completedAt: current.completedAt ?? new Date(),
    });
    return asPublic(updated ?? current);
  },

  async cancelReminder(id: string, actor: ReminderActor) {
    const current = await this.getReminder(id, actor);
    if (current.status === "CANCELLED") return current;
    if (current.status === "COMPLETED") throw new ConflictError("Completed reminders cannot be cancelled");
    const updated = await reminderRepository.updateById(id, {
      status: "CANCELLED",
      cancelledAt: current.cancelledAt ?? new Date(),
    });
    return asPublic(updated ?? current);
  },

  async snoozeReminder(id: string, scheduledAt: Date, actor: ReminderActor) {
    const current = await this.getReminder(id, actor);
    if (current.status !== "SCHEDULED") {
      throw new ConflictError("Only scheduled reminders can be snoozed");
    }
    if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
      throw new ValidationError("scheduledAt is required");
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new ValidationError("Snooze time must be in the future", [{ field: "scheduledAt" }]);
    }
    const updated = await reminderRepository.updateById(id, {
      scheduledAt,
      nextRunAt: scheduledAt,
      status: "SCHEDULED",
    });
    return asPublic(updated ?? current);
  },

  async getTodayReminders(actor: ReminderActor, query: Record<string, unknown> = {}) {
    const now = query.now instanceof Date ? query.now : new Date();
    const timezone = env.APP_TIMEZONE;
    const { start, end } = getZonedDayRange(now, timezone);
    const { page, limit, skip } = parsePagination({ ...query, limit: query.limit ?? 20 });
    const result = await reminderRepository.list({
      userId: ownerScope(actor),
      from: start,
      to: end,
      skip,
      limit,
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  async getUpcomingReminders(actor: ReminderActor, query: Record<string, unknown> = {}) {
    const daysRaw = Number(query.days ?? 7);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 30) : 7;
    const now = query.now instanceof Date ? query.now : new Date();
    const { page, limit, skip } = parsePagination(query);
    const result = await reminderRepository.list({
      userId: ownerScope(actor),
      status: "SCHEDULED",
      from: now,
      to: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
      skip,
      limit,
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  async upsertSourceReminder(
    input: CreateReminderInput & { metadata: Record<string, unknown> },
    actor: ReminderActor,
  ) {
    const offset = Number(input.metadata.offsetMinutes ?? 0);
    if (input.sourceType && input.sourceId && Number.isFinite(offset)) {
      const existing = await reminderRepository.findSourceReminder(input.sourceType, input.sourceId, offset);
      if (existing) {
        const scheduledAt = input.scheduledAt ?? input.remindAt;
        if (scheduledAt && existing.status === "SCHEDULED") {
          const updated = await reminderRepository.updateById(String(existing._id ?? existing.id), {
            title: input.title,
            description: input.description ?? input.message ?? existing.description,
            scheduledAt,
            nextRunAt: scheduledAt,
            timezone: input.timezone || existing.timezone,
          });
          return asPublic(updated ?? existing);
        }
        return asPublic(existing);
      }
    }
    return this.createReminder(input, actor);
  },

  async scheduleTaskDue(task: Record<string, unknown>, actor: ReminderActor, userId: string) {
    const due = task.reminderAt ? new Date(String(task.reminderAt)) : task.dueDate ? new Date(String(task.dueDate)) : null;
    if (!due || Number.isNaN(due.getTime())) return null;
    return this.upsertSourceReminder(
      {
        title: `Task due: ${String(task.title ?? "Task")}`.slice(0, 200),
        description: String(task.description ?? ""),
        reminderType: "TASK",
        sourceType: "TASK",
        sourceId: String(task.id ?? task._id),
        scheduledAt: due,
        userId,
        actionUrl: `/tasks/${String(task.id ?? task._id)}`,
        metadata: { offsetMinutes: 0, kind: "TASK_DUE", taskId: String(task.taskId ?? "") },
        priority: task.priority === "CRITICAL" ? "URGENT" : task.priority === "HIGH" ? "HIGH" : "NORMAL",
      },
      actor,
    );
  },

  async scheduleMeetingReminder(
    meeting: Record<string, unknown>,
    actor: ReminderActor,
    offsetMinutes = DEFAULT_MEETING_REMINDER_MINUTES,
  ) {
    const start = new Date(String(meeting.startTime));
    if (Number.isNaN(start.getTime())) return null;
    const scheduledAt = new Date(start.getTime() - offsetMinutes * 60 * 1000);
    if (scheduledAt.getTime() <= Date.now()) return null;
    return this.upsertSourceReminder(
      {
        title: `Meeting reminder: ${String(meeting.title ?? "Meeting")}`.slice(0, 200),
        description: `Starts in ${offsetMinutes} minutes.`,
        reminderType: "MEETING",
        sourceType: "MEETING",
        sourceId: String(meeting.id ?? meeting._id),
        scheduledAt,
        timezone: String(meeting.timezone ?? env.APP_TIMEZONE),
        userId: String(meeting.organizerId ?? actor.id),
        actionUrl: `/meetings/${String(meeting.id ?? meeting._id)}`,
        metadata: { offsetMinutes, kind: "MEETING_REMINDER", meetingId: String(meeting.meetingId ?? "") },
        priority: "HIGH",
      },
      actor,
    );
  },

  async scheduleCrmFollowUp(
    record: Record<string, unknown>,
    actor: ReminderActor,
    options: { sourceType: "LEAD" | "OPPORTUNITY"; userId: string; name: string },
  ) {
    const followUp = record.nextFollowUpAt ? new Date(String(record.nextFollowUpAt)) : null;
    if (!followUp || Number.isNaN(followUp.getTime())) return null;
    const id = String(record.id ?? record._id);
    return this.upsertSourceReminder(
      {
        title: `Follow up with ${options.name}`.slice(0, 200),
        reminderType: "FOLLOW_UP",
        sourceType: options.sourceType,
        sourceId: id,
        scheduledAt: followUp,
        userId: options.userId,
        actionUrl: options.sourceType === "LEAD" ? `/leads/${id}` : `/opportunities/${id}`,
        metadata: { offsetMinutes: 0, kind: "FOLLOW_UP" },
        priority: "HIGH",
      },
      actor,
    );
  },

  async processDueReminders(now = new Date()) {
    let processed = 0;
    let notifications = 0;
    for (let i = 0; i < REMINDER_PROCESS_BATCH; i += 1) {
      const claimed = await reminderRepository.claimDue(now);
      if (!claimed) break;
      processed += 1;
      const record = asPublic(claimed);
      try {
        if (Number(record.processingAttempts ?? 0) > REMINDER_MAX_ATTEMPTS) {
          await reminderRepository.updateById(String(record.id), {
            status: "FAILED",
            failureReason: "Maximum processing attempts exceeded",
          });
          continue;
        }
        const occurrenceKey = new Date(String(record.nextRunAt)).toISOString();
        const created = await notificationService.createNotification({
          recipientId: String(record.userId),
          type: reminderToNotificationType(record.reminderType as ReminderType, String(record.sourceType ?? "")),
          title: record.reminderType === "MEETING" ? "Meeting reminder" : "Follow-up Reminder",
          message: String(record.title),
          priority: (record.priority as ReminderPriority) === "URGENT" ? "URGENT" : (record.priority as NotificationPrioritySafe),
          sourceType: record.sourceType as ReminderSourceType,
          sourceId: record.sourceId ? String(record.sourceId) : null,
          actionUrl: String(record.actionUrl ?? ""),
          metadata: { reminderId: record.reminderId },
          reminderId: String(record.reminderId),
          occurrenceKey,
        });
        if (created) notifications += 1;

        const recurrence = record.recurrence as RecurrenceInput | undefined;
        const next = recurrence?.enabled
          ? computeNextRunAt(new Date(String(record.nextRunAt)), recurrence, String(record.timezone || env.APP_TIMEZONE))
          : null;
        if (next) {
          await reminderRepository.updateById(String(record.id), {
            status: "SCHEDULED",
            triggeredAt: now,
            lastProcessedAt: now,
            nextRunAt: next,
            failureReason: "",
            processingAttempts: 0,
          });
        } else {
          await reminderRepository.updateById(String(record.id), {
            status: "TRIGGERED",
            triggeredAt: now,
            lastProcessedAt: now,
            failureReason: "",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Processing failed";
        const attempts = Number(record.processingAttempts ?? 1);
        const retry = attempts < REMINDER_MAX_ATTEMPTS;
        await reminderRepository.updateById(String(record.id), {
          status: retry ? "SCHEDULED" : "FAILED",
          failureReason: message,
          lastProcessedAt: now,
          nextRunAt: retry
            ? new Date(now.getTime() + attempts * 60 * 1000)
            : record.nextRunAt,
        });
        logger.warn({ err: error, reminderId: record.reminderId }, "Reminder processing failed");
      }
    }
    if (processed > 0) {
      logger.info({ processed, notifications }, "Due reminders processed");
    }
    return { processed, notifications };
  },
};

type NotificationPrioritySafe = "LOW" | "NORMAL" | "HIGH" | "URGENT";

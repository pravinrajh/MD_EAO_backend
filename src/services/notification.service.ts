import { logger } from "../config/logger";
import { notificationRepository } from "../repositories/notification.repository";
import { notificationPreferenceRepository } from "../repositories/notificationPreference.repository";
import {
  NOTIFICATION_BULK_MAX,
  type NotificationCategory,
  type NotificationPriority,
  type NotificationType,
  type ReminderSourceType,
  type Role,
} from "../utils/constants";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { isDuplicateKey } from "../utils/mongo";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextNotificationId } from "../utils/sequence";
import { inAppNotificationChannel } from "./notification/channel";
import { whatsappNotificationChannel } from "./notification/channel/whatsapp.channel";
import { notificationPreferenceService } from "./notificationPreference.service";
import { isPrivileged } from "./task.policy";
import { env } from "../config/env";
import { getZonedDateTimeParts } from "../utils/timezone";

export type NotificationActor = { id: string; role: Role };

export type CreateNotificationInput = {
  recipientId: string;
  type: NotificationType;
  category?: NotificationCategory;
  title: string;
  message: string;
  priority?: NotificationPriority;
  sourceType?: ReminderSourceType;
  sourceId?: string | null;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  reminderId?: string;
  occurrenceKey?: string;
  expiresAt?: Date | null;
};

const ID_RETRIES = 3;

const TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  TASK_ASSIGNED: "tasks",
  TASK_DUE: "tasks",
  TASK_OVERDUE: "tasks",
  MEETING_CREATED: "meetings",
  MEETING_UPDATED: "meetings",
  MEETING_CANCELLED: "meetings",
  MEETING_REMINDER: "meetings",
  PROJECT_UPDATED: "projects",
  PROJECT_AT_RISK: "projects",
  LEAD_ASSIGNED: "crm",
  LEAD_FOLLOW_UP: "crm",
  OPPORTUNITY_FOLLOW_UP: "crm",
  FINANCE_ALERT: "finance",
  BUDGET_ALERT: "finance",
  REMINDER_DUE: "reminders",
  SYSTEM_ALERT: "system",
};

function categoryFor(type: NotificationType, override?: NotificationCategory): NotificationCategory {
  return override ?? TYPE_CATEGORY[type];
}

function parseMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function inQuietHours(
  quiet: { enabled?: boolean; startTime?: string; endTime?: string; timezone?: string } | undefined,
  now: Date,
): boolean {
  if (!quiet?.enabled) return false;
  const timezone = quiet.timezone || env.APP_TIMEZONE;
  const parts = getZonedDateTimeParts(now, timezone);
  const current = parts.hour * 60 + parts.minute;
  const start = parseMinutes(String(quiet.startTime ?? "22:00"));
  const end = parseMinutes(String(quiet.endTime ?? "07:00"));
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function shouldSendWhatsApp(
  type: NotificationType,
  priority: NotificationPriority,
  channels: Record<string, boolean>,
  allowCategory: boolean,
  quiet: Record<string, unknown> | undefined,
): boolean {
  if (!whatsappNotificationChannel.isEnabled({ channels }) || !allowCategory) return false;
  const urgent = priority === "URGENT" || type === "SYSTEM_ALERT";
  if (!urgent && inQuietHours(quiet as { enabled?: boolean; startTime?: string; endTime?: string; timezone?: string }, new Date())) {
    return false;
  }
  return true;
}

function canView(actor: NotificationActor, recipientId: string) {
  return actor.id === recipientId || isPrivileged(actor.role);
}

function asPublic(value: unknown) {
  return notificationRepository.toPublic(value as Record<string, unknown>);
}

export const notificationService = {
  categoryFor,

  async createNotification(input: CreateNotificationInput) {
    const category = categoryFor(input.type, input.category);
    const preferences = await notificationPreferenceService.getOrCreate(input.recipientId);
    const channels = (preferences.channels ?? {}) as Record<string, boolean>;
    const categories = (preferences.categories ?? {}) as Record<string, boolean>;
    const allowCategory = category === "system" || categories[category] !== false;
    const allowInApp = inAppNotificationChannel.isEnabled({ channels }) && allowCategory;
    const allowWhatsApp = shouldSendWhatsApp(
      input.type,
      input.priority ?? "NORMAL",
      channels,
      allowCategory,
      preferences.quietHours as Record<string, unknown> | undefined,
    );
    if (!allowInApp && !allowWhatsApp) {
      logger.info({ recipientId: input.recipientId, type: input.type }, "Notification skipped by preferences");
      return null;
    }

    const now = new Date();
    const payload: Record<string, unknown> = {
      recipientId: input.recipientId,
      type: input.type,
      category,
      title: input.title.slice(0, 200),
      message: input.message.slice(0, 2000),
      priority: input.priority ?? "NORMAL",
      isRead: false,
      readAt: null,
      status: "SENT",
      sourceType: input.sourceType ?? "CUSTOM",
      sourceId: input.sourceId ?? null,
      actionUrl: input.actionUrl ?? "",
      metadata: input.metadata ?? {},
      reminderId: input.reminderId ?? "",
      occurrenceKey: input.occurrenceKey ?? "",
      sentAt: now,
      expiresAt: input.expiresAt ?? null,
      deliveryAttempts: 1,
      lastAttemptAt: now,
      failureReason: "",
      isDeleted: false,
    };

    if (allowInApp) {
      const inApp = await inAppNotificationChannel.deliver({
        recipientId: input.recipientId,
        type: input.type,
        category,
        title: String(payload.title),
        message: String(payload.message),
        priority: payload.priority as NotificationPriority,
      });
      if (!inApp.delivered) {
        payload.status = "FAILED";
        payload.sentAt = null;
        payload.failureReason = (inApp.reason ?? "").slice(0, 1000);
      }
    }

    for (let attempt = 0; attempt < ID_RETRIES; attempt += 1) {
      try {
        const created = await notificationRepository.create({
          ...payload,
          notificationId: await nextNotificationId(),
        });
        const publicNotification = asPublic(created);
        if (allowWhatsApp) {
          const delivered = await whatsappNotificationChannel.deliver({
            recipientId: input.recipientId,
            type: input.type,
            category,
            title: String(payload.title),
            message: String(payload.message),
            priority: payload.priority as NotificationPriority,
          });
          if (!delivered.delivered) {
            logger.info({ recipientId: input.recipientId, reason: delivered.reason }, "WhatsApp notification not sent");
          }
        }
        return publicNotification;
      } catch (error) {
        if (isDuplicateKey(error, "occurrenceKey") || isDuplicateKey(error, "reminderId")) {
          const existing = await notificationRepository.findByOccurrence(
            input.reminderId ?? "",
            input.occurrenceKey ?? "",
          );
          if (existing) return asPublic(existing);
        }
        if (isDuplicateKey(error, "notificationId") && attempt < ID_RETRIES - 1) continue;
        throw error;
      }
    }
    throw new ValidationError("Unable to create notification");
  },

  async createBulkNotifications(inputs: CreateNotificationInput[], actor?: NotificationActor) {
    if (actor && !isPrivileged(actor.role)) {
      throw new ForbiddenError("You do not have permission to send bulk notifications");
    }
    if (inputs.length === 0) return [];
    if (inputs.length > NOTIFICATION_BULK_MAX) {
      throw new ValidationError(`Bulk notifications cannot exceed ${NOTIFICATION_BULK_MAX}`);
    }

    const recipientIds = [...new Set(inputs.map((item) => item.recipientId))];
    const prefs = await notificationPreferenceRepository.findByUserIds(recipientIds);
    const prefByUser = new Map(prefs.map((item) => [String(item.userId), item as Record<string, unknown>]));

    const docs: Array<Record<string, unknown>> = [];
    const now = new Date();
    for (const input of inputs) {
      const category = categoryFor(input.type, input.category);
      const pref = prefByUser.get(input.recipientId);
      const channels = ((pref?.channels as Record<string, boolean> | undefined) ?? { inApp: true }) as Record<
        string,
        boolean
      >;
      const categories = ((pref?.categories as Record<string, boolean> | undefined) ?? {}) as Record<string, boolean>;
      const allowCategory = category === "system" || categories[category] !== false;
      if (!inAppNotificationChannel.isEnabled({ channels }) || !allowCategory) continue;
      docs.push({
        notificationId: await nextNotificationId(),
        recipientId: input.recipientId,
        type: input.type,
        category,
        title: input.title.slice(0, 200),
        message: input.message.slice(0, 2000),
        priority: input.priority ?? "NORMAL",
        isRead: false,
        readAt: null,
        status: "SENT",
        sourceType: input.sourceType ?? "CUSTOM",
        sourceId: input.sourceId ?? null,
        actionUrl: input.actionUrl ?? "",
        metadata: input.metadata ?? {},
        reminderId: input.reminderId ?? "",
        occurrenceKey: input.occurrenceKey ?? "",
        sentAt: now,
        expiresAt: input.expiresAt ?? null,
        deliveryAttempts: 1,
        lastAttemptAt: now,
        failureReason: "",
        isDeleted: false,
      });
    }
    if (docs.length === 0) return [];
    try {
      const inserted = await notificationRepository.insertMany(docs);
      return inserted.map((item) => asPublic(item));
    } catch (error) {
      if (isDuplicateKey(error)) return [];
      throw error;
    }
  },

  async getNotifications(actor: NotificationActor, query: Record<string, unknown>) {
    const { page, limit, skip } = parsePagination(query);
    const recipientId = isPrivileged(actor.role) && typeof query.recipientId === "string" ? query.recipientId : actor.id;
    const isRead =
      query.isRead === true || query.isRead === "true"
        ? true
        : query.isRead === false || query.isRead === "false"
          ? false
          : undefined;
    const result = await notificationRepository.list({
      recipientId,
      isRead,
      type: typeof query.type === "string" ? (query.type as NotificationType) : undefined,
      priority: typeof query.priority === "string" ? (query.priority as NotificationPriority) : undefined,
      from: query.from instanceof Date ? query.from : undefined,
      to: query.to instanceof Date ? query.to : undefined,
      skip,
      limit,
    });
    return { items: result.items, meta: buildPaginationMeta(page, limit, result.total) };
  },

  async getNotification(id: string, actor: NotificationActor) {
    const item = await notificationRepository.findById(id);
    if (!item || item.isDeleted) throw new NotFoundError("Notification not found");
    if (!canView(actor, String(item.recipientId))) throw new NotFoundError("Notification not found");
    return asPublic(item);
  },

  async markAsRead(id: string, actor: NotificationActor) {
    const existing = await notificationRepository.findById(id);
    if (!existing || existing.isDeleted) throw new NotFoundError("Notification not found");
    if (String(existing.recipientId) !== actor.id) throw new NotFoundError("Notification not found");
    if (existing.isRead) return asPublic(existing);
    const updated = await notificationRepository.markRead(id, actor.id);
    return asPublic(updated ?? existing);
  },

  async markAsUnread(id: string, actor: NotificationActor) {
    const existing = await notificationRepository.findById(id);
    if (!existing || existing.isDeleted) throw new NotFoundError("Notification not found");
    if (String(existing.recipientId) !== actor.id) throw new NotFoundError("Notification not found");
    if (!existing.isRead) return asPublic(existing);
    const updated = await notificationRepository.markUnread(id, actor.id);
    return asPublic(updated ?? existing);
  },

  async markAllAsRead(actor: NotificationActor) {
    const result = await notificationRepository.markAllRead(actor.id);
    return { updated: result.modifiedCount };
  },

  async getUnreadCount(actor: NotificationActor) {
    const count = await notificationRepository.countUnread(actor.id);
    return { count };
  },

  async deleteNotification(id: string, actor: NotificationActor) {
    const existing = await notificationRepository.findById(id);
    if (!existing || existing.isDeleted) throw new NotFoundError("Notification not found");
    if (String(existing.recipientId) !== actor.id) throw new NotFoundError("Notification not found");
    const updated = await notificationRepository.softDelete(id, String(existing.recipientId));
    return asPublic(updated ?? existing);
  },
};

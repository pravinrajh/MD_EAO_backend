import type { FilterQuery } from "mongoose";
import { Notification, type NotificationDocument } from "../models/Notification";
import {
  NOTIFICATION_SAFE_FIELDS,
  type NotificationPriority,
  type NotificationType,
} from "../utils/constants";

export type NotificationListFilters = {
  recipientId: string;
  isRead?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  from?: Date;
  to?: Date;
  skip: number;
  limit: number;
};

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.recipientId) record.recipientId = String(record.recipientId);
  if (record.sourceId) record.sourceId = String(record.sourceId);
  delete record._id;
  delete record.__v;
  return record;
}

function toPublic(doc: NotificationDocument | Record<string, unknown>) {
  if (typeof (doc as NotificationDocument).toJSON === "function") {
    const record = (doc as NotificationDocument).toJSON() as Record<string, unknown>;
    stringifyIds(record);
    return record;
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

function activeQuery(extra: FilterQuery<NotificationDocument> = {}, now = new Date()): FilterQuery<NotificationDocument> {
  return {
    isDeleted: false,
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, extra],
  };
}

export const notificationRepository = {
  create(data: Record<string, unknown>) {
    return Notification.create(data);
  },

  insertMany(docs: Array<Record<string, unknown>>) {
    return Notification.insertMany(docs, { ordered: false });
  },

  findById(id: string) {
    return Notification.findById(id).select(NOTIFICATION_SAFE_FIELDS).lean();
  },

  findByOccurrence(reminderId: string, occurrenceKey: string) {
    if (!reminderId || !occurrenceKey) return Promise.resolve(null);
    return Notification.findOne({ reminderId, occurrenceKey }).select(NOTIFICATION_SAFE_FIELDS).lean();
  },

  async list(filters: NotificationListFilters) {
    const extra: FilterQuery<NotificationDocument> = { recipientId: filters.recipientId };
    if (typeof filters.isRead === "boolean") extra.isRead = filters.isRead;
    if (filters.type) extra.type = filters.type;
    if (filters.priority) extra.priority = filters.priority;
    if (filters.from || filters.to) {
      extra.createdAt = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lt: filters.to } : {}),
      };
    }
    const query = activeQuery(extra);

    const [items, total] = await Promise.all([
      Notification.find(query)
        .select(NOTIFICATION_SAFE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      Notification.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublic(item)), total };
  },

  countUnread(recipientId: string, now = new Date()) {
    return Notification.countDocuments(activeQuery({ recipientId, isRead: false }, now));
  },

  markRead(id: string, recipientId: string, now = new Date()) {
    return Notification.findOneAndUpdate(
      { _id: id, recipientId, isDeleted: false },
      { $set: { isRead: true, readAt: now } },
      { new: true },
    ).select(NOTIFICATION_SAFE_FIELDS);
  },

  markUnread(id: string, recipientId: string) {
    return Notification.findOneAndUpdate(
      { _id: id, recipientId, isDeleted: false },
      { $set: { isRead: false, readAt: null } },
      { new: true },
    ).select(NOTIFICATION_SAFE_FIELDS);
  },

  markAllRead(recipientId: string, now = new Date()) {
    return Notification.updateMany(
      activeQuery({ recipientId, isRead: false }, now),
      { $set: { isRead: true, readAt: now } },
    );
  },

  softDelete(id: string, recipientId: string, now = new Date()) {
    return Notification.findOneAndUpdate(
      { _id: id, recipientId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: now } },
      { new: true },
    ).select(NOTIFICATION_SAFE_FIELDS);
  },

  toPublic,
};

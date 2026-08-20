import type { FilterQuery } from "mongoose";
import { Reminder, type ReminderDocument } from "../models/Reminder";
import {
  REMINDER_CLAIM_STALE_MS,
  REMINDER_SAFE_FIELDS,
  type ReminderStatus,
  type ReminderType,
  type ReminderPriority,
} from "../utils/constants";

export type ReminderListFilters = {
  userId?: string;
  status?: ReminderStatus;
  reminderType?: ReminderType;
  priority?: ReminderPriority;
  from?: Date;
  to?: Date;
  skip: number;
  limit: number;
};

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  if (record.createdBy) record.createdBy = String(record.createdBy);
  if (record.sourceId) record.sourceId = String(record.sourceId);
  delete record._id;
  delete record.__v;
  return record;
}

function toPublic(doc: ReminderDocument | Record<string, unknown>) {
  if (typeof (doc as ReminderDocument).toJSON === "function") {
    const record = (doc as ReminderDocument).toJSON() as Record<string, unknown>;
    stringifyIds(record);
    return record;
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

export const reminderRepository = {
  create(data: Record<string, unknown>) {
    return Reminder.create(data);
  },

  findById(id: string) {
    return Reminder.findById(id).select(REMINDER_SAFE_FIELDS).lean();
  },

  findByReminderId(reminderId: string) {
    return Reminder.findOne({ reminderId }).select(REMINDER_SAFE_FIELDS).lean();
  },

  findSourceReminder(sourceType: string, sourceId: string, offsetMinutes: number) {
    return Reminder.findOne({
      sourceType,
      sourceId,
      "metadata.offsetMinutes": offsetMinutes,
      status: { $in: ["SCHEDULED", "PROCESSING"] },
    })
      .select(REMINDER_SAFE_FIELDS)
      .lean();
  },

  async list(filters: ReminderListFilters) {
    const query: FilterQuery<ReminderDocument> = {};
    if (filters.userId) query.userId = filters.userId;
    if (filters.status) query.status = filters.status;
    if (filters.reminderType) query.reminderType = filters.reminderType;
    if (filters.priority) query.priority = filters.priority;
    if (filters.from || filters.to) {
      query.nextRunAt = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lt: filters.to } : {}),
      };
    }

    const [items, total] = await Promise.all([
      Reminder.find(query)
        .select(REMINDER_SAFE_FIELDS)
        .sort({ nextRunAt: 1, createdAt: -1 })
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      Reminder.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublic(item)), total };
  },

  updateById(id: string, patch: Record<string, unknown>) {
    return Reminder.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(REMINDER_SAFE_FIELDS);
  },

  claimDue(now = new Date()) {
    const stale = new Date(now.getTime() - REMINDER_CLAIM_STALE_MS);
    return Reminder.findOneAndUpdate(
      {
        $or: [
          { status: "SCHEDULED", nextRunAt: { $lte: now } },
          { status: "PROCESSING", lastProcessedAt: { $lte: stale } },
        ],
      },
      {
        $set: { status: "PROCESSING", lastProcessedAt: now },
        $inc: { processingAttempts: 1 },
      },
      { new: true, sort: { nextRunAt: 1 } },
    ).select(REMINDER_SAFE_FIELDS);
  },

  toPublic,
};

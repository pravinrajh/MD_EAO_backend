import mongoose, { Schema } from "mongoose";
import {
  REMINDER_FREQUENCIES,
  REMINDER_PRIORITIES,
  REMINDER_SOURCE_TYPES,
  REMINDER_STATUSES,
  REMINDER_TYPES,
  REMINDER_WEEKDAYS,
  type ReminderFrequency,
  type ReminderPriority,
  type ReminderSourceType,
  type ReminderStatus,
  type ReminderType,
  type ReminderWeekday,
} from "../utils/constants";

export type ReminderRecurrence = {
  enabled: boolean;
  frequency: ReminderFrequency;
  interval: number;
  daysOfWeek: ReminderWeekday[];
  endAt: Date | null;
};

export type ReminderDocument = mongoose.Document & {
  reminderId: string;
  userId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  title: string;
  description: string;
  reminderType: ReminderType;
  sourceType: ReminderSourceType;
  sourceId: mongoose.Types.ObjectId | null;
  scheduledAt: Date;
  timezone: string;
  priority: ReminderPriority;
  status: ReminderStatus;
  recurrence: ReminderRecurrence;
  actionUrl: string;
  metadata: Record<string, unknown>;
  triggeredAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  lastProcessedAt: Date | null;
  nextRunAt: Date;
  processingAttempts: number;
  failureReason: string;
  createdAt: Date;
  updatedAt: Date;
};

const reminderSchema = new Schema<ReminderDocument>(
  {
    reminderId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    reminderType: { type: String, enum: REMINDER_TYPES, required: true, default: "CUSTOM" },
    sourceType: { type: String, enum: REMINDER_SOURCE_TYPES, required: true, default: "CUSTOM" },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    scheduledAt: { type: Date, required: true },
    timezone: { type: String, required: true, trim: true, maxlength: 64, default: "Asia/Kolkata" },
    priority: { type: String, enum: REMINDER_PRIORITIES, required: true, default: "NORMAL" },
    status: { type: String, enum: REMINDER_STATUSES, required: true, default: "SCHEDULED" },
    recurrence: {
      enabled: { type: Boolean, required: true, default: false },
      frequency: { type: String, enum: REMINDER_FREQUENCIES, default: "WEEKLY" },
      interval: { type: Number, min: 1, max: 30, default: 1 },
      daysOfWeek: [{ type: String, enum: REMINDER_WEEKDAYS }],
      endAt: { type: Date, default: null },
    },
    actionUrl: { type: String, default: "", trim: true, maxlength: 300 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    triggeredAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    lastProcessedAt: { type: Date, default: null },
    nextRunAt: { type: Date, required: true },
    processingAttempts: { type: Number, required: true, default: 0, min: 0 },
    failureReason: { type: String, default: "", maxlength: 1000 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const value = ret as Record<string, unknown>;
        value.id = String(value._id);
        delete value._id;
        delete value.__v;
        return value;
      },
    },
  },
);

reminderSchema.index({ reminderId: 1 }, { unique: true });
reminderSchema.index({ userId: 1, status: 1, scheduledAt: 1 });
reminderSchema.index({ status: 1, nextRunAt: 1 });
reminderSchema.index({ sourceType: 1, sourceId: 1 });
reminderSchema.index(
  { sourceType: 1, sourceId: 1, "metadata.offsetMinutes": 1 },
  {
    unique: true,
    partialFilterExpression: { sourceId: { $type: "objectId" }, "metadata.offsetMinutes": { $type: "number" } },
  },
);

export const Reminder = mongoose.model<ReminderDocument>("Reminder", reminderSchema);

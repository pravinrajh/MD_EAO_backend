import mongoose, { Schema } from "mongoose";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_TYPES,
  REMINDER_SOURCE_TYPES,
  type NotificationCategory,
  type NotificationDeliveryStatus,
  type NotificationPriority,
  type NotificationType,
  type ReminderSourceType,
} from "../utils/constants";

export type NotificationDocument = mongoose.Document & {
  notificationId: string;
  recipientId: mongoose.Types.ObjectId;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  priority: NotificationPriority;
  isRead: boolean;
  readAt: Date | null;
  status: NotificationDeliveryStatus;
  sourceType: ReminderSourceType;
  sourceId: mongoose.Types.ObjectId | null;
  actionUrl: string;
  metadata: Record<string, unknown>;
  reminderId: string;
  occurrenceKey: string;
  sentAt: Date | null;
  expiresAt: Date | null;
  deliveryAttempts: number;
  lastAttemptAt: Date | null;
  failureReason: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const notificationSchema = new Schema<NotificationDocument>(
  {
    notificationId: { type: String, required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    category: { type: String, enum: NOTIFICATION_CATEGORIES, required: true, default: "reminders" },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    priority: { type: String, enum: NOTIFICATION_PRIORITIES, required: true, default: "NORMAL" },
    isRead: { type: Boolean, required: true, default: false },
    readAt: { type: Date, default: null },
    status: { type: String, enum: NOTIFICATION_DELIVERY_STATUSES, required: true, default: "PENDING" },
    sourceType: { type: String, enum: REMINDER_SOURCE_TYPES, required: true, default: "CUSTOM" },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    actionUrl: { type: String, default: "", trim: true, maxlength: 300 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    reminderId: { type: String, default: "", trim: true, maxlength: 32 },
    occurrenceKey: { type: String, default: "", trim: true, maxlength: 80 },
    sentAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    deliveryAttempts: { type: Number, required: true, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },
    failureReason: { type: String, default: "", maxlength: 1000 },
    isDeleted: { type: Boolean, required: true, default: false },
    deletedAt: { type: Date, default: null },
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

notificationSchema.index({ notificationId: 1 }, { unique: true });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { sparse: true });
notificationSchema.index(
  { reminderId: 1, occurrenceKey: 1 },
  { unique: true, partialFilterExpression: { reminderId: { $gt: "" }, occurrenceKey: { $gt: "" } } },
);

export const Notification = mongoose.model<NotificationDocument>("Notification", notificationSchema);

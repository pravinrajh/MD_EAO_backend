import mongoose, { Schema } from "mongoose";

export type NotificationChannels = {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  whatsapp: boolean;
};

export type NotificationCategoryToggles = {
  tasks: boolean;
  meetings: boolean;
  projects: boolean;
  crm: boolean;
  finance: boolean;
  reminders: boolean;
  system: boolean;
};

export type QuietHours = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type NotificationPreferenceDocument = mongoose.Document & {
  userId: mongoose.Types.ObjectId;
  channels: NotificationChannels;
  categories: NotificationCategoryToggles;
  quietHours: QuietHours;
  createdAt: Date;
  updatedAt: Date;
};

const notificationPreferenceSchema = new Schema<NotificationPreferenceDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    channels: {
      inApp: { type: Boolean, required: true, default: true },
      email: { type: Boolean, required: true, default: false },
      sms: { type: Boolean, required: true, default: false },
      push: { type: Boolean, required: true, default: false },
      whatsapp: { type: Boolean, required: true, default: false },
    },
    categories: {
      tasks: { type: Boolean, required: true, default: true },
      meetings: { type: Boolean, required: true, default: true },
      projects: { type: Boolean, required: true, default: true },
      crm: { type: Boolean, required: true, default: true },
      finance: { type: Boolean, required: true, default: true },
      reminders: { type: Boolean, required: true, default: true },
      system: { type: Boolean, required: true, default: true },
    },
    quietHours: {
      enabled: { type: Boolean, required: true, default: false },
      startTime: { type: String, default: "22:00", maxlength: 5 },
      endTime: { type: String, default: "07:00", maxlength: 5 },
      timezone: { type: String, default: "Asia/Kolkata", maxlength: 64 },
    },
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

notificationPreferenceSchema.index({ userId: 1 }, { unique: true });

export const NotificationPreference = mongoose.model<NotificationPreferenceDocument>(
  "NotificationPreference",
  notificationPreferenceSchema,
);

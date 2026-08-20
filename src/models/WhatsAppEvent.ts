import mongoose, { Schema } from "mongoose";
import {
  WHATSAPP_EVENT_STATUSES,
  WHATSAPP_EVENT_TYPES,
  type WhatsAppEventStatus,
  type WhatsAppEventType,
} from "../utils/constants";

export type WhatsAppEventDocument = mongoose.Document & {
  eventId: string;
  provider: string;
  providerMessageId: string;
  eventType: WhatsAppEventType;
  phoneNumber: string;
  userId: mongoose.Types.ObjectId | null;
  rawEventHash: string;
  dedupeKey: string;
  payloadType: string;
  snapshot: Record<string, unknown>;
  processingStatus: WhatsAppEventStatus;
  error: string;
  receivedAt: Date;
  processedAt: Date | null;
  lastProcessedAt: Date | null;
  processingAttempts: number;
  createdAt: Date;
  updatedAt: Date;
};

const whatsAppEventSchema = new Schema<WhatsAppEventDocument>(
  {
    eventId: { type: String, required: true },
    provider: { type: String, required: true, trim: true, maxlength: 32, default: "meta" },
    providerMessageId: { type: String, required: true, trim: true, maxlength: 128 },
    eventType: { type: String, enum: WHATSAPP_EVENT_TYPES, required: true },
    phoneNumber: { type: String, required: true, trim: true, maxlength: 20 },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    rawEventHash: { type: String, required: true, maxlength: 64 },
    dedupeKey: { type: String, required: true, maxlength: 200 },
    payloadType: { type: String, required: true, trim: true, maxlength: 40, default: "unknown" },
    snapshot: { type: Schema.Types.Mixed, default: {} },
    processingStatus: { type: String, enum: WHATSAPP_EVENT_STATUSES, required: true, default: "RECEIVED" },
    error: { type: String, default: "", maxlength: 1000 },
    receivedAt: { type: Date, required: true, default: Date.now },
    processedAt: { type: Date, default: null },
    lastProcessedAt: { type: Date, default: null },
    processingAttempts: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

whatsAppEventSchema.index({ eventId: 1 }, { unique: true });
whatsAppEventSchema.index({ dedupeKey: 1 }, { unique: true });
whatsAppEventSchema.index({ provider: 1, providerMessageId: 1 });
whatsAppEventSchema.index({ processingStatus: 1, receivedAt: 1 });
whatsAppEventSchema.index({ receivedAt: 1 });

export const WhatsAppEvent = mongoose.model<WhatsAppEventDocument>("WhatsAppEvent", whatsAppEventSchema);

import mongoose, { Schema } from "mongoose";
import {
  WHATSAPP_DIRECTIONS,
  WHATSAPP_MESSAGE_STATUSES,
  WHATSAPP_MESSAGE_TYPES,
  type WhatsAppDirection,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
} from "../utils/constants";

export type WhatsAppMessageDocument = mongoose.Document & {
  messageId: string;
  providerMessageId: string;
  provider: string;
  userId: mongoose.Types.ObjectId | null;
  phoneNumber: string;
  conversationId: string;
  direction: WhatsAppDirection;
  messageType: WhatsAppMessageType;
  text: string;
  status: WhatsAppMessageStatus;
  idempotencyKey: string;
  sentAt: Date | null;
  receivedAt: Date | null;
  failureReason: string;
  createdAt: Date;
  updatedAt: Date;
};

const whatsAppMessageSchema = new Schema<WhatsAppMessageDocument>(
  {
    messageId: { type: String, required: true },
    providerMessageId: { type: String, default: "", trim: true, maxlength: 128 },
    provider: { type: String, required: true, trim: true, maxlength: 32, default: "meta" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    phoneNumber: { type: String, required: true, trim: true, maxlength: 20 },
    conversationId: { type: String, required: true, trim: true, maxlength: 32 },
    direction: { type: String, enum: WHATSAPP_DIRECTIONS, required: true },
    messageType: { type: String, enum: WHATSAPP_MESSAGE_TYPES, required: true, default: "TEXT" },
    text: { type: String, default: "", maxlength: 4096 },
    status: { type: String, enum: WHATSAPP_MESSAGE_STATUSES, required: true, default: "PENDING" },
    idempotencyKey: { type: String, default: "", maxlength: 128 },
    sentAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    failureReason: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true },
);

whatsAppMessageSchema.index({ messageId: 1 }, { unique: true });
whatsAppMessageSchema.index(
  { provider: 1, providerMessageId: 1 },
  { unique: true, partialFilterExpression: { providerMessageId: { $gt: "" } } },
);
whatsAppMessageSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $gt: "" } } },
);
whatsAppMessageSchema.index({ userId: 1, createdAt: -1 });
whatsAppMessageSchema.index({ phoneNumber: 1, createdAt: -1 });
whatsAppMessageSchema.index({ conversationId: 1, createdAt: -1 });

export const WhatsAppMessage = mongoose.model<WhatsAppMessageDocument>("WhatsAppMessage", whatsAppMessageSchema);

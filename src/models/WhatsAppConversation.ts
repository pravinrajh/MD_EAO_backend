import mongoose, { Schema } from "mongoose";
import {
  WHATSAPP_CONVERSATION_STATUSES,
  type WhatsAppConversationStatus,
} from "../utils/constants";

export type WhatsAppConversationDocument = mongoose.Document & {
  conversationId: string;
  userId: mongoose.Types.ObjectId | null;
  phoneNumber: string;
  provider: string;
  status: WhatsAppConversationStatus;
  lastMessageAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  pendingActionId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const whatsAppConversationSchema = new Schema<WhatsAppConversationDocument>(
  {
    conversationId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    phoneNumber: { type: String, required: true, trim: true, maxlength: 20 },
    provider: { type: String, required: true, trim: true, maxlength: 32, default: "meta" },
    status: { type: String, enum: WHATSAPP_CONVERSATION_STATUSES, required: true, default: "ACTIVE" },
    lastMessageAt: { type: Date, default: null },
    lastInboundAt: { type: Date, default: null },
    lastOutboundAt: { type: Date, default: null },
    pendingActionId: { type: String, default: "", maxlength: 32 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

whatsAppConversationSchema.index({ conversationId: 1 }, { unique: true });
whatsAppConversationSchema.index({ provider: 1, phoneNumber: 1 }, { unique: true });
whatsAppConversationSchema.index({ userId: 1, status: 1 });

export const WhatsAppConversation = mongoose.model<WhatsAppConversationDocument>(
  "WhatsAppConversation",
  whatsAppConversationSchema,
);

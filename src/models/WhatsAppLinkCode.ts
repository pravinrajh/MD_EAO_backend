import mongoose, { Schema } from "mongoose";
import { WHATSAPP_LINK_STATUSES, type WhatsAppLinkStatus } from "../utils/constants";

export type WhatsAppLinkCodeDocument = mongoose.Document & {
  userId: mongoose.Types.ObjectId;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  status: WhatsAppLinkStatus;
  createdAt: Date;
  updatedAt: Date;
};

const whatsAppLinkCodeSchema = new Schema<WhatsAppLinkCodeDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    codeHash: { type: String, required: true, maxlength: 128 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    status: { type: String, enum: WHATSAPP_LINK_STATUSES, required: true, default: "PENDING" },
  },
  { timestamps: true },
);

whatsAppLinkCodeSchema.index({ codeHash: 1 }, { unique: true });
whatsAppLinkCodeSchema.index({ userId: 1, status: 1 });
whatsAppLinkCodeSchema.index({ expiresAt: 1 });

export const WhatsAppLinkCode = mongoose.model<WhatsAppLinkCodeDocument>(
  "WhatsAppLinkCode",
  whatsAppLinkCodeSchema,
);

import mongoose, { Schema } from "mongoose";
import {
  WHATSAPP_IDENTITY_STATUSES,
  type WhatsAppIdentityStatus,
} from "../utils/constants";

export type WhatsAppIdentityDocument = mongoose.Document & {
  identityId: string;
  userId: mongoose.Types.ObjectId;
  phoneNumber: string;
  provider: string;
  verified: boolean;
  status: WhatsAppIdentityStatus;
  createdAt: Date;
  updatedAt: Date;
};

const whatsAppIdentitySchema = new Schema<WhatsAppIdentityDocument>(
  {
    identityId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    phoneNumber: { type: String, required: true, trim: true, maxlength: 20 },
    provider: { type: String, required: true, trim: true, maxlength: 32, default: "meta" },
    verified: { type: Boolean, required: true, default: false },
    status: { type: String, enum: WHATSAPP_IDENTITY_STATUSES, required: true, default: "ACTIVE" },
  },
  { timestamps: true },
);

whatsAppIdentitySchema.index({ identityId: 1 }, { unique: true });
whatsAppIdentitySchema.index({ provider: 1, phoneNumber: 1 }, { unique: true });
whatsAppIdentitySchema.index({ userId: 1 });

export const WhatsAppIdentity = mongoose.model<WhatsAppIdentityDocument>(
  "WhatsAppIdentity",
  whatsAppIdentitySchema,
);

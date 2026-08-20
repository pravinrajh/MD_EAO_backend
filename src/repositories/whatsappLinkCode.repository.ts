import { WhatsAppLinkCode, type WhatsAppLinkCodeDocument } from "../models/WhatsAppLinkCode";
import { WHATSAPP_LINK_SAFE_FIELDS } from "../utils/constants";

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  delete record._id;
  delete record.__v;
  return record;
}

function toPublic(doc: WhatsAppLinkCodeDocument | Record<string, unknown>) {
  if (typeof (doc as WhatsAppLinkCodeDocument).toJSON === "function") {
    return stringifyIds((doc as WhatsAppLinkCodeDocument).toJSON() as Record<string, unknown>);
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

export const whatsAppLinkCodeRepository = {
  create(data: Record<string, unknown>) {
    return WhatsAppLinkCode.create(data);
  },

  findPendingByHash(codeHash: string, now = new Date()) {
    return WhatsAppLinkCode.findOne({
      codeHash,
      status: "PENDING",
      expiresAt: { $gt: now },
    })
      .select(WHATSAPP_LINK_SAFE_FIELDS)
      .lean();
  },

  findPendingByUserId(userId: string) {
    return WhatsAppLinkCode.findOne({ userId, status: "PENDING" }).select(WHATSAPP_LINK_SAFE_FIELDS).lean();
  },

  updateById(id: string, patch: Record<string, unknown>) {
    return WhatsAppLinkCode.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(WHATSAPP_LINK_SAFE_FIELDS);
  },

  cancelPendingForUser(userId: string) {
    return WhatsAppLinkCode.updateMany({ userId, status: "PENDING" }, { $set: { status: "CANCELLED" } });
  },

  expireOverdue(now = new Date()) {
    return WhatsAppLinkCode.updateMany(
      { status: "PENDING", expiresAt: { $lte: now } },
      { $set: { status: "EXPIRED" } },
    );
  },

  toPublic,
};

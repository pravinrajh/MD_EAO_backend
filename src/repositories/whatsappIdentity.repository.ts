import { WhatsAppIdentity, type WhatsAppIdentityDocument } from "../models/WhatsAppIdentity";
import { WHATSAPP_IDENTITY_SAFE_FIELDS } from "../utils/constants";

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  delete record._id;
  delete record.__v;
  return record;
}

function toPublic(doc: WhatsAppIdentityDocument | Record<string, unknown>) {
  if (typeof (doc as WhatsAppIdentityDocument).toJSON === "function") {
    return stringifyIds((doc as WhatsAppIdentityDocument).toJSON() as Record<string, unknown>);
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

export const whatsAppIdentityRepository = {
  create(data: Record<string, unknown>) {
    return WhatsAppIdentity.create(data);
  },

  findByProviderPhone(provider: string, phoneNumber: string) {
    return WhatsAppIdentity.findOne({ provider, phoneNumber }).select(WHATSAPP_IDENTITY_SAFE_FIELDS).lean();
  },

  findByUserId(userId: string, provider = "meta") {
    return WhatsAppIdentity.findOne({ userId, provider, status: "ACTIVE", verified: true })
      .select(WHATSAPP_IDENTITY_SAFE_FIELDS)
      .lean();
  },

  updateById(id: string, patch: Record<string, unknown>) {
    return WhatsAppIdentity.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(WHATSAPP_IDENTITY_SAFE_FIELDS);
  },

  toPublic,
};

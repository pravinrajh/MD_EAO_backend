import { WhatsAppMessage, type WhatsAppMessageDocument } from "../models/WhatsAppMessage";
import { WHATSAPP_MESSAGE_SAFE_FIELDS, type WhatsAppMessageStatus } from "../utils/constants";

const STATUS_RANK: Record<WhatsAppMessageStatus, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
};

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  delete record._id;
  delete record.__v;
  return record;
}

function toPublic(doc: WhatsAppMessageDocument | Record<string, unknown>) {
  if (typeof (doc as WhatsAppMessageDocument).toJSON === "function") {
    return stringifyIds((doc as WhatsAppMessageDocument).toJSON() as Record<string, unknown>);
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

export const whatsAppMessageRepository = {
  create(data: Record<string, unknown>) {
    return WhatsAppMessage.create(data);
  },

  findByProviderMessageId(provider: string, providerMessageId: string) {
    return WhatsAppMessage.findOne({ provider, providerMessageId }).select(WHATSAPP_MESSAGE_SAFE_FIELDS).lean();
  },

  findByIdempotencyKey(idempotencyKey: string) {
    if (!idempotencyKey) return Promise.resolve(null);
    return WhatsAppMessage.findOne({ idempotencyKey }).select(WHATSAPP_MESSAGE_SAFE_FIELDS).lean();
  },

  updateById(id: string, patch: Record<string, unknown>) {
    return WhatsAppMessage.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(WHATSAPP_MESSAGE_SAFE_FIELDS);
  },

  async applyStatus(provider: string, providerMessageId: string, status: WhatsAppMessageStatus) {
    const current = await WhatsAppMessage.findOne({ provider, providerMessageId }).select(WHATSAPP_MESSAGE_SAFE_FIELDS);
    if (!current) return null;
    const currentStatus = current.status as WhatsAppMessageStatus;
    if (currentStatus === "FAILED" && status !== "FAILED") return current;
    if (status !== "FAILED" && STATUS_RANK[status] < STATUS_RANK[currentStatus]) return current;
    current.status = status;
    await current.save();
    return current;
  },

  toPublic,
};

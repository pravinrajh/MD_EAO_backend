import { WhatsAppEvent, type WhatsAppEventDocument } from "../models/WhatsAppEvent";
import {
  WHATSAPP_CLAIM_STALE_MS,
  WHATSAPP_EVENT_SAFE_FIELDS,
} from "../utils/constants";

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  delete record._id;
  delete record.__v;
  return record;
}

function toPublic(doc: WhatsAppEventDocument | Record<string, unknown>) {
  if (typeof (doc as WhatsAppEventDocument).toJSON === "function") {
    return stringifyIds((doc as WhatsAppEventDocument).toJSON() as Record<string, unknown>);
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

export const whatsAppEventRepository = {
  create(data: Record<string, unknown>) {
    return WhatsAppEvent.create(data);
  },

  findByDedupeKey(dedupeKey: string) {
    return WhatsAppEvent.findOne({ dedupeKey }).select(WHATSAPP_EVENT_SAFE_FIELDS).lean();
  },

  updateById(id: string, patch: Record<string, unknown>) {
    return WhatsAppEvent.findByIdAndUpdate(id, { $set: patch }, { new: true }).select(WHATSAPP_EVENT_SAFE_FIELDS);
  },

  claimDue(now = new Date()) {
    const stale = new Date(now.getTime() - WHATSAPP_CLAIM_STALE_MS);
    return WhatsAppEvent.findOneAndUpdate(
      {
        $or: [
          { processingStatus: "RECEIVED" },
          { processingStatus: "PROCESSING", lastProcessedAt: { $lte: stale } },
        ],
      },
      {
        $set: { processingStatus: "PROCESSING", lastProcessedAt: now },
        $inc: { processingAttempts: 1 },
      },
      { new: true, sort: { receivedAt: 1 } },
    );
  },

  toPublic,
};

import { WhatsAppConversation, type WhatsAppConversationDocument } from "../models/WhatsAppConversation";
import { WHATSAPP_CONVERSATION_SAFE_FIELDS } from "../utils/constants";

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  delete record._id;
  delete record.__v;
  return record;
}

function toPublic(doc: WhatsAppConversationDocument | Record<string, unknown>) {
  if (typeof (doc as WhatsAppConversationDocument).toJSON === "function") {
    return stringifyIds((doc as WhatsAppConversationDocument).toJSON() as Record<string, unknown>);
  }
  return stringifyIds({ ...(doc as Record<string, unknown>) });
}

export const whatsAppConversationRepository = {
  create(data: Record<string, unknown>) {
    return WhatsAppConversation.create(data);
  },

  findByProviderPhone(provider: string, phoneNumber: string) {
    return WhatsAppConversation.findOne({ provider, phoneNumber }).select(WHATSAPP_CONVERSATION_SAFE_FIELDS).lean();
  },

  findByConversationId(conversationId: string) {
    return WhatsAppConversation.findOne({ conversationId }).select(WHATSAPP_CONVERSATION_SAFE_FIELDS).lean();
  },

  updateByConversationId(conversationId: string, patch: Record<string, unknown>) {
    return WhatsAppConversation.findOneAndUpdate({ conversationId }, { $set: patch }, { new: true }).select(
      WHATSAPP_CONVERSATION_SAFE_FIELDS,
    );
  },

  toPublic,
};

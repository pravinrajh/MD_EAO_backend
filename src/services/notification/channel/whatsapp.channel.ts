import { env } from "../../../config/env";
import { logger } from "../../../config/logger";
import { whatsAppConversationRepository } from "../../../repositories/whatsappConversation.repository";
import { whatsAppIdentityService } from "../../whatsapp/whatsappIdentity.service";
import { whatsAppMessagingService } from "../../whatsapp/whatsappMessaging.service";
import type { ChannelDeliveryInput, NotificationChannel } from "./notificationChannel.interface";

export const whatsappNotificationChannel: NotificationChannel = {
  name: "whatsapp",
  isEnabled(preferences) {
    return preferences.channels.whatsapp === true;
  },
  async deliver(input: ChannelDeliveryInput) {
    if (!env.WHATSAPP_ACCESS_TOKEN && env.NODE_ENV === "production") {
      return { delivered: false, reason: "WhatsApp channel is not configured" };
    }
    const phone = await whatsAppIdentityService.findVerifiedPhone(input.recipientId);
    if (!phone) return { delivered: false, reason: "No linked WhatsApp identity" };
    const conversation = await whatsAppConversationRepository.findByProviderPhone("meta", phone);
    const text = `${input.title}\n${input.message}`.trim();
    try {
      await whatsAppMessagingService.sendTextMessage({
        phoneNumber: phone,
        message: text,
        conversationId: String(conversation?.conversationId ?? "WACONV-NOTIFY"),
        userId: input.recipientId,
        idempotencyKey: `notif:${input.recipientId}:${input.type}:${input.title}`.slice(0, 128),
      });
      return { delivered: true };
    } catch (error) {
      logger.warn({ err: error, recipientId: input.recipientId }, "WhatsApp notification delivery failed");
      return { delivered: false, reason: error instanceof Error ? error.message : "send failed" };
    }
  },
};

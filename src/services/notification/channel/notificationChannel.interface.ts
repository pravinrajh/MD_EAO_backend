import type { NotificationCategory, NotificationPriority, NotificationType } from "../../../utils/constants";

export type ChannelDeliveryInput = {
  recipientId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  priority: NotificationPriority;
};

export interface NotificationChannel {
  readonly name: string;
  isEnabled(preferences: { channels: Record<string, boolean> }): boolean;
  deliver(input: ChannelDeliveryInput): Promise<{ delivered: boolean; reason?: string }>;
}

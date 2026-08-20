import type { NotificationChannel, ChannelDeliveryInput } from "./notificationChannel.interface";

export const inAppNotificationChannel: NotificationChannel = {
  name: "inApp",
  isEnabled(preferences) {
    return preferences.channels.inApp !== false;
  },
  async deliver(_input: ChannelDeliveryInput) {
    return { delivered: true };
  },
};

import type { NotificationChannel } from "./notificationChannel.interface";

export const emailNotificationChannel: NotificationChannel = {
  name: "email",
  isEnabled(preferences) {
    return preferences.channels.email === true;
  },
  async deliver() {
    return { delivered: false, reason: "Email channel is not configured" };
  },
};

export const smsNotificationChannel: NotificationChannel = {
  name: "sms",
  isEnabled(preferences) {
    return preferences.channels.sms === true;
  },
  async deliver() {
    return { delivered: false, reason: "SMS channel is not configured" };
  },
};

export const pushNotificationChannel: NotificationChannel = {
  name: "push",
  isEnabled(preferences) {
    return preferences.channels.push === true;
  },
  async deliver() {
    return { delivered: false, reason: "Push channel is not configured" };
  },
};

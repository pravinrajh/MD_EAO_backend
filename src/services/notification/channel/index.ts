export { inAppNotificationChannel } from "./inApp.channel";
export {
  emailNotificationChannel,
  pushNotificationChannel,
  smsNotificationChannel,
} from "./future.channels";
export { whatsappNotificationChannel } from "./whatsapp.channel";
export type { NotificationChannel } from "./notificationChannel.interface";

import { inAppNotificationChannel } from "./inApp.channel";
import {
  emailNotificationChannel,
  pushNotificationChannel,
  smsNotificationChannel,
} from "./future.channels";
import { whatsappNotificationChannel } from "./whatsapp.channel";

export const notificationChannels = [
  inAppNotificationChannel,
  emailNotificationChannel,
  smsNotificationChannel,
  pushNotificationChannel,
  whatsappNotificationChannel,
];

import { NotificationPreference } from "../models/NotificationPreference";
import { NOTIFICATION_PREFERENCE_SAFE_FIELDS } from "../utils/constants";

function stringifyIds(record: Record<string, unknown>) {
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  delete record._id;
  delete record.__v;
  return record;
}

export const notificationPreferenceRepository = {
  findByUserId(userId: string) {
    return NotificationPreference.findOne({ userId }).select(NOTIFICATION_PREFERENCE_SAFE_FIELDS).lean();
  },

  create(data: Record<string, unknown>) {
    return NotificationPreference.create(data);
  },

  updateByUserId(userId: string, patch: Record<string, unknown>) {
    return NotificationPreference.findOneAndUpdate({ userId }, { $set: patch }, { new: true }).select(
      NOTIFICATION_PREFERENCE_SAFE_FIELDS,
    );
  },

  findByUserIds(userIds: string[]) {
    if (userIds.length === 0) return Promise.resolve([]);
    return NotificationPreference.find({ userId: { $in: userIds } })
      .select(NOTIFICATION_PREFERENCE_SAFE_FIELDS)
      .lean();
  },

  toPublic(record: Record<string, unknown>) {
    return stringifyIds({ ...record });
  },
};

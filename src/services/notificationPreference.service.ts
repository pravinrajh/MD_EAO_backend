import { env } from "../config/env";
import { notificationPreferenceRepository } from "../repositories/notificationPreference.repository";
import type { Role } from "../utils/constants";
import { isDuplicateKey } from "../utils/mongo";
import { isValidTimeZone } from "../utils/timezone";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

export type PreferenceActor = { id: string; role: Role };

const DEFAULTS = {
  channels: { inApp: true, email: false, sms: false, push: false, whatsapp: false },
  categories: {
    tasks: true,
    meetings: true,
    projects: true,
    crm: true,
    finance: true,
    reminders: true,
    system: true,
  },
  quietHours: { enabled: false, startTime: "22:00", endTime: "07:00", timezone: env.APP_TIMEZONE },
};

function toPublic(record: Record<string, unknown>) {
  return notificationPreferenceRepository.toPublic(record);
}

export const notificationPreferenceService = {
  async getOrCreate(userId: string) {
    const existing = await notificationPreferenceRepository.findByUserId(userId);
    if (existing) return toPublic(existing as Record<string, unknown>);
    try {
      const created = await notificationPreferenceRepository.create({
        userId,
        ...DEFAULTS,
        quietHours: { ...DEFAULTS.quietHours, timezone: env.APP_TIMEZONE },
      });
      return toPublic(created.toJSON() as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKey(error, "userId")) {
        const again = await notificationPreferenceRepository.findByUserId(userId);
        if (again) return toPublic(again as Record<string, unknown>);
      }
      throw error;
    }
  },

  async getPreferences(actor: PreferenceActor) {
    return this.getOrCreate(actor.id);
  },

  async updatePreferences(input: Record<string, unknown>, actor: PreferenceActor) {
    if (typeof input.userId === "string" && input.userId !== actor.id) {
      throw new ForbiddenError("You cannot change another user's notification preferences");
    }
    const current = await this.getOrCreate(actor.id);
    const patch: Record<string, unknown> = {};
    if (input.channels && typeof input.channels === "object") {
      patch.channels = { ...(current.channels as object), ...(input.channels as object) };
    }
    if (input.categories && typeof input.categories === "object") {
      patch.categories = { ...(current.categories as object), ...(input.categories as object) };
    }
    if (input.quietHours && typeof input.quietHours === "object") {
      const quiet = input.quietHours as Record<string, unknown>;
      if (typeof quiet.timezone === "string" && !isValidTimeZone(quiet.timezone)) {
        throw new ValidationError("Invalid timezone", [{ field: "quietHours.timezone" }]);
      }
      patch.quietHours = { ...(current.quietHours as object), ...quiet };
    }
    if (Object.keys(patch).length === 0) {
      return this.getOrCreate(actor.id);
    }
    const updated = await notificationPreferenceRepository.updateByUserId(actor.id, patch);
    if (!updated) throw new NotFoundError("Notification preferences not found");
    return toPublic(typeof updated.toJSON === "function" ? (updated.toJSON() as Record<string, unknown>) : (updated as unknown as Record<string, unknown>));
  },
};

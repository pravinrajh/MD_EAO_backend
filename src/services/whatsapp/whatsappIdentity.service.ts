import crypto, { randomInt } from "crypto";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { userRepository } from "../../repositories/user.repository";
import { whatsAppIdentityRepository } from "../../repositories/whatsappIdentity.repository";
import { whatsAppLinkCodeRepository } from "../../repositories/whatsappLinkCode.repository";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { isDuplicateKey } from "../../utils/mongo";
import { isValidE164, maskPhone, toE164 } from "../../utils/phone";
import { nextWhatsAppIdentityId } from "../../utils/sequence";
import type { Role } from "../../utils/constants";

export type WhatsAppActor = { id: string; role: Role };

export type ResolvedWhatsAppUser = {
  userId: string;
  role: Role;
  identityId: string;
  source: "WHATSAPP";
  phoneNumber: string;
};

function hashLinkCode(code: string): string {
  const secret = env.WHATSAPP_APP_SECRET || env.JWT_SECRET;
  return crypto.createHmac("sha256", secret).update(code.trim()).digest("hex");
}

function asPublicIdentity(record: Record<string, unknown>) {
  return whatsAppIdentityRepository.toPublic(record);
}

export const whatsAppIdentityService = {
  async createLinkCode(actor: WhatsAppActor) {
    await whatsAppLinkCodeRepository.cancelPendingForUser(actor.id);
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + env.WHATSAPP_LINK_CODE_TTL_MS);
    await whatsAppLinkCodeRepository.create({
      userId: actor.id,
      codeHash: hashLinkCode(code),
      expiresAt,
      status: "PENDING",
    });
    logger.info({ userId: actor.id, expiresAt }, "WhatsApp link code created");
    return { code, expiresAt };
  },

  async cancelLinkCode(actor: WhatsAppActor) {
    await whatsAppLinkCodeRepository.cancelPendingForUser(actor.id);
    return { cancelled: true };
  },

  async consumeLinkCode(phoneNumber: string, code: string) {
    const e164 = toE164(phoneNumber);
    if (!isValidE164(e164)) {
      throw new ValidationError("Invalid phone number");
    }
    await whatsAppLinkCodeRepository.expireOverdue();
    const pending = await whatsAppLinkCodeRepository.findPendingByHash(hashLinkCode(code));
    if (!pending) return { ok: false as const, reason: "invalid" };
    const pendingId = String(pending._id ?? pending.id ?? "");
    if (!pendingId) return { ok: false as const, reason: "invalid" };

    const existing = await whatsAppIdentityRepository.findByProviderPhone("meta", e164);
    if (existing && String(existing.userId) !== String(pending.userId)) {
      return { ok: false as const, reason: "taken" };
    }

    if (existing && existing.status === "BLOCKED") {
      return { ok: false as const, reason: "blocked" };
    }

    await whatsAppLinkCodeRepository.updateById(pendingId, {
      status: "USED",
      usedAt: new Date(),
    });

    if (existing) {
      const updated = await whatsAppIdentityRepository.updateById(String(existing._id ?? existing.id), {
        verified: true,
        status: "ACTIVE",
        userId: pending.userId,
      });
      logger.info({ userId: String(pending.userId), phoneNumber: maskPhone(e164) }, "WhatsApp identity re-verified");
      return { ok: true as const, identity: asPublicIdentity((updated ?? existing) as unknown as Record<string, unknown>) };
    }

    try {
      const created = await whatsAppIdentityRepository.create({
        identityId: await nextWhatsAppIdentityId(),
        userId: pending.userId,
        phoneNumber: e164,
        provider: "meta",
        verified: true,
        status: "ACTIVE",
      });
      logger.info({ userId: String(pending.userId), phoneNumber: maskPhone(e164) }, "WhatsApp identity linked");
      return { ok: true as const, identity: asPublicIdentity(created.toJSON() as Record<string, unknown>) };
    } catch (error) {
      if (isDuplicateKey(error, "phoneNumber")) return { ok: false as const, reason: "taken" };
      throw error;
    }
  },

  async resolveIdentity(phoneNumber: string): Promise<ResolvedWhatsAppUser | { blocked: true } | null> {
    const e164 = toE164(phoneNumber);
    if (!e164) return null;
    const identity = await whatsAppIdentityRepository.findByProviderPhone("meta", e164);
    if (!identity || !identity.verified) return null;
    if (identity.status === "BLOCKED") return { blocked: true };
    const user = await userRepository.findPublicById(String(identity.userId));
    if (!user || user.isActive === false || user.status !== "ACTIVE") return { blocked: true };
    return {
      userId: String(user._id ?? user.id),
      role: user.role as Role,
      identityId: String(identity.identityId),
      source: "WHATSAPP",
      phoneNumber: e164,
    };
  },

  async findVerifiedPhone(userId: string): Promise<string | null> {
    const identity = await whatsAppIdentityRepository.findByUserId(userId);
    return identity?.phoneNumber ? String(identity.phoneNumber) : null;
  },

  async unlinkIdentity(actor: WhatsAppActor, targetUserId?: string) {
    const userId = targetUserId && targetUserId !== actor.id ? targetUserId : actor.id;
    if (userId !== actor.id) throw new ForbiddenError("You cannot unlink another user's WhatsApp identity");
    const identity = await whatsAppIdentityRepository.findByUserId(userId);
    if (!identity) throw new NotFoundError("WhatsApp identity not found");
    await whatsAppIdentityRepository.updateById(String(identity._id ?? identity.id), {
      status: "REVOKED",
      verified: false,
    });
    return { unlinked: true };
  },
};

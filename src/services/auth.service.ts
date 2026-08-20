import bcrypt from "bcrypt";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { refreshTokenRepository } from "../repositories/refreshToken.repository";
import { userRepository } from "../repositories/user.repository";
import type { Role } from "../utils/constants";
import { ConflictError, ForbiddenError, UnauthorizedError } from "../utils/errors";
import {
  createTokenId,
  expiresInToDate,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyRefreshToken,
} from "../utils/generateToken";

const SALT_ROUNDS = 12;

function publicUser(user: { toJSON?: () => unknown } | Record<string, unknown>) {
  return userRepository.toPublic(user as never);
}

async function issueTokens(userId: string, role: Role) {
  const jti = createTokenId();
  const refreshToken = generateRefreshToken(userId, role, jti);

  await refreshTokenRepository.create({
    userId,
    jti,
    tokenHash: hashToken(refreshToken),
    expiresAt: expiresInToDate(env.JWT_REFRESH_EXPIRES_IN),
  });

  return {
    jti,
    accessToken: generateAccessToken(userId, role),
    refreshToken,
  };
}

export const authService = {
  async register(input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role?: Role;
  }) {
    if (input.role && input.role !== "EMPLOYEE") {
      throw new ForbiddenError("Public registration cannot assign privileged roles");
    }

    const email = input.email.toLowerCase().trim();
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError("Email is already registered");
    }

    const user = await userRepository.create({
      name: input.name,
      email,
      phone: input.phone,
      passwordHash: await bcrypt.hash(input.password, SALT_ROUNDS),
      role: "EMPLOYEE",
    });

    logger.info({ userId: String(user._id), role: user.role }, "User registered");

    const tokens = await issueTokens(String(user._id), user.role);
    return {
      user: publicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  },

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email, true);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      logger.warn({ email: email.toLowerCase() }, "Authentication failure");
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.isActive || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Account is not active");
    }

    user.lastLoginAt = new Date();
    await user.save();

    logger.info({ userId: String(user._id) }, "User logged in");

    const tokens = await issueTokens(String(user._id), user.role);
    return {
      user: publicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await refreshTokenRepository.findActiveByJti(payload.jti!);

    if (!stored || stored.tokenHash !== hashToken(refreshToken)) {
      await refreshTokenRepository.revokeAllForUser(payload.sub);
      throw new UnauthorizedError("Invalid or revoked refresh token");
    }

    const user = await userRepository.findById(payload.sub);
    if (!user || !user.isActive || user.status !== "ACTIVE") {
      await refreshTokenRepository.revokeByJti(payload.jti!);
      throw new UnauthorizedError("Account is not active");
    }

    const next = await issueTokens(String(user._id), user.role);
    await refreshTokenRepository.revokeByJti(payload.jti!, next.jti);

    return {
      user: publicUser(user),
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
    };
  },

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        if (payload.sub === userId && payload.jti) {
          await refreshTokenRepository.revokeByJti(payload.jti);
        }
      } catch {
        // Still revoke the session family below.
      }
    }

    const revoked = await refreshTokenRepository.revokeAllForUser(userId);
    logger.info({ userId, revoked }, "User logged out");
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }
    return publicUser(user);
  },

  /** Authenticated user may update only name and phone. */
  async updateProfile(userId: string, input: { name?: string; phone?: string }) {
    const existing = await userRepository.findById(userId);
    if (!existing) {
      throw new UnauthorizedError("User not found");
    }
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.phone !== undefined) patch.phone = input.phone;
    const updated = await userRepository.updateById(userId, patch);
    if (!updated) {
      throw new UnauthorizedError("User not found");
    }
    logger.info({ userId }, "Profile updated");
    return publicUser(updated);
  },
};

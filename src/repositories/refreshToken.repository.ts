import { RefreshToken } from "../models/RefreshToken";

export const refreshTokenRepository = {
  create(data: {
    userId: string;
    jti: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return RefreshToken.create(data);
  },

  findActiveByJti(jti: string) {
    return RefreshToken.findOne({
      jti,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
  },

  async revokeByJti(jti: string, replacedBy?: string) {
    return RefreshToken.findOneAndUpdate(
      { jti, revokedAt: null },
      { revokedAt: new Date(), ...(replacedBy ? { replacedBy } : {}) },
      { new: true },
    );
  },

  async revokeAllForUser(userId: string) {
    const result = await RefreshToken.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date() },
    );
    return result.modifiedCount;
  },
};

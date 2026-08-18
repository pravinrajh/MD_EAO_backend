import { createHash, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { Role } from "./constants";
import { UnauthorizedError } from "./errors";

export type TokenPayload = {
  sub: string;
  role: Role;
  type: "access" | "refresh";
  jti?: string;
};

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function expiresInToDate(expiresIn: string): Date {
  const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());
  if (!match) {
    throw new Error(`Invalid token expiry format: ${expiresIn}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  return new Date(Date.now() + amount * UNIT_MS[unit]);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createTokenId(): string {
  return randomUUID();
}

function sign(payload: TokenPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function generateAccessToken(userId: string, role: Role): string {
  return sign({ sub: userId, role, type: "access" }, env.JWT_SECRET, env.JWT_EXPIRES_IN);
}

export function generateRefreshToken(userId: string, role: Role, jti: string): string {
  return sign(
    { sub: userId, role, type: "refresh", jti },
    env.JWT_REFRESH_SECRET,
    env.JWT_REFRESH_EXPIRES_IN,
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  return verify(token, env.JWT_SECRET, "access");
}

export function verifyRefreshToken(token: string): TokenPayload {
  const payload = verify(token, env.JWT_REFRESH_SECRET, "refresh");
  if (!payload.jti) {
    throw new UnauthorizedError("Invalid token");
  }
  return payload;
}

function verify(token: string, secret: string, expectedType: TokenPayload["type"]): TokenPayload {
  try {
    const decoded = jwt.verify(token, secret) as TokenPayload;
    if (decoded.type !== expectedType || !decoded.sub || !decoded.role) {
      throw new UnauthorizedError("Invalid token");
    }
    return decoded;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError("Invalid or expired token");
  }
}

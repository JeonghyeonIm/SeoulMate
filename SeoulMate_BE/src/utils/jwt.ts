import crypto from "crypto";

import { env } from "../config/env";

interface JwtPayload {
  sub: string;
  typ: "access" | "refresh";
  iat: number;
  exp: number;
}

const base64UrlEncode = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const base64UrlDecode = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
};

const sign = (value: string): string =>
  base64UrlEncode(crypto.createHmac("sha256", env.JWT_SECRET).update(value).digest());

const timingSafeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const createToken = (
  userId: number,
  type: "access" | "refresh",
  expiresInSeconds: number
): string => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: String(userId),
      typ: type,
      iat: issuedAt,
      exp: issuedAt + expiresInSeconds
    } satisfies JwtPayload)
  );
  const body = `${header}.${payload}`;

  return `${body}.${sign(body)}`;
};

export const verifyToken = (token: string, expectedType: "access" | "refresh"): JwtPayload => {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    throw new Error("Invalid token");
  }

  const expectedSignature = sign(`${header}.${payload}`);
  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Error("Invalid token signature");
  }

  const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<JwtPayload>;
  if (parsed.typ !== expectedType || !parsed.sub || !parsed.exp) {
    throw new Error("Invalid token payload");
  }

  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return parsed as JwtPayload;
};

export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const issueAuthTokens = (userId: number) => ({
  accessToken: createToken(userId, "access", env.JWT_ACCESS_EXPIRES_IN_SECONDS),
  refreshToken: createToken(userId, "refresh", env.JWT_REFRESH_EXPIRES_IN_SECONDS),
  tokenType: "Bearer",
  expiresIn: env.JWT_ACCESS_EXPIRES_IN_SECONDS
});

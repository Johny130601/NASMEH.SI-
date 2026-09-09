import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * One-click review-rating tokens (§10): HMAC-signed payload
 * { orderItemId, rating, exp } — tamper → null, expired → null.
 */

const payloadSchema = z.object({
  orderItemId: z.string().min(1).max(128),
  rating: z.number().int().min(1).max(5),
  exp: z.number().int().positive(),
});

export interface RatingTokenPayload {
  orderItemId: string;
  rating: number;
  exp: number;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(`review-rating:${payloadB64}`).digest("base64url");
}

export function signRatingToken(
  payload: Omit<RatingTokenPayload, "exp">,
  secret: string,
  ttlMs = 30 * 24 * 60 * 60 * 1000,
  now = Date.now(),
): string {
  const full = payloadSchema.parse({ ...payload, exp: now + ttlMs });
  const b64 = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${b64}.${sign(b64, secret)}`;
}

export function verifyRatingToken(
  token: string | undefined | null,
  secret: string,
  now = Date.now(),
): RatingTokenPayload | null {
  if (!token || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(b64, secret);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const parsed = payloadSchema.safeParse(
      JSON.parse(Buffer.from(b64, "base64url").toString("utf8")),
    );
    if (!parsed.success || parsed.data.exp <= now) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Guest cart cookie codec (AGENTS §5.4) — PURE, secret injected.
 * Wire format: base64url(JSON {v:1, lines, revision?}) + "." + hmac-sha256(payload).
 * Lines contain variant ids + quantities only — never prices. The optional
 * I/O-generated revision distinguishes a newly rebuilt cart from a paid one.
 */

export const GUEST_CART_COOKIE = "nasmeh_cart";
export const GUEST_CART_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export const cartLineSchema = z.object({
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(99),
});

const payloadSchema = z.object({
  v: z.literal(1),
  lines: z.array(cartLineSchema).max(50),
  revision: z.string().max(64).optional(),
});

export type CartLine = z.infer<typeof cartLineSchema>;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signGuestCart(lines: CartLine[], secret: string, revision?: string): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, lines, revision }), "utf8").toString(
    "base64url",
  );
  return `${payload}.${sign(payload, secret)}`;
}

/** Verify + parse the cookie; null on any tampering or bad shape. */
export function verifyGuestCart(
  raw: string | undefined | null,
  secret: string,
): CartLine[] | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  const expected = sign(payload, secret);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const parsed = payloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data.lines : null;
  } catch {
    return null;
  }
}

import { isStaffRole } from "@/lib/admin/permissions";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ORDER_ACCESS_MAX_AGE_S = 60 * 60 * 24 * 30;

const receiptSchema = z.object({
  v: z.literal(1),
  orderNumber: z.string().min(1).max(80),
  checkoutKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
  principal: z.string().max(80).nullable(),
  allowCartClear: z.boolean(),
  cartDigest: z.string().regex(/^[a-f0-9]{64}$/),
  cartVersion: z.string().max(200),
  expiresAt: z.number().int().positive(),
}).strict();

export type OrderReceipt = z.infer<typeof receiptSchema>;

export function accessHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function orderAccessCookieName(orderNumber: string): string {
  return `nasmeh_order_${accessHash(orderNumber).slice(0, 24)}`;
}

/** Sort before hashing so the same stored cart has one stable fingerprint. */
export function cartDigest(lines: Array<{ variantId: string; quantity: number }>): string {
  return accessHash(JSON.stringify(lines.map(({ variantId, quantity }) => ({ variantId, quantity }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId))));
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`order-access:${payload}`).digest("base64url");
}

/** Order access is a separate signed capability, never an order number alone. */
export function signOrderReceipt(receipt: OrderReceipt, secret: string): string {
  const payload = Buffer.from(JSON.stringify(receiptSchema.parse(receipt))).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyOrderReceipt(
  raw: string | undefined,
  order: { number: string; checkoutKey: string | null },
  secret: string,
  now: Date,
): OrderReceipt | null {
  if (!raw || raw.length > 2048 || !order.checkoutKey) return null;
  const [payload, supplied, extra] = raw.split(".");
  if (!payload || !supplied || extra !== undefined) return null;
  const expected = signature(payload, secret);
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;
  try {
    const parsed = receiptSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.orderNumber !== order.number || parsed.data.expiresAt <= now.getTime()) return null;
    if (parsed.data.checkoutKeyHash !== accessHash(order.checkoutKey)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function sessionOwnsOrder(
  order: { userId: string | null },
  session: { user?: { id?: string; role?: string } } | null,
): boolean {
  return isStaffRole(session?.user?.role) ||
    (order.userId !== null && order.userId === session?.user?.id);
}

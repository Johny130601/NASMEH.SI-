"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { variantIsPurchasable } from "@/lib/cart/visibility";
import {
  addToCart,
  removeLine,
  setLineQuantity,
} from "@/lib/cart/server";
import { cartLineSchema } from "@/lib/cart/codec";

export interface CartActionResult {
  ok: boolean;
  count: number;
  message?: string;
  /** The line already sat at its per-order cap: nothing was added. */
  capped?: boolean;
  /**
   * Units this add really stored, which is less than the quantity asked for
   * when the cap clamped it. Only the add path sets it; it is what may be
   * announced to the shopper and reported to analytics.
   */
  addedQuantity?: number;
}

/**
 * Cart mutations (AGENTS §5.2): the client sends INTENT — variant id +
 * quantity ONLY. Prices/maxCartQuantity/stock are re-read from the DB on
 * every call; a client-sent price is ignored by design (zod strips it).
 */
async function resolveVariant(variantId: string) {
  const variant = await db.variant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      maxCartQuantity: true,
      stock: true,
      allowBackorder: true,
      product: { select: { status: true, hiddenDeal: true } },
    },
  });
  if (!variant || !variantIsPurchasable(variant.product)) return null;
  return variant;
}

function countOf(lines: Array<{ quantity: number }>): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export async function addToCartAction(input: unknown): Promise<CartActionResult> {
  const parsed = cartLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };

  const variant = await resolveVariant(parsed.data.variantId);
  if (!variant || (variant.stock <= 0 && !variant.allowBackorder)) return { ok: false, count: 0 };

  const session = await auth();
  const { lines, addedQuantity } = await addToCart(
    session?.user?.id ?? null,
    parsed.data,
    variant.maxCartQuantity,
  );
  // The cap clamps silently: an add that changed nothing must not answer ok.
  if (addedQuantity <= 0) return { ok: false, count: countOf(lines), capped: true };
  return { ok: true, count: countOf(lines), addedQuantity };
}

export async function updateCartLineAction(input: unknown): Promise<CartActionResult> {
  const parsed = cartLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };

  const variant = await resolveVariant(parsed.data.variantId);
  if (!variant) return { ok: false, count: 0 };

  const session = await auth();
  const lines = await setLineQuantity(
    session?.user?.id ?? null,
    parsed.data.variantId,
    parsed.data.quantity,
    variant.maxCartQuantity,
  );
  return { ok: true, count: countOf(lines) };
}

export async function removeCartLineAction(input: unknown): Promise<CartActionResult> {
  const parsed = z
    .object({ variantId: z.string().min(1).max(64) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };

  const session = await auth();
  const lines = await removeLine(session?.user?.id ?? null, parsed.data.variantId);
  return { ok: true, count: countOf(lines) };
}

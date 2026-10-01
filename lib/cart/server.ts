import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import {
  GUEST_CART_COOKIE,
  GUEST_CART_MAX_AGE_S,
  GUEST_CART_MAX_LINES,
  signGuestCart,
  verifyGuestCart,
  type CartLine,
} from "./codec";
import { mergeCartLines } from "./merge";

/** Cart persistence I/O (AGENTS §5.4): guest signed cookie ↔ DB Cart. */

export async function readGuestCart(): Promise<CartLine[]> {
  const jar = await cookies();
  const raw = jar.get(GUEST_CART_COOKIE)?.value;
  return verifyGuestCart(raw, getEnv().AUTH_SECRET) ?? [];
}

export async function writeGuestCart(lines: CartLine[]): Promise<void> {
  const jar = await cookies();
  if (lines.length === 0) {
    jar.delete(GUEST_CART_COOKIE);
    return;
  }
  jar.set(GUEST_CART_COOKIE, signGuestCart(lines, getEnv().AUTH_SECRET, randomUUID()), {
    maxAge: GUEST_CART_MAX_AGE_S,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearGuestCart(): Promise<void> {
  const jar = await cookies();
  jar.delete(GUEST_CART_COOKIE);
}

async function getOrCreateDbCart(userId: string, tx: Prisma.TransactionClient) {
  // Lock the parent for the full mutation and advance its revision even when
  // two writes occur in one millisecond. Checkout uses this revision to avoid
  // clearing a newer cart that happens to contain the same products.
  const [cart] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "Cart" ("id", "userId", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO UPDATE
    SET "updatedAt" = GREATEST("Cart"."updatedAt" + INTERVAL '1 millisecond', CURRENT_TIMESTAMP)
    RETURNING "id"
  `;
  return cart;
}

/** Unified cart lines for the current principal (user or guest). */
export async function getCartLines(userId: string | null): Promise<CartLine[]> {
  if (!userId) return readGuestCart();
  const cart = await db.cart.findUnique({
    where: { userId },
    include: { items: true },
  });
  return (cart?.items ?? []).map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
  }));
}

export interface AddToCartOutcome {
  lines: CartLine[];
  /**
   * Units this write really added — 0 when the line already sat at
   * maxCartQuantity. The cap is applied silently, so only the difference the
   * write made may be confirmed to the shopper (a "Dodano" over an unchanged
   * cart is a false confirmation).
   */
  addedQuantity: number;
}

export async function addToCart(
  userId: string | null,
  line: CartLine,
  maxCartQuantity: number,
): Promise<AddToCartOutcome> {
  const quantity = Math.min(line.quantity, maxCartQuantity);
  if (userId) {
    const addedQuantity = await db.$transaction(async (tx) => {
      const cart = await getOrCreateDbCart(userId, tx);
      // The prior quantity is read under the row lock the add below takes, so
      // a concurrent add cannot make the reported difference lie.
      const [prior] = await tx.$queryRaw<Array<{ quantity: number }>>`
        SELECT "quantity" FROM "CartItem"
        WHERE "cartId" = ${cart.id} AND "variantId" = ${line.variantId}
        FOR UPDATE
      `;
      const before = prior?.quantity ?? 0;
      // One PostgreSQL statement holds the conflicting row lock while adding
      // and applying the cap. A read/modify/upsert loses concurrent additions;
      // a plain increment can exceed maxCartQuantity.
      const [written] = await tx.$queryRaw<Array<{ quantity: number }>>`
        INSERT INTO "CartItem" ("id", "cartId", "variantId", "quantity")
        VALUES (${randomUUID()}, ${cart.id}, ${line.variantId}, ${quantity})
        ON CONFLICT ("cartId", "variantId") DO UPDATE
        SET "quantity" = LEAST("CartItem"."quantity" + EXCLUDED."quantity", ${maxCartQuantity})
        RETURNING "quantity"
      `;
      return (written?.quantity ?? before) - before;
    });
    return { lines: await getCartLines(userId), addedQuantity };
  }

  const lines = await readGuestCart();
  const existing = lines.find((l) => l.variantId === line.variantId);
  const before = existing?.quantity ?? 0;
  const after = existing
    ? Math.min(before + line.quantity, maxCartQuantity)
    : quantity;
  const next = existing
    ? lines.map((l) =>
        l.variantId === line.variantId ? { ...l, quantity: after } : l,
      )
    : [...lines, { variantId: line.variantId, quantity }];
  await writeGuestCart(next);
  return { lines: next, addedQuantity: after - before };
}

export interface EnsureLineOutcome {
  variantId: string;
  /** Units the line holds after the write. */
  storedQuantity: number;
  /** Units this write really added — 0 when the line already held enough. */
  addedQuantity: number;
  /** The per-line cap stopped the line short of the quantity asked for. */
  capped: boolean;
}

export interface EnsureLinesOutcome {
  lines: CartLine[];
  results: EnsureLineOutcome[];
}

/**
 * Raise several lines to at least the quantity asked for, in ONE write
 * (AGENTS §5.4). Used by the bundle builder, where one gesture commits an
 * offer and its add-ons.
 *
 * "At least" and never less: the shopper may already hold more of a variant
 * than this bundle asks for, and a builder must not quietly empty a cart it
 * did not fill. Each line settles at
 * `min(max(before, asked), maxCartQuantity)`, so the write is idempotent —
 * the same submit twice leaves the same cart — and the product the PDP
 * already added before sending the shopper here is absorbed rather than
 * doubled.
 *
 * Per line it reports what really landed, because a cap that clamps one line
 * must not be confirmed as a success (AGENTS §8.23).
 */
export async function ensureCartLines(
  userId: string | null,
  lines: CartLine[],
  maxByVariant: ReadonlyMap<string, number>,
): Promise<EnsureLinesOutcome> {
  if (lines.length === 0) return { lines: await getCartLines(userId), results: [] };

  if (userId) {
    const results = await db.$transaction(async (tx) => {
      const cart = await getOrCreateDbCart(userId, tx);
      const out: EnsureLineOutcome[] = [];
      for (const line of lines) {
        const max = maxByVariant.get(line.variantId) ?? 0;
        if (max <= 0) {
          out.push({ variantId: line.variantId, storedQuantity: 0, addedQuantity: 0, capped: true });
          continue;
        }
        // Read under the lock the upsert below takes, so the reported
        // difference cannot lie when another tab writes the same line.
        const [prior] = await tx.$queryRaw<Array<{ quantity: number }>>`
          SELECT "quantity" FROM "CartItem"
          WHERE "cartId" = ${cart.id} AND "variantId" = ${line.variantId}
          FOR UPDATE
        `;
        const before = prior?.quantity ?? 0;
        const asked = Math.min(line.quantity, max);
        // GREATEST keeps a bigger existing line; LEAST re-applies the cap.
        const [written] = await tx.$queryRaw<Array<{ quantity: number }>>`
          INSERT INTO "CartItem" ("id", "cartId", "variantId", "quantity")
          VALUES (${randomUUID()}, ${cart.id}, ${line.variantId}, ${asked})
          ON CONFLICT ("cartId", "variantId") DO UPDATE
          SET "quantity" = LEAST(GREATEST("CartItem"."quantity", EXCLUDED."quantity"), ${max})
          RETURNING "quantity"
        `;
        const stored = written?.quantity ?? before;
        out.push({
          variantId: line.variantId,
          storedQuantity: stored,
          addedQuantity: stored - before,
          capped: line.quantity > max,
        });
      }
      return out;
    });
    return { lines: await getCartLines(userId), results };
  }

  const current = await readGuestCart();
  const next = current.map((line) => ({ ...line }));
  const results: EnsureLineOutcome[] = [];
  for (const line of lines) {
    const max = maxByVariant.get(line.variantId) ?? 0;
    const existing = next.find((l) => l.variantId === line.variantId);
    const before = existing?.quantity ?? 0;
    if (max <= 0) {
      results.push({ variantId: line.variantId, storedQuantity: before, addedQuantity: 0, capped: true });
      continue;
    }
    // The signed cookie refuses more than GUEST_CART_MAX_LINES lines, and a
    // cookie that fails verification reads as an EMPTY cart — so a line that
    // would overflow it is dropped here rather than costing the shopper the
    // whole cart on the next request.
    if (!existing && next.length >= GUEST_CART_MAX_LINES) {
      results.push({ variantId: line.variantId, storedQuantity: 0, addedQuantity: 0, capped: true });
      continue;
    }
    const stored = Math.min(Math.max(before, line.quantity), max);
    if (existing) existing.quantity = stored;
    else next.push({ variantId: line.variantId, quantity: stored });
    results.push({
      variantId: line.variantId,
      storedQuantity: stored,
      addedQuantity: stored - before,
      capped: line.quantity > max,
    });
  }
  await writeGuestCart(next);
  return { lines: next, results };
}

export async function setLineQuantity(
  userId: string | null,
  variantId: string,
  quantity: number,
  maxCartQuantity: number,
): Promise<CartLine[]> {
  const capped = Math.min(quantity, maxCartQuantity);
  if (userId) {
    await db.$transaction(async (tx) => {
      const cart = await getOrCreateDbCart(userId, tx);
      await tx.cartItem.updateMany({
        where: { cartId: cart.id, variantId },
        data: { quantity: capped },
      });
    });
    return getCartLines(userId);
  }
  const lines = await readGuestCart();
  const next = lines.map((l) =>
    l.variantId === variantId ? { ...l, quantity: capped } : l,
  );
  await writeGuestCart(next);
  return next;
}

/**
 * Lowers stored quantities to the ones hydration reads them back as (QA
 * C2-F16: `hydrateCartLines` clamps each line under its cap). Order creation
 * prices those clamped quantities, while the order receipt and the post-payment
 * clear fingerprint the STORED cart; placing an order therefore aligns the
 * stored cart first, or a paid cart that once held more than its cap would
 * never be cleared. Lines are only ever lowered; nothing is written when every
 * line already fits. Returns whether the stored cart changed.
 */
export async function clampCartLines(
  userId: string | null,
  caps: ReadonlyMap<string, number>,
): Promise<boolean> {
  const over = (line: CartLine) => {
    const cap = caps.get(line.variantId);
    return cap !== undefined && cap > 0 && line.quantity > cap;
  };
  if (userId) {
    const stored = await getCartLines(userId);
    const lowered = stored.filter(over);
    if (lowered.length === 0) return false;
    await db.$transaction(async (tx) => {
      const cart = await getOrCreateDbCart(userId, tx);
      for (const line of lowered) {
        const cap = caps.get(line.variantId)!;
        await tx.cartItem.updateMany({
          where: { cartId: cart.id, variantId: line.variantId, quantity: { gt: cap } },
          data: { quantity: cap },
        });
      }
    });
    return true;
  }
  const lines = await readGuestCart();
  if (!lines.some(over)) return false;
  await writeGuestCart(lines.map((line) => (over(line) ? { ...line, quantity: caps.get(line.variantId)! } : line)));
  return true;
}

export async function removeLine(
  userId: string | null,
  variantId: string,
): Promise<CartLine[]> {
  if (userId) {
    await db.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { userId } });
      if (cart) {
        await getOrCreateDbCart(userId, tx);
        await tx.cartItem.deleteMany({
          where: { cartId: cart.id, variantId },
        });
      }
    });
    return getCartLines(userId);
  }
  const lines = await readGuestCart();
  const next = lines.filter((l) => l.variantId !== variantId);
  await writeGuestCart(next);
  return next;
}

/**
 * Merge-on-login (AGENTS §5.4): guest cookie lines fold into the DB cart in
 * one transaction, maxCartQuantity re-applied, cookie cleared. Idempotent.
 */
export async function mergeGuestCartIntoUserCart(userId: string): Promise<void> {
  const guestLines = await readGuestCart();
  if (guestLines.length === 0) return;

  const variantIds = guestLines.map((line) => line.variantId);
  const variants = await db.variant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, maxCartQuantity: true },
  });
  const maxByVariant = new Map(
    variants.map((variant) => [variant.id, variant.maxCartQuantity]),
  );
  // drop lines whose variants no longer exist
  const validGuestLines = guestLines.filter((line) =>
    maxByVariant.has(line.variantId),
  );

  await db.$transaction(async (tx) => {
    const cart = await getOrCreateDbCart(userId, tx);
    const items = await tx.cartItem.findMany({ where: { cartId: cart.id } });
    const merged = mergeCartLines(
      items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      validGuestLines,
      maxByVariant,
    );
    for (const line of merged) {
      await tx.cartItem.upsert({
        where: {
          cartId_variantId: { cartId: cart.id, variantId: line.variantId },
        },
        update: { quantity: line.quantity },
        create: {
          cartId: cart.id,
          variantId: line.variantId,
          quantity: line.quantity,
        },
      });
    }
  });

  await clearGuestCart();
}

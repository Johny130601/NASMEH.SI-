import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import {
  GUEST_CART_COOKIE,
  GUEST_CART_MAX_AGE_S,
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

export async function addToCart(
  userId: string | null,
  line: CartLine,
  maxCartQuantity: number,
): Promise<CartLine[]> {
  const quantity = Math.min(line.quantity, maxCartQuantity);
  if (userId) {
    await db.$transaction(async (tx) => {
      const cart = await getOrCreateDbCart(userId, tx);
      // One PostgreSQL statement holds the conflicting row lock while adding
      // and applying the cap. A read/modify/upsert loses concurrent additions;
      // a plain increment can exceed maxCartQuantity.
      await tx.$executeRaw`
        INSERT INTO "CartItem" ("id", "cartId", "variantId", "quantity")
        VALUES (${randomUUID()}, ${cart.id}, ${line.variantId}, ${quantity})
        ON CONFLICT ("cartId", "variantId") DO UPDATE
        SET "quantity" = LEAST("CartItem"."quantity" + EXCLUDED."quantity", ${maxCartQuantity})
      `;
    });
    return getCartLines(userId);
  }

  const lines = await readGuestCart();
  const existing = lines.find((l) => l.variantId === line.variantId);
  const next = existing
    ? lines.map((l) =>
        l.variantId === line.variantId
          ? { ...l, quantity: Math.min(l.quantity + line.quantity, maxCartQuantity) }
          : l,
      )
    : [...lines, { variantId: line.variantId, quantity }];
  await writeGuestCart(next);
  return next;
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

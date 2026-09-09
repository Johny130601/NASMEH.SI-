import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addToCart, removeLine, setLineQuantity } from "@/lib/cart/server";
import { db } from "@/lib/db";
import { prisma } from "./helpers";

test.afterAll(async () => {
  await Promise.all([prisma.$disconnect(), db.$disconnect()]);
});

test("concurrent signed-in additions preserve increments and the purchase cap", async () => {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: { email: `cart-concurrent-${id}@test.si`, emailVerified: new Date() },
  });
  const product = await prisma.product.create({
    data: {
      title: "Cart concurrency fixture",
      slug: `cart-concurrent-${id}`,
      variants: { create: { sku: `CART-${id}`, priceCents: 1999, stock: 20, maxCartQuantity: 5 } },
    },
    include: { variants: true },
  });
  const variantId = product.variants[0].id;
  try {
    // Include creation of the very first cart/line in the concurrent race.
    await Promise.all(Array.from({ length: 3 }, () => addToCart(user.id, { variantId, quantity: 1 }, 5)));
    let cart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id }, include: { items: true } });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(3);
    const beforeMoreAdds = cart.updatedAt;

    await Promise.all(Array.from({ length: 6 }, () => addToCart(user.id, { variantId, quantity: 1 }, 5)));
    cart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id }, include: { items: true } });
    expect(cart.items[0].quantity).toBe(5);
    expect(cart.updatedAt.getTime()).toBeGreaterThan(beforeMoreAdds.getTime());

    const oldDate = new Date("2000-01-01T00:00:00Z");
    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: oldDate } });
    await setLineQuantity(user.id, variantId, 2, 5);
    cart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id }, include: { items: true } });
    expect(cart.items[0].quantity).toBe(2);
    expect(cart.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());

    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: oldDate } });
    await removeLine(user.id, variantId);
    cart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id }, include: { items: true } });
    expect(cart.items).toHaveLength(0);
    expect(cart.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  } finally {
    await prisma.cart.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.product.delete({ where: { id: product.id } });
  }
});

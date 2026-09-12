// Prints a signed guest-cart cookie value with one unit of a seeded variant, so the Lighthouse
// runs of /cart and /checkout measure the pages with a line in the cart:
//   DATABASE_URL=… AUTH_SECRET=… npx tsx scripts/lighthouse/cart-cookie.ts   → LH_CART_COOKIE
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { signGuestCart } from "../../lib/cart/codec";

const prisma = new PrismaClient();

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required (the server's secret signs the cart cookie)");
  const variant = await prisma.variant.findFirstOrThrow({
    where: { sku: process.env.LH_SKU ?? "NAS-TRK-14" },
    select: { id: true },
  });
  process.stdout.write(signGuestCart([{ variantId: variant.id, quantity: 1 }], secret, randomUUID()));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

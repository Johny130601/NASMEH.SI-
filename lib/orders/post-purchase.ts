import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clearGuestCart, getCartLines } from "@/lib/cart/server";
import { issueAuthToken } from "@/lib/auth-tokens";
import { sendVerifyAccountEmail } from "@/lib/email/mailer";
import { currentCartVersion, getOrderReceipt } from "./access";
import { cartDigest } from "./access-token";

const paidStatuses = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
const orderNumberSchema = z.string().min(1).max(80);
const claimSchema = z.object({ orderNumber: orderNumberSchema, password: z.string().min(8).max(72) });

/** A purchaser receipt authorizes creating a new account, never taking over one. */
export async function createPurchaserAccount(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "weak_password" };
  const order = await db.order.findUnique({ where: { number: parsed.data.orderNumber } });
  if (!order || !(paidStatuses as readonly string[]).includes(order.status)) return { ok: false, error: "order_state" };
  if (!(await getOrderReceipt(order))) return { ok: false, error: "order_access" };

  const email = order.email.trim().toLowerCase();
  try {
    let userId = order.userId;
    if (userId) {
      // Retry an interrupted verification send only for the account this order
      // already owns. Do not change its password, email, or marketing choices.
      const linked = await db.user.findUnique({ where: { id: userId } });
      if (!linked || linked.email.toLowerCase() !== email || linked.emailVerified) return { ok: false, error: "email_taken" };
    } else {
      if (await db.user.findUnique({ where: { email } })) return { ok: false, error: "email_taken" };
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      userId = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email, passwordHash, role: "CUSTOMER",
            name: (order.shippingAddress as { fullName?: string } | null)?.fullName ?? null,
            marketingOptIn: order.marketingOptIn,
          },
        });
        const claimed = await tx.order.updateMany({
          where: { id: order.id, userId: null, status: { in: [...paidStatuses] } },
          data: { userId: user.id },
        });
        if (claimed.count !== 1) throw new Error("order_already_claimed");
        await tx.consentLog.create({
          data: {
            userId: user.id, kind: "marketing-register", version: "1",
            choices: { marketing: order.marketingOptIn, source: "post-purchase", orderNumber: order.number },
          },
        });
        return user.id;
      });
    }
    const token = await issueAuthToken(userId, "VERIFY_EMAIL");
    await sendVerifyAccountEmail(email, token);
    return { ok: true };
  } catch (error) {
    console.error("post-purchase account activation failed", error);
    return { ok: false, error: "account_failed" };
  }
}

/**
 * One automatic clear per paid order, bound to the original browser/principal
 * and unchanged cart. Owner/admin page access alone never clears a cart.
 */
export async function clearPurchasedCart(input: unknown): Promise<{ ok: boolean; cleared?: boolean }> {
  const parsed = z.object({ orderNumber: orderNumberSchema }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const order = await db.order.findUnique({ where: { number: parsed.data.orderNumber }, include: { items: true } });
  if (!order || !(paidStatuses as readonly string[]).includes(order.status)) return { ok: false };
  const receipt = await getOrderReceipt(order);
  const session = await auth();
  const principal = session?.user?.id ?? null;
  if (!receipt || !receipt.allowCartClear || receipt.principal !== principal) return { ok: false };
  if (order.cartClearedAt) return { ok: true, cleared: false };
  const purchased = order.items.flatMap((item) => item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : []);
  const expectedDigest = cartDigest(purchased);

  if (!principal) {
    const [lines, version] = await Promise.all([getCartLines(null), currentCartVersion(null)]);
    const unchanged = version === receipt.cartVersion && cartDigest(lines) === receipt.cartDigest && receipt.cartDigest === expectedDigest;
    const claimed = await db.order.updateMany({
      where: { id: order.id, cartClearedAt: null, status: { in: [...paidStatuses] } },
      data: { cartClearedAt: new Date() },
    });
    if (claimed.count !== 1) return { ok: true, cleared: false };
    if (unchanged) await clearGuestCart();
    return { ok: true, cleared: unchanged };
  }

  try {
    const cleared = await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, cartClearedAt: null, status: { in: [...paidStatuses] } },
        data: { cartClearedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      const cart = await tx.cart.findUnique({ where: { userId: principal }, include: { items: true } });
      if (!cart || `${cart.id}:${cart.updatedAt.toISOString()}` !== receipt.cartVersion ||
          cartDigest(cart.items) !== receipt.cartDigest || receipt.cartDigest !== expectedDigest) return false;
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date(Math.max(Date.now(), cart.updatedAt.getTime() + 1)) } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ok: true, cleared };
  } catch {
    // A concurrent cart write wins over destructive cleanup; the next visit can
    // retry after a serialization conflict without losing the new cart.
    return { ok: false };
  }
}

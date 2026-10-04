import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { marketingVersion, recordConsent } from "@/lib/consent-log";
import { clearGuestCart, getCartLines } from "@/lib/cart/server";
import { allowAccountMail, issueAuthToken } from "@/lib/auth-tokens";
import { sendVerifyAccountEmail } from "@/lib/email/mailer";
import { currentCartVersion, getOrderReceipt } from "./access";
import { cartDigest } from "./access-token";

const paidStatuses = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
const orderNumberSchema = z.string().min(1).max(80);
const claimSchema = z.object({ orderNumber: orderNumberSchema, password: z.string().min(8).max(72) });

type SubscriberReader = Pick<Prisma.TransactionClient, "subscriber">;

/**
 * The newsletter consent a purchaser account may carry. Order.marketingOptIn
 * records only the request made on the checkout box; the consent itself is
 * the double opt-in, so the account opts in only while a CONFIRMED Subscriber
 * exists for the address. A pending or withdrawn subscription yields false.
 */
async function confirmedSubscription(client: SubscriberReader, email: string) {
  const subscriber = await client.subscriber.findUnique({ where: { email }, select: { id: true, status: true } });
  return { subscriber, confirmed: subscriber?.status === "CONFIRMED" };
}

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
      // already owns. Do not change its password or email.
      const linked = await db.user.findUnique({ where: { id: userId } });
      if (!linked || linked.email.toLowerCase() !== email || linked.emailVerified) return { ok: false, error: "email_taken" };
      // The activation snapshot is read from this row: a subscription withdrawn (or never confirmed) since the
      // account was created must not come back on verification. The flag is only ever lowered here, and logged.
      if (linked.marketingOptIn) {
        await db.$transaction(async (tx) => {
          const { subscriber, confirmed } = await confirmedSubscription(tx, email);
          if (confirmed) return;
          const lowered = await tx.user.updateMany({ where: { id: linked.id, emailVerified: null, marketingOptIn: true }, data: { marketingOptIn: false } });
          if (lowered.count !== 1) return;
          await recordConsent(tx, {
            userId: linked.id, kind: "marketing-register", version: marketingVersion("marketing-checkout"),
            choices: {
              marketing: false, previous: true, source: "post-purchase-resend", orderNumber: order.number,
              subscriberStatus: subscriber?.status ?? "none", ...(subscriber ? { subscriberId: subscriber.id } : {}),
            },
          });
        });
      }
    } else {
      if (await db.user.findUnique({ where: { email } })) return { ok: false, error: "email_taken" };
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      userId = await db.$transaction(async (tx) => {
        const { subscriber, confirmed } = await confirmedSubscription(tx, email);
        const user = await tx.user.create({
          data: {
            email, passwordHash, role: "CUSTOMER",
            name: (order.shippingAddress as { fullName?: string } | null)?.fullName ?? null,
            marketingOptIn: confirmed,
          },
        });
        const claimed = await tx.order.updateMany({
          where: { id: order.id, userId: null, status: { in: [...paidStatuses] } },
          data: { userId: user.id },
        });
        if (claimed.count !== 1) throw new Error("order_already_claimed");
        // The request was made on the checkout box, so the row carries that wording's version; the recorded
        // value is the confirmed double opt-in, with the box's request kept beside it.
        await recordConsent(tx, {
          userId: user.id, kind: "marketing-register", version: marketingVersion("marketing-checkout"),
          choices: {
            marketing: confirmed, requested: order.marketingOptIn, source: "post-purchase", orderNumber: order.number,
            subscriberStatus: subscriber?.status ?? "none", ...(subscriber ? { subscriberId: subscriber.id } : {}),
          },
        });
        return user.id;
      });
    }
    // the same per-address budget as registration and reset mails (QA 2026-10-03 t3 N2)
    if (!allowAccountMail("VERIFY_EMAIL", email)) return { ok: true };
    const token = await issueAuthToken(userId, "VERIFY_EMAIL");
    // activation does not confirm marketing here: the checkout box went through its own double opt-in
    await sendVerifyAccountEmail(email, token, { newsletter: false });
    return { ok: true };
  } catch (error) {
    // SMTP errors can quote the recipient address: log the error class only.
    console.error("post-purchase account activation failed", error instanceof Error ? error.name : "unknown");
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
  // The account's owner who paid on another device (resumed from /racun) has no receipt there,
  // but the account cart is the same one: it may be cleared when it still holds exactly the
  // purchased lines (QA 2026-10-03 T3-05). Without a receipt nothing else qualifies.
  const ownerElsewhere = !receipt && principal !== null && order.userId === principal;
  if (!ownerElsewhere && (!receipt || !receipt.allowCartClear || receipt.principal !== principal)) return { ok: false };
  if (order.cartClearedAt) return { ok: true, cleared: false };
  const purchased = order.items.flatMap((item) => item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : []);
  const expectedDigest = cartDigest(purchased);

  if (!principal) {
    if (!receipt) return { ok: false };
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
      if (!cart) return false;
      if (receipt) {
        if (`${cart.id}:${cart.updatedAt.toISOString()}` !== receipt.cartVersion ||
            cartDigest(cart.items) !== receipt.cartDigest || receipt.cartDigest !== expectedDigest) return false;
      } else if (cartDigest(cart.items) !== expectedDigest) {
        // owner on another device: only a cart that is exactly what was bought
        return false;
      }
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

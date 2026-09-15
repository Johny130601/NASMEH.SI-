import { randomBytes } from "node:crypto";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { sendSubscriptionVerification } from "@/lib/email/mailer";

/**
 * Checkout newsletter opt-in → the same double opt-in as the footer form
 * (spec §13.1): a ticked box arms a PENDING Subscriber with source "checkout"
 * inside the order transaction, and the verification mail goes out after
 * commit, off the order response. A CONFIRMED subscriber is never touched or
 * re-mailed; a PENDING one keeps its token, so an earlier mail's link stays
 * valid and only the mail is sent again. Every write is conditional on the
 * status it was read with, so a confirmation or withdrawal committed in
 * between is never overwritten.
 */

export type CheckoutSubscription =
  | { status: "pending-confirmation"; subscriberId: string; token: string }
  | { status: "already-confirmed"; subscriberId: string; token: null };

type SubscriberClient = Pick<Prisma.TransactionClient, "subscriber">;

/** Each lost race re-reads the row; three changes of state inside one order transaction do not happen in practice. */
const MAX_ATTEMPTS = 3;

export async function requestCheckoutSubscription(client: SubscriberClient, rawEmail: string): Promise<CheckoutSubscription> {
  const email = rawEmail.trim().toLowerCase();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const existing = await client.subscriber.findUnique({ where: { email }, select: { id: true, status: true, confirmToken: true } });

    if (!existing) {
      const token = randomBytes(24).toString("hex");
      // INSERT … ON CONFLICT DO NOTHING: a concurrent insert for the same address yields no row instead of a
      // unique-constraint error, which would abort the surrounding order transaction.
      const [created] = await client.subscriber.createManyAndReturn({
        data: [{ email, confirmToken: token, source: "checkout" }],
        skipDuplicates: true,
        select: { id: true },
      });
      if (created) return { status: "pending-confirmation", subscriberId: created.id, token };
      continue;
    }

    if (existing.status === "CONFIRMED") return { status: "already-confirmed", subscriberId: existing.id, token: null };

    if (existing.status === "PENDING") {
      // A no-op write that holds the row lock until the order commits: the token is still the live one when
      // the mail goes out, and a confirmation or withdrawal that won the race is re-read instead.
      const held = await client.subscriber.updateMany({
        where: { id: existing.id, status: "PENDING", confirmToken: existing.confirmToken },
        data: { updatedAt: new Date() },
      });
      if (held.count === 1) return { status: "pending-confirmation", subscriberId: existing.id, token: existing.confirmToken };
      continue;
    }

    // UNSUBSCRIBED: ticking the box is a new request, armed with a fresh token.
    const token = randomBytes(24).toString("hex");
    const rearmed = await client.subscriber.updateMany({
      where: { id: existing.id, status: "UNSUBSCRIBED" },
      data: { status: "PENDING", confirmToken: token, confirmedAt: null, source: "checkout" },
    });
    if (rearmed.count === 1) return { status: "pending-confirmation", subscriberId: existing.id, token };
  }
  throw new Error("checkout_subscription_contended");
}

/** After commit only; a failed send is logged and never fails the placed order. */
export async function sendCheckoutSubscriptionMail(email: string, subscription: CheckoutSubscription | null): Promise<boolean> {
  if (!subscription?.token) return false;
  try {
    // Same call shape as the footer action: the subscriber id signs the unsubscribe link in the mail.
    await sendSubscriptionVerification(email.trim().toLowerCase(), subscription.token, subscription.subscriberId);
    return true;
  } catch (error) {
    console.error("checkout newsletter verification failed", error instanceof Error ? error.name : "unknown");
    return false;
  }
}

/**
 * Sends the verification without holding the caller: inside a request it runs
 * after the response (`after`), elsewhere as a detached promise. Either way
 * the send's own catch keeps a failure out of the order result.
 */
export function scheduleCheckoutSubscriptionMail(email: string, subscription: CheckoutSubscription | null): void {
  if (!subscription?.token) return;
  const task = () => sendCheckoutSubscriptionMail(email, subscription);
  try {
    after(task);
  } catch {
    // `after` throws outside a request scope (scripts, unit tests).
    void task();
  }
}

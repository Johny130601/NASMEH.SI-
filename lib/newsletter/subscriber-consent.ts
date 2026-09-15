import type { Prisma, Subscriber } from "@prisma/client";
import { marketingVersion, recordConsent } from "@/lib/consent-log";

/**
 * Newsletter consent state changes and their ConsentLog rows (GDPR Art. 7(1)
 * and 7(3)). Every status flip is a conditional `updateMany`, and the log row
 * is written only when exactly one row changed, so repeated clicks, link
 * scanners racing a person and concurrent requests never duplicate history.
 * Rows carry the subscriber id (and the account id when a verified account
 * owns the address) so a grant and its withdrawal can be tied together.
 */

type Tx = Pick<Prisma.TransactionClient, "subscriber" | "user" | "consentLog">;

/** Sign-up surfaces the public newsletter action accepts (checkout arms its own rows). */
export const NEWSLETTER_SOURCES = ["footer", "welcome-popup"] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

/** Where a withdrawal came from. */
export type NewsletterWithdrawalSource = "unsubscribe-link" | "account-preference";

/** Version of the wording the subscriber agreed to: the checkout box or the newsletter form note. */
export function newsletterConsentVersion(source: string): string {
  return marketingVersion(source === "checkout" ? "marketing-checkout" : "marketing-email");
}

/** The account that provably owns the address (verified e-mail), if any. */
export async function verifiedAccountId(tx: Pick<Prisma.TransactionClient, "user">, email: string): Promise<string | null> {
  const user = await tx.user.findFirst({
    where: { email: email.trim().toLowerCase(), emailVerified: { not: null } },
    select: { id: true },
  });
  return user?.id ?? null;
}

export type ConfirmOutcome = { status: "confirmed"; subscriberId: string } | { status: "invalid" };

/** Double opt-in: PENDING → CONFIRMED for the token, logged once. */
export async function confirmSubscriberInTx(tx: Tx, confirmToken: string): Promise<ConfirmOutcome> {
  const subscriber = await tx.subscriber.findUnique({ where: { confirmToken } });
  if (!subscriber || subscriber.status === "UNSUBSCRIBED") return { status: "invalid" };
  if (subscriber.status === "CONFIRMED") return { status: "confirmed", subscriberId: subscriber.id };

  const changed = await tx.subscriber.updateMany({
    where: { id: subscriber.id, confirmToken, status: "PENDING" },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });
  if (changed.count !== 1) {
    // Another request won the flip; only a confirmed row counts as success.
    const current = await tx.subscriber.findUnique({ where: { id: subscriber.id }, select: { status: true } });
    return current?.status === "CONFIRMED" ? { status: "confirmed", subscriberId: subscriber.id } : { status: "invalid" };
  }
  await recordConsent(tx, {
    kind: "marketing-email",
    version: newsletterConsentVersion(subscriber.source),
    userId: await verifiedAccountId(tx, subscriber.email),
    choices: { marketing: true, doubleOptIn: true, source: subscriber.source, subscriberId: subscriber.id },
  });
  return { status: "confirmed", subscriberId: subscriber.id };
}

/** PENDING/CONFIRMED → UNSUBSCRIBED, logged once; false when nothing changed. */
export async function withdrawSubscriberInTx(
  tx: Tx,
  subscriber: Pick<Subscriber, "id" | "status" | "source">,
  source: NewsletterWithdrawalSource,
  userId: string | null,
): Promise<boolean> {
  const changed = await tx.subscriber.updateMany({
    where: { id: subscriber.id, status: { in: ["PENDING", "CONFIRMED"] } },
    data: { status: "UNSUBSCRIBED" },
  });
  if (changed.count !== 1) return false;
  await recordConsent(tx, {
    kind: "marketing-email",
    version: newsletterConsentVersion(subscriber.source),
    userId,
    choices: {
      marketing: false, withdrawn: true, previousStatus: subscriber.status, source, subscriberId: subscriber.id,
    },
  });
  return true;
}

/** What the /odjava-novice link shows: a bad link, the withdraw button, or the done state. */
export type UnsubscribeLinkState = "invalid" | "confirm" | "done";

/**
 * The done state is true only when nothing on the address still receives
 * e-novice: the Subscriber is UNSUBSCRIBED and no verified account on the same
 * address has the marketing opt-in (it can be switched back on in the account
 * without touching the Subscriber). Otherwise the link offers the withdrawal,
 * whose action clears both.
 */
export async function unsubscribeLinkState(
  client: Pick<Prisma.TransactionClient, "subscriber" | "user">,
  subscriberId: string | null,
): Promise<UnsubscribeLinkState> {
  if (!subscriberId) return "invalid";
  const subscriber = await client.subscriber.findUnique({
    where: { id: subscriberId },
    select: { status: true, email: true },
  });
  if (!subscriber) return "invalid";
  if (subscriber.status !== "UNSUBSCRIBED") return "confirm";
  const optedIn = await client.user.findFirst({
    where: { email: subscriber.email.trim().toLowerCase(), emailVerified: { not: null }, marketingOptIn: true },
    select: { id: true },
  });
  return optedIn ? "confirm" : "done";
}

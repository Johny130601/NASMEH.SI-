"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendSubscriptionVerification } from "@/lib/email/mailer";
import { marketingVersion, recordConsent } from "@/lib/consent-log";
import { verifyNewsletterUnsubscribeToken } from "@/lib/newsletter/unsubscribe-token";
import {
  NEWSLETTER_SOURCES,
  confirmSubscriberInTx,
  verifiedAccountId,
  withdrawSubscriberInTx,
  type NewsletterSource,
} from "@/lib/newsletter/subscriber-consent";
import { newsletter as copy } from "@/lib/copy";

export interface NewsletterResult {
  ok: boolean;
  message: string;
}

/**
 * Footer / welcome-popup capture → double opt-in (spec §13.1): a
 * Turnstile-verified submit creates/re-arms a PENDING Subscriber for the
 * surface it came from and sends the verification email. Response is uniform
 * to avoid address enumeration. Same write scheme as the checkout box
 * (lib/orders/checkout-subscription.ts): a CONFIRMED subscriber is never
 * touched, a PENDING one keeps its token (an earlier mail's link stays valid),
 * and every write is conditional on the status it was read with, so a
 * confirmation or withdrawal committed in between is never overwritten.
 */
export async function subscribeNewsletterAction(input: {
  email: string;
  turnstileToken: string;
  source: NewsletterSource;
}): Promise<NewsletterResult> {
  const emailParsed = z.email().safeParse(input.email?.trim().toLowerCase());
  if (!emailParsed.success) {
    return { ok: false, message: copy.invalidEmail };
  }
  const source = z.enum(NEWSLETTER_SOURCES).safeParse(input.source);
  if (!source.success) {
    return { ok: false, message: copy.genericError };
  }

  const token = z.string().max(2048).default("").safeParse(input.turnstileToken);
  const human = await verifyTurnstile(token.success ? token.data : "");
  if (!human) {
    return { ok: false, message: copy.botCheckFailed };
  }

  const email = emailParsed.data;
  try {
    const armed = await armSubscriber(email, source.data);
    if (armed) await sendSubscriptionVerification(email, armed.token, armed.subscriberId);
    return { ok: true, message: copy.success };
  } catch (error) {
    console.error("newsletter subscribe failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, message: copy.genericError };
  }
}

/** Each lost race re-reads the row. */
const MAX_ARM_ATTEMPTS = 3;

/**
 * The pending request records the surface it came from; the confirmation log
 * row carries it (and that surface's wording version). Null: already confirmed.
 */
async function armSubscriber(email: string, source: NewsletterSource): Promise<{ subscriberId: string; token: string } | null> {
  for (let attempt = 0; attempt < MAX_ARM_ATTEMPTS; attempt += 1) {
    const existing = await db.subscriber.findUnique({ where: { email }, select: { id: true, status: true, confirmToken: true } });
    if (!existing) {
      const token = crypto.randomBytes(24).toString("hex");
      // INSERT ... ON CONFLICT DO NOTHING: a concurrent insert yields no row and is re-read.
      const [created] = await db.subscriber.createManyAndReturn({
        data: [{ email, confirmToken: token, source }], skipDuplicates: true, select: { id: true },
      });
      if (created) return { subscriberId: created.id, token };
      continue;
    }
    if (existing.status === "CONFIRMED") return null;
    if (existing.status === "PENDING") {
      const kept = await db.subscriber.updateMany({
        where: { id: existing.id, status: "PENDING", confirmToken: existing.confirmToken }, data: { source },
      });
      if (kept.count === 1) return { subscriberId: existing.id, token: existing.confirmToken };
      continue;
    }
    // UNSUBSCRIBED: a new request, armed with a fresh token.
    const token = crypto.randomBytes(24).toString("hex");
    const rearmed = await db.subscriber.updateMany({
      where: { id: existing.id, status: "UNSUBSCRIBED" },
      data: { status: "PENDING", confirmToken: token, confirmedAt: null, source },
    });
    if (rearmed.count === 1) return { subscriberId: existing.id, token };
  }
  throw new Error("newsletter_subscription_contended");
}

export interface TokenActionResult { ok: boolean; error?: string }

const confirmSchema = z.object({
  token: z.string().trim().min(1).max(128),
  turnstileToken: z.string().max(2048).default(""),
});

/**
 * Explicit POST confirmation (GDPR Art. 7(1)): the /potrdi link only renders
 * this form, so mail scanners and link previews never confirm a subscription.
 */
export async function confirmNewsletterAction(input: unknown): Promise<TokenActionResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.confirm.bodyInvalid };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheckFailed };
  try {
    const outcome = await db.$transaction((tx) => confirmSubscriberInTx(tx, parsed.data.token));
    return outcome.status === "confirmed" ? { ok: true } : { ok: false, error: copy.confirm.bodyInvalid };
  } catch (error) {
    console.error("newsletter confirmation failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: copy.confirm.genericError };
  }
}

const unsubscribeSchema = z.object({ token: z.string().trim().min(1).max(128) });

/**
 * Withdrawal (GDPR Art. 7(3)) from the signed /odjava-novice link: the
 * Subscriber turns UNSUBSCRIBED and a verified account on the same address
 * stops receiving e-novice too, each change logged once. Idempotent; no bot
 * check, so withdrawing stays as easy as the link itself.
 */
export async function unsubscribeNewsletterAction(input: unknown): Promise<TokenActionResult> {
  const parsed = unsubscribeSchema.safeParse(input);
  const subscriberId = parsed.success ? verifyNewsletterUnsubscribeToken(parsed.data.token, getEnv().AUTH_SECRET) : null;
  if (!subscriberId) return { ok: false, error: copy.unsubscribe.bodyInvalid };
  try {
    const found = await db.$transaction(async (tx) => {
      const subscriber = await tx.subscriber.findUnique({ where: { id: subscriberId } });
      if (!subscriber) return false;
      const userId = await verifiedAccountId(tx, subscriber.email);
      await withdrawSubscriberInTx(tx, subscriber, "unsubscribe-link", userId);
      if (userId) {
        const optedOut = await tx.user.updateMany({ where: { id: userId, marketingOptIn: true }, data: { marketingOptIn: false } });
        if (optedOut.count === 1) {
          await recordConsent(tx, {
            kind: "marketing-preference",
            version: marketingVersion("marketing-preference"),
            userId,
            choices: { marketing: false, previous: true, source: "newsletter-unsubscribe", subscriberId: subscriber.id },
          });
        }
      }
      return true;
    });
    return found ? { ok: true } : { ok: false, error: copy.unsubscribe.bodyInvalid };
  } catch (error) {
    console.error("newsletter unsubscribe failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: copy.unsubscribe.genericError };
  }
}

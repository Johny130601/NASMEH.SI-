"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { requestClientAddress } from "@/lib/client-address";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendBackInStockVerification } from "@/lib/email/mailer";
import { verifyUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";
import { marketingVersion, recordConsent } from "@/lib/consent-log";
import { verifiedAccountId } from "@/lib/newsletter/subscriber-consent";
import { backInStock as copy } from "@/lib/copy";

export interface BackInStockResult {
  ok: boolean;
  message: string;
}

/**
 * The public Turnstile site key for the sold-out capture form. The form sits in
 * client components on the product, catalog and cart pages that only receive
 * the e2e test token, so it asks for the key when it opens; the key is read
 * at runtime like everywhere else (never inlined at build time).
 */
export async function backInStockChallengeAction(): Promise<{ siteKey: string | null }> {
  return { siteKey: getEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null };
}

/**
 * Verification-mail flood control: the challenge alone let a solver mail a
 * third party's inbox at solve rate. Bounded per client (a shared NAT and the
 * e2e suite must still pass) and per address, where only a mail counts.
 */
const CAPTURE_LIMIT = { perClient: 60, perEmail: 3, windowMs: 60 * 60_000 } as const;
/** A submit this soon after the last one is not re-mailed: the first link is still live. */
const RESEND_COOLDOWN_MS = 5 * 60_000;

/**
 * Sold-out capture (spec §5/§6): Turnstile-verified submit stores a PENDING
 * BackInStockSubscription and sends the double opt-in verification email.
 * A confirmed address is not asked to confirm again: an un-notified one is a
 * no-op, an already-notified one is re-armed for the next restock (§13.1).
 * The answer is the same for every outcome — whether an address already holds
 * a confirmed alert for a product is that person's data, and anyone can type
 * anyone's address here. Alerts themselves are sent by lib/jobs/restock-alerts
 * once stock returns.
 */
export async function subscribeBackInStockAction(input: {
  email: string;
  productSlug: string;
  turnstileToken: string;
}): Promise<BackInStockResult> {
  const emailParsed = z.email().safeParse(input.email?.trim().toLowerCase());
  if (!emailParsed.success) {
    return { ok: false, message: copy.invalidEmail };
  }

  const shape = z.object({
    productSlug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    turnstileToken: z.string().max(2048).default(""),
  }).safeParse(input);
  if (!shape.success) {
    return { ok: false, message: copy.genericError };
  }

  const human = await verifyTurnstile(shape.data.turnstileToken);
  if (!human) {
    return { ok: false, message: copy.botCheckFailed };
  }

  const email = emailParsed.data;
  const client = await requestClientAddress();
  // Over the limit reads exactly like a normal submit: the answer never says a limit exists.
  if (!checkRateLimit(`restock-capture:${client}`, CAPTURE_LIMIT.perClient, CAPTURE_LIMIT.windowMs).allowed) {
    return { ok: true, message: copy.success };
  }

  try {
    const product = await db.product.findUnique({
      where: { slug: shape.data.productSlug },
      include: { variants: { take: 1, orderBy: { priceCents: "asc" } } },
    });
    if (!product) {
      return { ok: false, message: copy.genericError };
    }

    const armed = await armBackInStock(email, product.id, product.variants[0]?.id ?? null);
    if (armed && checkRateLimit(`restock-capture-email:${email}`, CAPTURE_LIMIT.perEmail, CAPTURE_LIMIT.windowMs).allowed) {
      await sendBackInStockVerification(email, armed.token, product.title);
    }
    return { ok: true, message: copy.success };
  } catch (error) {
    console.error("back-in-stock subscribe failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, message: copy.genericError };
  }
}

/** Each lost race re-reads the row. */
const MAX_ARM_ATTEMPTS = 3;

/**
 * Same write scheme as the newsletter capture and the checkout box: every write
 * is conditional on the status and token the row was read with, so a
 * confirmation or a withdrawal committed in between is re-read instead of
 * overwritten. A PENDING row keeps its token — reissuing it killed the first
 * mail's link — and only an UNSUBSCRIBED row is armed afresh.
 * Null: nothing to confirm, so no mail.
 */
async function armBackInStock(
  email: string,
  productId: string,
  variantId: string | null,
): Promise<{ token: string } | null> {
  for (let attempt = 0; attempt < MAX_ARM_ATTEMPTS; attempt += 1) {
    const existing = await db.backInStockSubscription.findUnique({
      where: { email_productId: { email, productId } },
      select: { id: true, status: true, confirmToken: true, notifiedAt: true, updatedAt: true },
    });
    if (!existing) {
      const token = crypto.randomBytes(24).toString("hex");
      // INSERT ... ON CONFLICT DO NOTHING: a concurrent insert yields no row and is re-read.
      const [created] = await db.backInStockSubscription.createManyAndReturn({
        data: [{ email, productId, variantId, confirmToken: token }], skipDuplicates: true, select: { id: true },
      });
      if (created) return { token };
      continue;
    }

    if (existing.status === "CONFIRMED") {
      // Un-notified: already armed, nothing to do. Notified: re-armed for the next restock (§13.1).
      if (!existing.notifiedAt) return null;
      const rearmed = await db.backInStockSubscription.updateMany({
        where: { id: existing.id, status: "CONFIRMED" },
        data: {
          notifiedAt: null, alertPendingSince: null, alertLeaseUntil: null,
          alertLeaseToken: null, alertLastError: null, variantId,
        },
      });
      if (rearmed.count === 1) return null;
      continue;
    }

    if (existing.status === "PENDING") {
      // A double click or a retry: the live mail is enough, and its link stays valid.
      if (Date.now() - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS) return null;
      const kept = await db.backInStockSubscription.updateMany({
        where: { id: existing.id, status: "PENDING", confirmToken: existing.confirmToken }, data: { variantId },
      });
      if (kept.count === 1) return { token: existing.confirmToken };
      continue;
    }

    // UNSUBSCRIBED: a new request, armed with a fresh token.
    const token = crypto.randomBytes(24).toString("hex");
    const rearmed = await db.backInStockSubscription.updateMany({
      where: { id: existing.id, status: "UNSUBSCRIBED" },
      data: {
        status: "PENDING", confirmToken: token, confirmedAt: null, notifiedAt: null,
        alertPendingSince: null, alertLeaseUntil: null, alertLeaseToken: null, variantId,
      },
    });
    if (rearmed.count === 1) return { token };
  }
  throw new Error("back_in_stock_subscription_contended");
}

export interface BackInStockTokenResult { ok: boolean; error?: string }

const confirmSchema = z.object({
  token: z.string().trim().min(1).max(128),
  turnstileToken: z.string().max(2048).default(""),
});

/**
 * Explicit POST confirmation of a restock alert: the /potrdi-zalogo link only
 * renders this form. The flip is conditional and the log row is written only
 * when this request changed the row. The alert is transactional, never a
 * marketing opt-in (see the note next to the capture form).
 */
export async function confirmBackInStockAction(input: unknown): Promise<BackInStockTokenResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.confirm.bodyInvalid };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheckFailed };
  const confirmToken = parsed.data.token;
  try {
    const confirmed = await db.$transaction(async (tx) => {
      const subscription = await tx.backInStockSubscription.findUnique({
        where: { confirmToken }, include: { product: { select: { slug: true } } },
      });
      if (!subscription || subscription.status === "UNSUBSCRIBED") return false;
      if (subscription.status === "CONFIRMED") return true;
      const changed = await tx.backInStockSubscription.updateMany({
        where: { id: subscription.id, confirmToken, status: "PENDING" },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
      if (changed.count !== 1) {
        const current = await tx.backInStockSubscription.findUnique({ where: { id: subscription.id }, select: { status: true } });
        return current?.status === "CONFIRMED";
      }
      await recordConsent(tx, {
        kind: "back-in-stock",
        version: marketingVersion("back-in-stock"),
        userId: await verifiedAccountId(tx, subscription.email),
        choices: {
          marketing: false, productSlug: subscription.product.slug, subscriptionId: subscription.id, source: subscription.source,
        },
      });
      return true;
    });
    return confirmed ? { ok: true } : { ok: false, error: copy.confirm.bodyInvalid };
  } catch (error) {
    console.error("back-in-stock confirmation failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: copy.confirm.genericError };
  }
}

const unsubscribeSchema = z.object({ token: z.string().trim().min(1).max(128) });

/**
 * Restock-alert unsubscribe from the signed /odjava-zaloga link (§13.1):
 * POST only, idempotent, logged once. No bot check.
 */
export async function unsubscribeBackInStockAction(input: unknown): Promise<BackInStockTokenResult> {
  const parsed = unsubscribeSchema.safeParse(input);
  const subscriptionId = parsed.success ? verifyUnsubscribeToken(parsed.data.token, getEnv().AUTH_SECRET) : null;
  if (!subscriptionId) return { ok: false, error: copy.unsubscribe.bodyInvalid };
  try {
    const found = await db.$transaction(async (tx) => {
      const subscription = await tx.backInStockSubscription.findUnique({
        where: { id: subscriptionId }, include: { product: { select: { slug: true } } },
      });
      if (!subscription) return false;
      const changed = await tx.backInStockSubscription.updateMany({
        where: { id: subscription.id, status: { in: ["PENDING", "CONFIRMED"] } },
        data: { status: "UNSUBSCRIBED", alertPendingSince: null, alertLeaseUntil: null, alertLeaseToken: null },
      });
      if (changed.count === 1) {
        await recordConsent(tx, {
          kind: "back-in-stock",
          version: marketingVersion("back-in-stock"),
          userId: await verifiedAccountId(tx, subscription.email),
          choices: {
            unsubscribed: true, previousStatus: subscription.status, productSlug: subscription.product.slug,
            subscriptionId: subscription.id, source: "unsubscribe-link",
          },
        });
      }
      return true;
    });
    return found ? { ok: true } : { ok: false, error: copy.unsubscribe.bodyInvalid };
  } catch (error) {
    console.error("back-in-stock unsubscribe failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: copy.unsubscribe.genericError };
  }
}

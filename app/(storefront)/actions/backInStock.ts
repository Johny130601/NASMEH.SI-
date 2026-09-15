"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
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
 * Sold-out capture (spec §5/§6): Turnstile-verified submit stores a PENDING
 * BackInStockSubscription and sends the double opt-in verification email.
 * A confirmed address is not asked to confirm again: an un-notified one is a
 * no-op, an already-notified one is re-armed for the next restock (§13.1).
 * Alerts themselves are sent by lib/jobs/restock-alerts once stock returns.
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

  try {
    const product = await db.product.findUnique({
      where: { slug: shape.data.productSlug },
      include: { variants: { take: 1, orderBy: { priceCents: "asc" } } },
    });
    if (!product) {
      return { ok: false, message: copy.genericError };
    }

    const email = emailParsed.data;
    const variantId = product.variants[0]?.id ?? null;
    const existing = await db.backInStockSubscription.findUnique({
      where: { email_productId: { email, productId: product.id } },
    });
    if (existing?.status === "CONFIRMED") {
      if (existing.notifiedAt) {
        await db.backInStockSubscription.update({
          where: { id: existing.id },
          data: {
            notifiedAt: null, alertPendingSince: null, alertLeaseUntil: null,
            alertLeaseToken: null, alertLastError: null, variantId,
          },
        });
      }
      return { ok: true, message: copy.alreadyActive };
    }

    const token = crypto.randomBytes(24).toString("hex");
    await db.backInStockSubscription.upsert({
      where: { email_productId: { email, productId: product.id } },
      update: {
        status: "PENDING",
        confirmToken: token,
        confirmedAt: null,
        notifiedAt: null,
        alertPendingSince: null,
        alertLeaseUntil: null,
        alertLeaseToken: null,
        variantId,
      },
      create: {
        email,
        productId: product.id,
        variantId,
        confirmToken: token,
      },
    });

    await sendBackInStockVerification(email, token, product.title);
    return { ok: true, message: copy.success };
  } catch (error) {
    console.error("back-in-stock subscribe failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, message: copy.genericError };
  }
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

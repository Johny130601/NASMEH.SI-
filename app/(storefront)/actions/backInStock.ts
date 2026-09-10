"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendBackInStockVerification } from "@/lib/email/mailer";
import { backInStock as copy } from "@/lib/copy";

export interface BackInStockResult {
  ok: boolean;
  message: string;
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

  const human = await verifyTurnstile(input.turnstileToken);
  if (!human) {
    return { ok: false, message: copy.botCheckFailed };
  }

  try {
    const product = await db.product.findUnique({
      where: { slug: input.productSlug },
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
    console.error("back-in-stock subscribe failed", error);
    return { ok: false, message: copy.genericError };
  }
}

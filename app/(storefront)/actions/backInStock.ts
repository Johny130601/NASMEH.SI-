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
 * Alert SENDING on restock completes in Phase 6 — storage only here.
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
    const token = crypto.randomBytes(24).toString("hex");
    await db.backInStockSubscription.upsert({
      where: { email_productId: { email, productId: product.id } },
      update: {
        status: "PENDING",
        confirmToken: token,
        confirmedAt: null,
        variantId: product.variants[0]?.id ?? null,
      },
      create: {
        email,
        productId: product.id,
        variantId: product.variants[0]?.id ?? null,
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

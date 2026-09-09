"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendSubscriptionVerification } from "@/lib/email/mailer";
import { newsletter as copy } from "@/lib/copy";

export interface NewsletterResult {
  ok: boolean;
  message: string;
}

/**
 * Footer capture → double opt-in (spec §13.1): Turnstile-verified submit
 * creates/re-arms a PENDING Subscriber and sends the verification email.
 * Response is uniform to avoid address enumeration.
 */
export async function subscribeNewsletterAction(input: {
  email: string;
  turnstileToken: string;
}): Promise<NewsletterResult> {
  const emailParsed = z.email().safeParse(input.email?.trim().toLowerCase());
  if (!emailParsed.success) {
    return { ok: false, message: copy.invalidEmail };
  }

  const human = await verifyTurnstile(input.turnstileToken);
  if (!human) {
    return { ok: false, message: copy.botCheckFailed };
  }

  const email = emailParsed.data;
  try {
    const existing = await db.subscriber.findUnique({ where: { email } });
    if (existing?.status === "CONFIRMED") {
      return { ok: true, message: copy.success };
    }

    const token = crypto.randomBytes(24).toString("hex");
    await db.subscriber.upsert({
      where: { email },
      update: {
        status: "PENDING",
        confirmToken: token,
        confirmedAt: null,
        source: "footer",
      },
      create: { email, confirmToken: token, source: "footer" },
    });

    await sendSubscriptionVerification(email, token);
    return { ok: true, message: copy.success };
  } catch (error) {
    console.error("newsletter subscribe failed", error);
    return { ok: false, message: copy.genericError };
  }
}

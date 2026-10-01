"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { marketingVersion, recordConsent } from "@/lib/consent-log";
import { withdrawSubscriberInTx } from "@/lib/newsletter/subscriber-consent";
import { deleteAddressForUser, saveAddressForUser, setDefaultAddressForUser, type AddressResult } from "@/lib/account/addresses";
import { isValidPhone, PHONE_MAX_LENGTH } from "@/lib/phone";

/** The address-book phone follows the one customer phone rule (lib/phone.ts), as the checkout does (QA T3-A1). */
const addressPhoneSchema = z.object({
  phone: z.string().trim().max(PHONE_MAX_LENGTH).refine(value => value === "" || isValidPhone(value)).nullish(),
});

export interface AddressActionResult { ok: boolean; error?: AddressResult["error"] | "invalid_phone" }

export async function saveAddressAction(input: unknown): Promise<AddressActionResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false };
  const phone = addressPhoneSchema.safeParse(input);
  if (!phone.success && phone.error.issues.some(issue => issue.path[0] === "phone")) return { ok: false, error: "invalid_phone" };
  try { return await saveAddressForUser(userId, input); }
  catch { return { ok: false, error: "failed" }; }
}

export async function deleteAddressAction(input: unknown): Promise<AddressResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false };
  try { return await deleteAddressForUser(userId, input); }
  catch { return { ok: false, error: "failed" }; }
}

export async function setDefaultAddressAction(input: unknown): Promise<AddressResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false };
  try { return await setDefaultAddressForUser(userId, input); }
  catch { return { ok: false, error: "failed" }; }
}

/**
 * A validated preference and its consent history are committed together.
 * Switching e-novice off also withdraws the newsletter subscription of the
 * account's address (GDPR Art. 7(3)), logged as its own row; switching on
 * never confirms a subscription (that stays the double opt-in's job).
 */
export async function updateMarketingPreferenceAction(input: unknown): Promise<AddressResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false };
  const parsed = z.object({ marketingOptIn: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    return await db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      if (!rows.length) return { ok: false, error: "not_found" };
      const { marketingOptIn } = parsed.data;
      const previous = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { marketingOptIn: true, email: true } });
      if (!marketingOptIn) {
        const subscriber = await tx.subscriber.findUnique({
          where: { email: previous.email.trim().toLowerCase() }, select: { id: true, status: true, source: true },
        });
        if (subscriber) await withdrawSubscriberInTx(tx, subscriber, "account-preference", userId);
      }
      if (previous.marketingOptIn === marketingOptIn) return { ok: true };
      await tx.user.update({ where: { id: userId }, data: { marketingOptIn } });
      await recordConsent(tx, {
        userId, kind: "marketing-preference", version: marketingVersion("marketing-preference"),
        choices: { marketing: marketingOptIn, previous: previous.marketingOptIn, source: "account" },
      });
      return { ok: true };
    });
  } catch { return { ok: false, error: "failed" }; }
}

"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteAddressForUser, saveAddressForUser, setDefaultAddressForUser, type AddressResult } from "@/lib/account/addresses";

export async function saveAddressAction(input: unknown): Promise<AddressResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false };
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

/** A validated preference and its consent history are committed together. */
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
      const previous = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { marketingOptIn: true } });
      if (previous.marketingOptIn === marketingOptIn) return { ok: true };
      await tx.user.update({ where: { id: userId }, data: { marketingOptIn } });
      await tx.consentLog.create({ data: {
        userId, kind: "marketing-preference", version: "1", choices: { marketing: marketingOptIn, previous: previous.marketingOptIn },
      } });
      return { ok: true };
    });
  } catch { return { ok: false, error: "failed" }; }
}

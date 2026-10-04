"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { signOut } from "@/lib/auth";
import { requireStaff } from "@/lib/admin/access";
import { regenerateRecoveryCodes } from "@/lib/admin/mfa";

/** New recovery codes for the signed-in member; requires a current TOTP code. */
export async function regenerateRecoveryCodesAction(
  input: { code: string },
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; reason: "invalid" | "rate_limited" }> {
  const staff = await requireStaff();
  const parsed = z.object({ code: z.string().trim().min(6).max(12) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return regenerateRecoveryCodes(staff.id, parsed.data.code);
}

/** Revokes every session of the signed-in member, this one included. */
export async function signOutEverywhereAction(): Promise<void> {
  const staff = await requireStaff();
  await db.user.update({ where: { id: staff.id }, data: { sessionVersion: { increment: 1 } } });
  await signOut({ redirectTo: "/prijava" });
}

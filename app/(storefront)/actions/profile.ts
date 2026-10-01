"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { newPasswordSchema } from "@/lib/auth-validation";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Name and password changes from /racun/podatki (QA T3-A1). Both act on the
 * signed-in account only; nothing identifies the account but the session.
 */
export type ProfileError = "invalid_name" | "wrong_password" | "weak_password" | "same_password" | "rate_limited" | "failed";
export interface ProfileResult { ok: boolean; error?: ProfileError }

/** The same bounds as registration (actions/auth.ts). */
const nameSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
});

export async function updateNameAction(input: unknown): Promise<ProfileResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false };
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_name" };
  try {
    await db.user.update({ where: { id: userId }, data: { name: `${parsed.data.firstName} ${parsed.data.lastName}` } });
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: newPasswordSchema,
});

/** Current-password guesses from a hijacked session are bounded per account. */
const PASSWORD_CHANGE_LIMIT = { attempts: 10, windowMs: 15 * 60_000 } as const;

/**
 * The current password proves the person at the keyboard; the new one ends
 * every session like the reset flow (`sessionVersion`). This session ends too:
 * sessions are issued at sign-in only (AGENTS §5.12), so the shopper signs in
 * again with the new password and the page says why.
 */
export async function changePasswordAction(input: unknown): Promise<ProfileResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false };
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.some(issue => issue.path[0] === "newPassword") ? "weak_password" : "wrong_password" };
  }
  if (!checkRateLimit(`password-change:${userId}`, PASSWORD_CHANGE_LIMIT.attempts, PASSWORD_CHANGE_LIMIT.windowMs).allowed) {
    return { ok: false, error: "rate_limited" };
  }
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user?.passwordHash || !await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)) {
      return { ok: false, error: "wrong_password" };
    }
    if (parsed.data.currentPassword === parsed.data.newPassword) return { ok: false, error: "same_password" };
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
  } catch {
    return { ok: false, error: "failed" };
  }
  // The session cookie is already void (its version is stale); clearing it keeps the browser tidy.
  try {
    await signOut({ redirect: false });
  } catch {
    // A failed clear leaves a cookie the server no longer accepts.
  }
  return { ok: true };
}

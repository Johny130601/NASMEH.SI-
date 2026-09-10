"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { STAFF_ROLES, type StaffRole } from "@/lib/admin/permissions";
import { resetTotp } from "@/lib/admin/mfa";
import { authEmailSchema } from "@/lib/auth-validation";

const staffRoleSchema = z.enum(STAFF_ROLES);
const userIdSchema = z.string().min(1).max(64);

export type TeamActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "self" | "not_found" };

/**
 * Adds a staff member: an existing account is promoted, a new one gets a
 * temporary password shown once. Either way the first login forces 2FA
 * enrolment (§14.15).
 */
export async function createStaffMemberAction(input: {
  name: string;
  email: string;
  role: StaffRole;
}): Promise<{ ok: true; created: boolean; role: StaffRole; temporaryPassword?: string } | { ok: false; error: "invalid" | "self" }> {
  const actor = await requirePermission("staff:manage");
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    email: authEmailSchema,
    role: staffRoleSchema,
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { name, email, role } = parsed.data;
  if (email === actor.email.toLowerCase()) return { ok: false, error: "self" };

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        role, name, staffInvitedAt: new Date(), emailVerified: new Date(),
        totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: Prisma.DbNull,
      },
    });
    revalidatePath("/admin/ekipa");
    return { ok: true, created: false, role };
  }
  const temporaryPassword = randomBytes(12).toString("base64url");
  await db.user.create({
    data: {
      email, name, role, staffInvitedAt: new Date(), emailVerified: new Date(),
      passwordHash: await bcrypt.hash(temporaryPassword, 10),
    },
  });
  revalidatePath("/admin/ekipa");
  return { ok: true, created: true, role, temporaryPassword };
}

/** Role change; CUSTOMER removes the member from the team and revokes sessions. */
export async function changeStaffRoleAction(input: { userId: string; role: StaffRole | "CUSTOMER" }): Promise<TeamActionResult> {
  const actor = await requirePermission("staff:manage");
  const parsed = z.object({ userId: userIdSchema, role: z.union([staffRoleSchema, z.literal("CUSTOMER")]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.userId === actor.id) return { ok: false, error: "self" };
  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!target) return { ok: false, error: "not_found" };
  await db.user.update({
    where: { id: target.id },
    data: parsed.data.role === "CUSTOMER"
      ? {
          role: "CUSTOMER", sessionVersion: { increment: 1 },
          totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: Prisma.DbNull,
        }
      : { role: parsed.data.role },
  });
  revalidatePath("/admin/ekipa");
  return { ok: true };
}

/** Bumps the session version: every JWT of that member stops validating. */
export async function revokeStaffSessionsAction(input: { userId: string }): Promise<TeamActionResult> {
  await requirePermission("staff:manage");
  const parsed = z.object({ userId: userIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const updated = await db.user.updateMany({ where: { id: parsed.data.userId }, data: { sessionVersion: { increment: 1 } } });
  if (updated.count !== 1) return { ok: false, error: "not_found" };
  revalidatePath("/admin/ekipa");
  return { ok: true };
}

/** Clears a member's authenticator; their sessions end and the next login enrols again. */
export async function resetStaffTotpAction(input: { userId: string }): Promise<TeamActionResult> {
  const actor = await requirePermission("staff:manage");
  const parsed = z.object({ userId: userIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.userId === actor.id) return { ok: false, error: "self" };
  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!target) return { ok: false, error: "not_found" };
  await resetTotp(target.id);
  await db.user.update({ where: { id: target.id }, data: { sessionVersion: { increment: 1 } } });
  revalidatePath("/admin/ekipa");
  return { ok: true };
}

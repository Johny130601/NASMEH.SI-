import { z } from "zod";

/** /koda/{CODE} scaffold constants (§7.2; redemption engine in Phase 4). */
export const KODA_COOKIE = "nasmeh_koda";
export const KODA_MAX_AGE_S = 60 * 60 * 24 * 30;

export const kodaCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,23}$/);

import { cookies } from "next/headers";
import { db } from "@/lib/db";

/**
 * Validate + store a coupon code in the session cookie (§7.2). Checks
 * format, existence and active flag; cart-dependent eligibility/discount is
 * evaluated at every read (server-side, lib/promo).
 */
export async function applyKodaCode(rawCode: string): Promise<{
  ok: boolean;
  code?: string;
}> {
  const parsed = kodaCodeSchema.safeParse(rawCode);
  if (!parsed.success) return { ok: false };

  const coupon = await db.coupon.findUnique({
    where: { code: parsed.data },
    select: { code: true, active: true },
  });
  if (!coupon || !coupon.active) return { ok: false };

  const jar = await cookies();
  jar.set(KODA_COOKIE, coupon.code, {
    maxAge: KODA_MAX_AGE_S,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true, code: coupon.code };
}

export async function readKodaCode(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(KODA_COOKIE)?.value ?? null;
}

export async function clearKodaCode(): Promise<void> {
  const jar = await cookies();
  jar.delete(KODA_COOKIE);
}

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { couponIsUnused, couponSchema, toCouponData, type CouponInput } from "@/lib/admin/coupons";
import { couponInvalidReason } from "@/lib/admin/coupons-schema";

export type CouponActionResult = { ok: true; id?: string } | { ok: false; error: "invalid" | "codeInvalid" | "emailsInvalid" | "not_found" | "codeTaken" | "used" };

const idSchema = z.string().min(1).max(64);

function codeTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function refresh(id?: string) {
  revalidatePath("/admin/kuponi");
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/kuponi/${id}`);
}

export async function createCouponAction(input: CouponInput): Promise<CouponActionResult> {
  await requirePermission("promos:manage");
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: couponInvalidReason(parsed.error.issues) };
  try {
    const coupon = await db.coupon.create({ data: toCouponData(parsed.data) });
    refresh(coupon.id);
    return { ok: true, id: coupon.id };
  } catch (error) {
    if (codeTaken(error)) return { ok: false, error: "codeTaken" };
    throw error;
  }
}

export async function saveCouponAction(input: { couponId: string; coupon: CouponInput }): Promise<CouponActionResult> {
  await requirePermission("promos:manage");
  const parsed = z.object({ couponId: idSchema, coupon: couponSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: couponInvalidReason(parsed.error.issues) };
  try {
    await db.coupon.update({ where: { id: parsed.data.couponId }, data: toCouponData(parsed.data.coupon) });
  } catch (error) {
    if (codeTaken(error)) return { ok: false, error: "codeTaken" };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { ok: false, error: "not_found" };
    throw error;
  }
  refresh(parsed.data.couponId);
  return { ok: true };
}

/** A coupon with history is deactivated, never deleted: redemptions and order snapshots keep referring to it. */
export async function deleteCouponAction(input: { couponId: string }): Promise<CouponActionResult> {
  await requirePermission("promos:manage");
  const parsed = z.object({ couponId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const coupon = await db.coupon.findUnique({ where: { id: parsed.data.couponId }, include: { _count: { select: { couponRedemptions: true } } } });
  if (!coupon) return { ok: false, error: "not_found" };
  if (!couponIsUnused(coupon)) return { ok: false, error: "used" };
  await db.coupon.delete({ where: { id: coupon.id } });
  refresh();
  return { ok: true };
}

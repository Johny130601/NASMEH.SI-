"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { anonymiseCustomer } from "@/lib/admin/customers";

export type CustomerActionResult = { ok: true } | { ok: false; error: "invalid" | "not_found" | "staff" };

export async function saveCustomerNotesAction(input: { userId: string; tags: string; adminNotes: string }): Promise<CustomerActionResult> {
  await requirePermission("customers:view");
  const parsed = z.object({
    userId: z.string().min(1).max(64),
    tags: z.string().max(500),
    adminNotes: z.string().max(4000),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const tags = [...new Set(parsed.data.tags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  const updated = await db.user.updateMany({
    where: { id: parsed.data.userId, role: "CUSTOMER" },
    data: { tags, adminNotes: parsed.data.adminNotes.trim() || null },
  });
  if (updated.count !== 1) return { ok: false, error: "not_found" };
  revalidatePath(`/admin/stranke/${parsed.data.userId}`);
  return { ok: true };
}

/** Irreversible GDPR anonymisation of an account or a guest e-mail. */
export async function anonymiseCustomerAction(input: { userId?: string; email?: string }): Promise<CustomerActionResult> {
  const staff = await requirePermission("customers:gdpr");
  const parsed = z.object({
    userId: z.string().min(1).max(64).optional(),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()).optional(),
  }).refine((value) => !!value.userId !== !!value.email).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const target = parsed.data.userId ? { userId: parsed.data.userId } : { email: parsed.data.email! };
  const result = await anonymiseCustomer(target, staff.email);
  if (!result.ok) return { ok: false, error: result.reason };
  revalidatePath("/admin/stranke");
  revalidatePath("/admin/narocila");
  if (parsed.data.userId) revalidatePath(`/admin/stranke/${parsed.data.userId}`);
  return { ok: true };
}

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { EU_COUNTRIES, isValidPostalCode } from "@/lib/orders/checkout-schema";
import { parseStreetLine, savedStreetLine } from "@/lib/orders/checkout-constants";

const idSchema = z.string().trim().min(1).max(80);
export const addressIdSchema = z.object({ id: idSchema });
export const addressSchema = z.object({
  id: idSchema.optional(),
  label: z.string().trim().max(40).optional(),
  fullName: z.string().trim().min(2).max(120),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional(),
  postalCode: z.string().trim().min(3).max(10),
  city: z.string().trim().min(2).max(80),
  country: z.string().refine(code => EU_COUNTRIES.some(country => country.code === code)),
  phone: z.string().trim().max(24).optional(),
  isDefault: z.boolean().default(false),
}).refine(value => isValidPostalCode(value.country, value.postalCode), { path: ["postalCode"], message: "Invalid postal code" })
  // the checkout reads the saved address through the same rule: never store one it would refuse (QA 2026-10-03 T3-03)
  .refine(value => parseStreetLine(savedStreetLine(value.line1, value.line2)) !== null, { path: ["line1"], message: "No house number" });

export interface AddressResult { ok: boolean; error?: "invalid" | "invalid_line1" | "not_found" | "failed" }

/** The parent lock also covers an empty address book and concurrent deletions. */
async function lockOwner(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
  return rows.length > 0;
}

export async function saveAddressForUser(userId: string, input: unknown): Promise<AddressResult> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    // a missing house number is named, so the form can mark the street field
    const line1 = parsed.error.issues.some(issue => issue.path[0] === "line1");
    return { ok: false, error: line1 ? "invalid_line1" : "invalid" };
  }
  const { id, ...fields } = parsed.data;
  return db.$transaction(async tx => {
    if (!await lockOwner(tx, userId)) return { ok: false, error: "not_found" };
    const previous = id ? await tx.address.findFirst({ where: { id, userId } }) : null;
    // Do not alter the real default before proving ownership of the target.
    if (id && !previous) return { ok: false, error: "not_found" };
    const currentDefault = await tx.address.findFirst({ where: { userId, isDefault: true } });
    const isDefault = fields.isDefault || previous?.isDefault === true || !currentDefault;
    if (isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    const data = { ...fields, isDefault, label: fields.label || null, line2: fields.line2 || null, phone: fields.phone || null };
    if (previous) await tx.address.update({ where: { id: previous.id }, data });
    else await tx.address.create({ data: { ...data, userId } });
    return { ok: true };
  });
}

export async function deleteAddressForUser(userId: string, input: unknown): Promise<AddressResult> {
  const parsed = addressIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return db.$transaction(async tx => {
    if (!await lockOwner(tx, userId)) return { ok: false, error: "not_found" };
    const target = await tx.address.findFirst({ where: { id: parsed.data.id, userId } });
    if (!target) return { ok: false, error: "not_found" };
    await tx.address.delete({ where: { id: target.id } });
    if (target.isDefault) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { ok: true };
  });
}

export async function setDefaultAddressForUser(userId: string, input: unknown): Promise<AddressResult> {
  const parsed = addressIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return db.$transaction(async tx => {
    if (!await lockOwner(tx, userId)) return { ok: false, error: "not_found" };
    const target = await tx.address.findFirst({ where: { id: parsed.data.id, userId } });
    if (!target) return { ok: false, error: "not_found" };
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    await tx.address.update({ where: { id: target.id }, data: { isDefault: true } });
    return { ok: true };
  });
}

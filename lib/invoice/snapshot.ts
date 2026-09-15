import type { Order, Prisma } from "@prisma/client";
import { z } from "zod";
import type { CompanySetting } from "@/lib/settings";

/**
 * The invoice as issued (Phase 9 step 4): seller, buyer and footer frozen on
 * `Order.invoiceSnapshot` when the paid transition sets the invoice number, so
 * a later company-data change or customer anonymisation cannot rewrite an
 * issued tax document. Totals and lines already live on the order snapshot.
 *
 * The stored shape is read leniently (plain strings): a stricter company
 * schema added later must not make an old snapshot unreadable.
 */

const storedSellerSchema = z.object({
  name: z.string(),
  address: z.string(),
  registrationNumber: z.string(),
  vatId: z.string(),
  email: z.string(),
  phone: z.string().optional(),
});

export const invoiceSnapshotSchema = z.object({
  issuedAt: z.iso.datetime(),
  seller: storedSellerSchema,
  buyer: z.object({
    name: z.string().nullable(),
    email: z.string(),
    /** The address snapshot printed on the invoice (billing, otherwise shipping). */
    address: z.unknown(),
  }),
  footer: z.string().nullable(),
});

export type InvoiceSnapshot = z.output<typeof invoiceSnapshotSchema>;

type InvoiceBuyerSource = Pick<Order, "email" | "billingAddress" | "shippingAddress">;

function addressFullName(address: unknown): string | null {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const fullName = (address as { fullName?: unknown }).fullName;
  return typeof fullName === "string" && fullName.trim() ? fullName.trim() : null;
}

/** Seller, buyer and footer as they stand at issuance; `phone` only when set. */
export function buildInvoiceSnapshot(order: InvoiceBuyerSource, company: CompanySetting, footer: string | null, issuedAt: Date): InvoiceSnapshot {
  const address = order.billingAddress ?? order.shippingAddress;
  const phone = company.phone?.trim();
  return {
    issuedAt: issuedAt.toISOString(),
    seller: {
      name: company.name,
      address: company.address,
      registrationNumber: company.registrationNumber,
      vatId: company.vatId,
      email: company.email,
      ...(phone ? { phone } : {}),
    },
    buyer: { name: addressFullName(address), email: order.email, address: address ?? null },
    footer: footer?.trim() ? footer.trim() : null,
  };
}

/** The stored snapshot, or null for orders issued before snapshots existed (or a malformed value). */
export function readInvoiceSnapshot(value: unknown): InvoiceSnapshot | null {
  if (value === null || value === undefined) return null;
  const parsed = invoiceSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function invoiceSnapshotJson(snapshot: InvoiceSnapshot): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

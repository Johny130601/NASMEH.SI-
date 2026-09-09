import { z } from "zod";

const addressSnapshot = z.object({
  fullName: z.string().optional(), street: z.string().optional(), streetNumber: z.string().optional(),
  line1: z.string().optional(), line2: z.string().optional(), postalCode: z.string().optional(),
  city: z.string().optional(), country: z.string().optional(),
});

/** Orders retain their own addresses even when the customer's book changes. */
export function snapshotAddressLines(value: unknown): string[] {
  const parsed = addressSnapshot.safeParse(value);
  if (!parsed.success) return [];
  const address = parsed.data;
  return [address.fullName, address.line1 || [address.street, address.streetNumber].filter(Boolean).join(" "),
    address.line2, [address.postalCode, address.city].filter(Boolean).join(" "), address.country]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0);
}

export function hasIssuedInvoice(order: { invoiceNumber: string | null; invoiceIssuedAt: Date | null }): boolean {
  return !!order.invoiceNumber && order.invoiceIssuedAt !== null;
}

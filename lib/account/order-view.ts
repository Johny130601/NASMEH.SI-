import { z } from "zod";
import { EU_COUNTRIES } from "@/lib/orders/checkout-constants";

const addressSnapshot = z.object({
  fullName: z.string().optional(), street: z.string().optional(), streetNumber: z.string().optional(),
  streetSupplement: z.string().optional(),
  line1: z.string().optional(), line2: z.string().optional(), postalCode: z.string().optional(),
  city: z.string().optional(), country: z.string().optional(),
});

/** The country as the seller block names it ("Slovenija", not "SI"; QA 2026-10-03 T2-12). */
function countryName(code: string | undefined): string | undefined {
  return EU_COUNTRIES.find((country) => country.code === code)?.label ?? code;
}

/**
 * Orders retain their own addresses even when the customer's book changes. One formatter for
 * the account, the admin, the invoice and the packing slip: "Ulica 12, 2. nadstropje" — the
 * supplement after the house number (QA 2026-10-03 T2-04).
 */
export function snapshotAddressLines(value: unknown): string[] {
  const parsed = addressSnapshot.safeParse(value);
  if (!parsed.success) return [];
  const address = parsed.data;
  const street = [address.street, address.streetNumber].filter(Boolean).join(" ");
  const streetLine = address.streetSupplement ? [street, address.streetSupplement].filter(Boolean).join(", ") : street;
  return [address.fullName, address.line1 || streetLine,
    address.line2, [address.postalCode, address.city].filter(Boolean).join(" "), countryName(address.country)]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0);
}

export function hasIssuedInvoice(order: { invoiceNumber: string | null; invoiceIssuedAt: Date | null }): boolean {
  return !!order.invoiceNumber && order.invoiceIssuedAt !== null;
}

import { describe, expect, it } from "vitest";
import { buildInvoiceData } from "@/lib/invoice/data";
import { generateInvoicePdf } from "@/lib/invoice/pdf";
import { invoice } from "@/lib/copy/invoice";
import type { Order, OrderItem } from "@prisma/client";

function orderFixture(): Order & { items: OrderItem[] } {
  const base = {
    id: "o1",
    number: "NS-2026-00042",
    status: "PAID" as const,
    userId: null,
    email: "kupec@test.si",
    phone: null,
    currency: "EUR",
    subtotalCents: 6998,
    discountCents: 0,
    shippingCents: 0,
    shippingMethod: "Pošta Slovenije — standard",
    totalCents: 6998,
    vatCents: 1262,
    vatRatePercent: 22,
    shippingAddress: { fullName: "Test Kupec" },
    billingAddress: null,
    paymentProvider: "test",
    stripePaymentIntentId: "test_pi_NS-2026-00042",
    paypalOrderId: null,
    trackingNumber: null,
    carrier: null,
    invoiceNumber: "NS-2026-00042",
    invoiceIssuedAt: new Date("2026-09-09T10:00:00Z"),
    paidAt: new Date("2026-09-09T10:00:00Z"),
    deliveredAt: null,
    shippedAt: null,
    shippedEmailPending: false,
    shippedEmailSentAt: null,
    shippedEmailLeaseUntil: null,
    shippedEmailLastError: null, anonymizedAt: null,
    stockDeducted: true,
    cartClearedAt: null,
    refundRequired: false,
    refundedCents: 0,
    fulfillmentIssue: null,
    confirmationEmailPending: false,
    confirmationEmailSentAt: null,
    confirmationEmailLeaseUntil: null,
    confirmationEmailLastError: null,
    marketingOptIn: false,
    checkoutKey: "key-12345678",
    couponCode: null,
    couponSnapshot: null,
    timeline: [],
    createdAt: new Date("2026-09-09T09:59:00Z"),
    updatedAt: new Date("2026-09-09T10:00:00Z"),
  };
  return {
    ...base,
    items: [
      {
        id: "i1",
        orderId: "o1",
        variantId: "v1",
        title: "Belilni trakci",
        sku: "NAS-TRK-14",
        unitPriceCents: 3499,
        vatRatePercent: 22,
        quantity: 2,
        discountLabel: null,
        giftLabel: null,
        properties: null,
      },
    ],
  };
}

describe("buildInvoiceData (invoice totals from order snapshot)", () => {
  it("computes line totals and carries snapshot money", () => {
    const data = buildInvoiceData(orderFixture());
    expect(data.number).toBe("NS-2026-00042");
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0].lineTotalCents).toBe(6998);
    expect(data.subtotalCents).toBe(6998);
    expect(data.shippingCents).toBe(0);
    expect(data.totalCents).toBe(6998);
    expect(data.vatRatePercent).toBe(22);
    expect(data.vatCents).toBe(1262); // exact 22 % of 6998
  });

  it("subtotal recomputed from lines matches the snapshot", () => {
    const data = buildInvoiceData(orderFixture());
    const recomputed = data.lines.reduce((s, l) => s + l.lineTotalCents, 0);
    expect(recomputed).toBe(data.subtotalCents);
    expect(data.subtotalCents + data.shippingCents).toBe(data.totalCents);
  });

  it("preserves discount and tax snapshots so invoice totals reconcile", () => {
    // Deliberately distinct from re-deriving VAT from the grand total: invoice
    // downloads must preserve the amount recorded when the order was paid.
    const order = { ...orderFixture(), discountCents: 700, shippingCents: 390, totalCents: 6688, vatCents: 1205 };
    const data = buildInvoiceData(order);
    expect(data.discountCents).toBe(700);
    expect(data.subtotalCents - data.discountCents + data.shippingCents).toBe(data.totalCents);
    expect(data.vatCents).toBe(order.vatCents);
    expect(invoice.vat(data.vatRatePercent, data.vatCents)).toBe("vključen DDV 22 %: 12,05 €");
  });

  it("uses the snapshotted billing address when present, otherwise shipping", () => {
    const order = orderFixture();
    expect(buildInvoiceData(order).address).toEqual(order.shippingAddress);
    order.billingAddress = { fullName: "Živa Ščuk", line1: "Čopova 12", postalCode: "1000", city: "Ljubljana", country: "SI" };
    expect(buildInvoiceData(order).address).toEqual(order.billingAddress);
  });

  it("embeds a Unicode font for Slovenian invoice content", async () => {
    const order = orderFixture();
    order.items[0].title = "Čiščenje zob - ščetka Živa";
    const pdf = await generateInvoicePdf(buildInvoiceData(order));
    const bytes = pdf.toString("latin1");
    expect(bytes.startsWith("%PDF-")).toBe(true);
    expect(bytes).toContain("/FontFile2");
    expect(bytes).toContain("/ToUnicode");
  });
});

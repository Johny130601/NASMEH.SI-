import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ company: vi.fn(), footer: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getCompany: mocks.company, getInvoiceFooter: mocks.footer }));

import { buildInvoiceData, buildInvoiceDataWithCompany } from "@/lib/invoice/data";
import { buildInvoiceSnapshot, readInvoiceSnapshot } from "@/lib/invoice/snapshot";
import { generateLegalTextsPdf, htmlToTextBlocks, readLegalAcceptance } from "@/lib/invoice/legal-texts-pdf";
import { generateInvoicePdf } from "@/lib/invoice/pdf";
import { invoice } from "@/lib/copy/invoice";
import { formatEUR } from "@/lib/pricing";
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
    legalAcceptance: null,
    invoiceSnapshot: null,
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

  it("derives the VAT tax base from the stored totals", () => {
    const data = buildInvoiceData({ ...orderFixture(), totalCents: 6688, vatCents: 1205 });
    expect(data.taxBaseCents).toBe(5483);
    expect(invoice.taxBase(data.vatRatePercent, data.taxBaseCents)).toBe(`Osnova za DDV 22 %: ${formatEUR(5483)}`);
  });
});

const COMPANY = { name: "Nasmeh.si, d.o.o.", address: "Čopova 1, 1000 Ljubljana", registrationNumber: "1234567000", vatId: "SI12345678", email: "info@nasmeh.si", phone: "01 234 56 78" };

describe("invoice as issued (Order.invoiceSnapshot)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.company.mockResolvedValue({ ...COMPANY, name: "Novo ime, d.o.o." });
    mocks.footer.mockResolvedValue("Nova opomba");
  });

  it("renders seller, buyer, footer and issue date from the snapshot without reading the live Settings", async () => {
    const order = orderFixture();
    order.billingAddress = { fullName: "Živa Ščuk", line1: "Čopova 12", postalCode: "1000", city: "Ljubljana", country: "SI" };
    const snapshot = buildInvoiceSnapshot(order, COMPANY, " Hvala ", new Date("2026-09-09T10:00:00Z"));
    // Anonymisation later scrubs the operational fields; the issued invoice keeps its buyer.
    const scrubbed = { ...order, email: "anonymised-1@invalid", billingAddress: null, shippingAddress: { country: "SI", anonymized: true }, invoiceSnapshot: snapshot };
    const data = await buildInvoiceDataWithCompany(scrubbed as unknown as typeof order);
    expect(mocks.company).not.toHaveBeenCalled();
    expect(mocks.footer).not.toHaveBeenCalled();
    expect(data.company).toEqual(COMPANY);
    expect(data.footer).toBe("Hvala");
    expect(data.customerName).toBe("Živa Ščuk");
    expect(data.customerEmail).toBe("kupec@test.si");
    expect(data.address).toEqual(order.billingAddress);
    expect(data.issuedAt.toISOString()).toBe("2026-09-09T10:00:00.000Z");
    expect(data.totalCents).toBe(6998);
    const pdf = await generateInvoicePdf(data);
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
  });

  it("falls back to the live Settings for orders issued before snapshots, or with a malformed one", async () => {
    const data = await buildInvoiceDataWithCompany(orderFixture());
    expect(data.company?.name).toBe("Novo ime, d.o.o.");
    expect(data.footer).toBe("Nova opomba");
    expect(data.customerName).toBeNull();
    expect(readInvoiceSnapshot({ issuedAt: "yesterday", seller: COMPANY, buyer: { name: null, email: "x" }, footer: null })).toBeNull();
    expect((await buildInvoiceDataWithCompany({ ...orderFixture(), invoiceSnapshot: { seller: { name: "Delno" } } })).company?.name).toBe("Novo ime, d.o.o.");
  });

  it("stores the phone only when the company has one", () => {
    const withoutPhone = buildInvoiceSnapshot(orderFixture(), { ...COMPANY, phone: " " }, null, new Date("2026-09-09T10:00:00Z"));
    expect(withoutPhone.seller).not.toHaveProperty("phone");
    expect(withoutPhone.footer).toBeNull();
    expect(withoutPhone.buyer).toEqual({ name: "Test Kupec", email: "kupec@test.si", address: { fullName: "Test Kupec" } });
    expect(readInvoiceSnapshot(JSON.parse(JSON.stringify(withoutPhone)))).toEqual(withoutPhone);
  });
});

describe("legal texts attached to the confirmation", () => {
  it("reduces a CMS body to headings, paragraphs and list items", () => {
    expect(htmlToTextBlocks(`<h2>1. Pravica</h2><p>V 14 dneh&nbsp;od <strong>prevzema</strong> &amp; brez razloga.<br>Nova vrstica</p><script>alert(1)</script><!-- opomba --><ul><li>Prvi</li><li>Drugi &#269;</li></ul>`)).toEqual([
      { kind: "heading", text: "1. Pravica" },
      { kind: "paragraph", text: "V 14 dneh od prevzema & brez razloga.\nNova vrstica" },
      { kind: "item", text: "Prvi" },
      { kind: "item", text: "Drugi č" },
    ]);
  });

  it("reads the accepted versions leniently and renders a PDF", async () => {
    const hash = "c".repeat(64);
    const accepted = readLegalAcceptance({ acceptedAt: "2026-09-13T10:00:00.000Z", pages: [
      { key: "terms", path: "/pogoji-poslovanja", slug: "pogoji-poslovanja", updatedAt: "2026-09-01T00:00:00.000Z", sha256: hash },
      { key: "withdrawal", path: "/odstop-od-pogodbe", slug: null, updatedAt: null, sha256: null },
      "garbage",
    ] });
    expect(accepted.get("terms")?.sha256).toBe(hash);
    expect(accepted.get("withdrawal")?.sha256).toBeNull();
    expect(readLegalAcceptance(null).size).toBe(0);
    const pdf = await generateLegalTextsPdf({
      orderNumber: "NS-2026-00042", preparedAt: new Date("2026-09-13T10:00:00Z"),
      documents: [
        { key: "terms", title: "Pogoji poslovanja", url: "https://nasmeh.test/pogoji-poslovanja", page: { title: "Pogoji poslovanja", body: "<h2>1. Splošno</h2><p>Čšž</p>", updatedAt: new Date() }, accepted: accepted.get("terms") ?? null },
        { key: "withdrawal", title: "Odstop od pogodbe", url: "https://nasmeh.test/odstop-od-pogodbe", page: null, accepted: null },
      ],
    });
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toContain("/FontFile2");
    expect(raw.match(/\/Type \/Page\b/g)?.length).toBe(2);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  pageFind: vi.fn(),
  invoiceData: vi.fn(),
  pdf: vi.fn(),
  withdrawalPdf: vi.fn(),
  legalPdf: vi.fn(),
  send: vi.fn(),
  company: vi.fn(),
  footer: vi.fn(),
  links: vi.fn(),
  methods: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {
  order: {
    updateMany: mocks.updateMany,
    findUniqueOrThrow: mocks.findUniqueOrThrow,
    update: mocks.update,
    findMany: mocks.findMany,
  },
  contentPage: { findFirst: mocks.pageFind },
} }));
vi.mock("@/lib/email/mailer", () => ({ sendOrderConfirmationEmail: mocks.send }));
vi.mock("@/lib/invoice/data", () => ({ buildInvoiceDataWithCompany: mocks.invoiceData }));
vi.mock("@/lib/invoice/pdf", () => ({ generateInvoicePdf: mocks.pdf }));
vi.mock("@/lib/returns/withdrawal-pdf", () => ({ generateWithdrawalFormPdf: mocks.withdrawalPdf }));
vi.mock("@/lib/invoice/legal-texts-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invoice/legal-texts-pdf")>()), generateLegalTextsPdf: mocks.legalPdf,
}));
vi.mock("@/lib/settings", () => ({ getCompany: mocks.company, getInvoiceFooter: mocks.footer, getLegalLinks: mocks.links }));
vi.mock("@/lib/tracking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tracking")>()), getShippingMethods: mocks.methods,
}));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.test" }));

import { createHash } from "node:crypto";
import { deliverOrderConfirmation, retryPendingOrderConfirmations } from "@/lib/orders/confirmation-delivery";

const COMPANY = { name: "Nasmeh.si, d.o.o.", address: "Čopova 1, 1000 Ljubljana", registrationNumber: "1234567000", vatId: "SI12345678", email: "info@nasmeh.si", phone: "01 234 56 78" };
const TERMS_HASH = "a".repeat(64);
const LINKS = { terms: "/pogoji-poslovanja?v=2", privacy: "/politika-zasebnosti", cookies: "/politika-piskotkov", withdrawal: "/odstop-od-pogodbe", complaints: "/reklamacije" };

describe("durable order confirmation delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "order-1", number: "NS-2026-00001", status: "PAID", stockDeducted: true, refundRequired: false, items: [],
      shippingMethod: "GLS — paketna dostava", invoiceIssuedAt: null, invoiceSnapshot: null,
      legalAcceptance: { acceptedAt: "2026-09-13T10:00:00.000Z", noticeVersion: "v", pages: [
        { key: "terms", path: "/pogoji-poslovanja", slug: "pogoji-poslovanja", updatedAt: "2026-09-01T00:00:00.000Z", sha256: TERMS_HASH },
        { key: "withdrawal", path: "/odstop-od-pogodbe", slug: "odstop-od-pogodbe", updatedAt: null, sha256: null },
      ] },
    });
    mocks.update.mockResolvedValue({});
    mocks.pageFind.mockImplementation(({ where }: { where: { slug: string } }) =>
      Promise.resolve({ title: `Stran ${where.slug}`, body: "<h2>1.</h2><p>Besedilo</p>", updatedAt: new Date("2026-09-01T00:00:00Z") }));
    mocks.invoiceData.mockResolvedValue({ company: COMPANY });
    mocks.pdf.mockResolvedValue(Buffer.from("invoice"));
    mocks.withdrawalPdf.mockResolvedValue(Buffer.from("withdrawal"));
    mocks.legalPdf.mockResolvedValue(Buffer.from("legal"));
    mocks.send.mockResolvedValue({});
    mocks.company.mockResolvedValue(COMPANY);
    mocks.footer.mockResolvedValue("");
    mocks.links.mockResolvedValue(LINKS);
    mocks.methods.mockResolvedValue([{ id: "gls", carrier: "GLS", label: "GLS — paketna dostava", priceCents: 490, estimate: "2–3 delovni dnevi", countries: ["SI"] }]);
  });

  it("sends the invoice, the model withdrawal form and the legal texts with the seller, links and accepted versions", async () => {
    expect(await deliverOrderConfirmation("order-1")).toBe(true);
    expect(mocks.withdrawalPdf).toHaveBeenCalledWith(COMPANY);
    expect(mocks.pageFind).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "pogoji-poslovanja", published: true } }));
    expect(mocks.pageFind).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "odstop-od-pogodbe", published: true } }));
    const legalInput = mocks.legalPdf.mock.calls[0][0];
    expect(legalInput.orderNumber).toBe("NS-2026-00001");
    expect(legalInput.documents.map((document: { key: string; url: string }) => [document.key, document.url])).toEqual([
      ["terms", "https://nasmeh.test/pogoji-poslovanja"], ["withdrawal", "https://nasmeh.test/odstop-od-pogodbe"],
    ]);
    expect(legalInput.documents[0].accepted.sha256).toBe(TERMS_HASH);
    const [order, content] = mocks.send.mock.calls[0];
    expect(order.id).toBe("order-1");
    expect(content).toEqual({
      invoicePdf: Buffer.from("invoice"),
      withdrawalFormPdf: Buffer.from("withdrawal"),
      legalTextsPdf: Buffer.from("legal"),
      estimate: "2–3 delovni dnevi",
      legal: {
        seller: COMPANY,
        links: {
          terms: "https://nasmeh.test/pogoji-poslovanja", withdrawal: "https://nasmeh.test/odstop-od-pogodbe",
          complaints: "https://nasmeh.test/reklamacije", guarantee: "https://nasmeh.test/garancija-vracila-denarja",
        },
        accepted: { terms: TERMS_HASH, withdrawal: null },
      },
    });
  });

  it("never sends a confirmation without the seller: missing company data stays queued and retryable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.invoiceData.mockResolvedValue({ company: null });
      expect(await deliverOrderConfirmation("order-1")).toBe(false);
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenLastCalledWith({
        where: { id: "order-1" },
        data: { confirmationEmailLeaseUntil: null, confirmationEmailLastError: "CompanySettingMissingError" },
      });
    } finally {
      log.mockRestore();
    }
  });

  it("freezes the invoice snapshot of an order issued without one before the first send", async () => {
    const issuedAt = new Date("2026-09-13T08:00:00Z");
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "order-1", number: "NS-2026-00001", status: "PAID", stockDeducted: true, refundRequired: false, items: [],
      email: "kupec@test.si", billingAddress: null, shippingAddress: { fullName: "Kupec Test" },
      invoiceIssuedAt: issuedAt, invoiceSnapshot: null, legalAcceptance: null, shippingMethod: null,
    });
    mocks.footer.mockResolvedValue(" Opomba ");
    expect(await deliverOrderConfirmation("order-1")).toBe(true);
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: { id: "order-1", invoiceSnapshot: { equals: Prisma.DbNull } },
      data: { invoiceSnapshot: {
        issuedAt: issuedAt.toISOString(), seller: COMPANY, buyer: { name: "Kupec Test", email: "kupec@test.si", address: { fullName: "Kupec Test" } }, footer: "Opomba",
      } },
    });
    expect(mocks.invoiceData.mock.calls[0][0].invoiceSnapshot.seller).toEqual(COMPANY);
    expect(mocks.send.mock.calls[0][1].estimate).toBeNull();
    expect(mocks.send.mock.calls[0][1].legal.accepted).toEqual({ terms: null, withdrawal: null });

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.company.mockResolvedValue(null);
      mocks.send.mockClear();
      expect(await deliverOrderConfirmation("order-1")).toBe(false);
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("keeps failed SMTP delivery retryable and marks it sent only after a successful retry", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.send.mockRejectedValueOnce(new Error("temporary SMTP failure"));
      expect(await deliverOrderConfirmation("order-1")).toBe(false);
      expect(mocks.update).toHaveBeenLastCalledWith({
        where: { id: "order-1" },
        data: { confirmationEmailLeaseUntil: null, confirmationEmailLastError: "Error" },
      });
      expect(await deliverOrderConfirmation("order-1")).toBe(true);
      expect(mocks.update).toHaveBeenLastCalledWith({
        where: { id: "order-1" },
        data: {
          confirmationEmailPending: false,
          confirmationEmailSentAt: expect.any(Date),
          confirmationEmailLeaseUntil: null,
          confirmationEmailLastError: null,
        },
      });
      expect(mocks.send).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it("does not send when another worker already claimed delivery", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await Promise.all([
      deliverOrderConfirmation("order-1"), deliverOrderConfirmation("order-1"),
    ])).toEqual([true, false]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not send the ordinary confirmation for a captured stockout", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({ status: "CANCELLED", refundRequired: true, stockDeducted: false });
    expect(await deliverOrderConfirmation("order-1")).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("hands the accepted text stored at placement to the legal-texts PDF", async () => {
    const body = "<h2>1.</h2><p>Različica ob oddaji</p>";
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "order-1", number: "NS-2026-00001", status: "PAID", stockDeducted: true, refundRequired: false, items: [], anonymizedAt: null,
      shippingMethod: null, invoiceIssuedAt: null, invoiceSnapshot: null,
      legalAcceptance: { acceptedAt: "2026-09-13T10:00:00.000Z", noticeVersion: "v", pages: [
        { key: "terms", path: "/pogoji-poslovanja", slug: "pogoji-poslovanja", updatedAt: "2026-09-01T00:00:00.000Z",
          sha256: createHash("sha256").update(body, "utf8").digest("hex"), title: "Pogoji poslovanja", body },
      ] },
    });
    expect(await deliverOrderConfirmation("order-1")).toBe(true);
    const terms = mocks.legalPdf.mock.calls[0][0].documents[0];
    expect(terms.accepted).toMatchObject({ title: "Pogoji poslovanja", body });
  });

  it.each([
    ["the delivery attempt", () => deliverOrderConfirmation("order-1")],
    ["the scheduled retry", () => retryPendingOrderConfirmations()],
  ])("after erasure, %s sends nothing, freezes no snapshot and clears the queued confirmation", async (_label, run) => {
    mocks.findMany.mockResolvedValue([{ id: "order-1" }]);
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "order-1", number: "NS-2026-00001", status: "PAID", stockDeducted: true, refundRequired: false, items: [],
      anonymizedAt: new Date("2026-09-14T09:00:00Z"), email: "anonymised-order-1@invalid",
      shippingAddress: { country: "SI", anonymized: true }, billingAddress: null,
      invoiceIssuedAt: new Date("2026-09-13T08:00:00Z"), invoiceSnapshot: null, legalAcceptance: null, shippingMethod: null,
    });
    const outcome = await run();
    expect(outcome === false || (typeof outcome === "object" && outcome.skipped === 1 && outcome.failed === 0)).toBe(true);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.invoiceData).not.toHaveBeenCalled();
    expect(mocks.legalPdf).not.toHaveBeenCalled();
    // Only the lease claim ran: no invoiceSnapshot write from the scrubbed row.
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty("invoiceSnapshot");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "order-1" }, data: { confirmationEmailPending: false, confirmationEmailLeaseUntil: null },
    });
  });

  it("the scheduled retry drains persisted pending orders", async () => {
    mocks.findMany.mockResolvedValue([{ id: "order-1" }, { id: "order-2" }]);
    expect(await retryPendingOrderConfirmations()).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ confirmationEmailPending: true, confirmationEmailSentAt: null }),
    }));
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("distinguishes delivery failures from already-claimed and ineligible skips", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.findMany.mockResolvedValue([{ id: "claimed" }, { id: "failed" }, { id: "sent" }, { id: "cancelled" }]);
      mocks.updateMany.mockResolvedValueOnce({ count: 0 });
      mocks.findUniqueOrThrow.mockResolvedValueOnce({ id: "failed", number: "NS-1", status: "PAID", stockDeducted: true, items: [] })
        .mockResolvedValueOnce({ id: "sent", number: "NS-2", status: "PAID", stockDeducted: true, items: [] })
        .mockResolvedValueOnce({ status: "CANCELLED", stockDeducted: false });
      mocks.send.mockRejectedValueOnce(new Error("SMTP recipient private@example.test rejected"));
      expect(await retryPendingOrderConfirmations()).toEqual({ processed: 4, sent: 1, failed: 1, skipped: 2 });
      expect(mocks.send).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith("Order confirmation remains queued");
      expect(JSON.stringify(log.mock.calls)).not.toContain("private@example.test");
      expect(log.mock.calls[0]).toHaveLength(1);
    } finally { log.mockRestore(); }
  });
});

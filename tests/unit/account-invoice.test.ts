import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(storefront)/racun/narocilo/[number]/racun.pdf/route";
import { hasIssuedInvoice, snapshotAddressLines } from "@/lib/account/order-view";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), order: vi.fn(), data: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { order: { findUnique: mocks.order } } }));
vi.mock("@/lib/invoice/data", () => ({ buildInvoiceDataWithCompany: mocks.data }));
vi.mock("@/lib/invoice/pdf", () => ({ generateInvoicePdf: mocks.pdf }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
const order = { number: "NS-2026-00042", userId: "owner", email: "owner@example.test", invoiceNumber: "NS-2026-00042", invoiceIssuedAt: new Date(), items: [] };
const download = () => GET(new Request("http://localhost/racun.pdf"), { params: Promise.resolve({ number: order.number }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner", role: "CUSTOMER" } });
  mocks.order.mockResolvedValue(order);
  mocks.data.mockResolvedValue({ number: order.number });
  mocks.pdf.mockResolvedValue(Buffer.from("%PDF-1.3\nunit"));
});

describe("account invoice access", () => {
  it.each(["owner", "admin"])("allows the %s to download an issued invoice privately", async role => {
    if (role === "admin") mocks.auth.mockResolvedValue({ user: { id: "operator", role: "ADMIN" } });
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="racun-NS-2026-00042.pdf"');
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.text()).toMatch(/^%PDF-/);
    expect(mocks.data).toHaveBeenCalledWith(order);
  });
  it("does not give another account access through a matching email", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "other", role: "CUSTOMER", email: order.email } });
    await expect(download()).rejects.toThrow("404");
    expect(mocks.data).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("redirects anonymous users before reading any order", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(download()).rejects.toThrow("redirect:/prijava");
    expect(mocks.order).not.toHaveBeenCalled();
  });
  it.each([null, { ...order, userId: null }, { ...order, invoiceNumber: null }, { ...order, invoiceIssuedAt: null }])("does not generate a missing, unowned or unissued invoice", async fixture => {
    mocks.order.mockResolvedValue(fixture);
    await expect(download()).rejects.toThrow("404");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
});

describe("order address snapshots", () => {
  it("renders checkout snapshots and saved-address-shaped billing snapshots", () => {
    expect(snapshotAddressLines({ fullName: "Živa Ščuk", street: "Čopova", streetNumber: "12", postalCode: "1000", city: "Ljubljana", country: "SI" }))
      .toEqual(["Živa Ščuk", "Čopova 12", "1000 Ljubljana", "SI"]);
    expect(snapshotAddressLines({ fullName: "Podjetje", line1: "Hauptstraße 10", line2: "2. nadstropje", postalCode: "10115", city: "Berlin", country: "DE" }))
      .toEqual(["Podjetje", "Hauptstraße 10", "2. nadstropje", "10115 Berlin", "DE"]);
  });
  it("does not render nulls or crash on malformed legacy JSON", () => {
    for (const value of [null, [], "address", { fullName: { unexpected: true } }]) expect(snapshotAddressLines(value)).toEqual([]);
    expect(snapshotAddressLines({ city: "Ljubljana" })).toEqual(["Ljubljana"]);
    expect(hasIssuedInvoice({ invoiceNumber: null, invoiceIssuedAt: null })).toBe(false);
  });
});

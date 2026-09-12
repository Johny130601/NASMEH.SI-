import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 7 step 7 review-boss fixes: validated route params, the zod order filters, bounded customer scans. */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), exportCustomer: vi.fn(), orderFindUnique: vi.fn(), userFindMany: vi.fn(), orderFindMany: vi.fn(), packingSlip: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin/customers", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/admin/customers")>()), exportCustomerData: mocks.exportCustomer }));
vi.mock("@/lib/db", () => ({ db: {
  order: { findUnique: mocks.orderFindUnique, findMany: mocks.orderFindMany },
  user: { findMany: mocks.userFindMany },
  setting: { findUnique: vi.fn().mockResolvedValue(null) },
} }));
vi.mock("@/lib/invoice/packing-slip", () => ({ generatePackingSlipPdf: mocks.packingSlip }));

import { GET as exportRoute } from "@/app/admin/(shell)/stranke/[id]/izvoz.json/route";
import { GET as slipRoute } from "@/app/admin/(shell)/narocila/[number]/dobavnica.pdf/route";
import { orderFiltersSchema, parseOrderFilters } from "@/lib/admin/orders";
import { CUSTOMER_SCAN_LIMIT, listCustomers } from "@/lib/admin/customers";

const owner = { user: { id: "cmf0owner000000000000001", email: "owner@nasmeh.si", name: "Owner", role: "OWNER", mfaEnrolled: true } };
const exportGet = (id: string, query = "") => exportRoute(new Request(`https://nasmeh.example/admin/stranke/${id}/izvoz.json${query}`), { params: Promise.resolve({ id }) });
const slipGet = (number: string) => slipRoute(new Request("https://nasmeh.example/x"), { params: Promise.resolve({ number }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(owner);
  mocks.exportCustomer.mockResolvedValue({ user: { email: "kupec@test.si" } });
  mocks.orderFindUnique.mockResolvedValue(null);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.orderFindMany.mockResolvedValue([]);
  mocks.packingSlip.mockResolvedValue(Buffer.from("%PDF"));
});

describe("GDPR export route", () => {
  it("normalises the guest e-mail, refuses malformed ids and e-mails before any lookup, and stays 404 for anonymous callers", async () => {
    expect((await exportGet("gost", "?email=Kupec%40Test.si")).status).toBe(200);
    expect(mocks.exportCustomer).toHaveBeenCalledWith({ email: "kupec@test.si" });
    expect((await exportGet("gost", "?email=not-an-address")).status).toBe(404);
    expect((await exportGet("gost")).status).toBe(404);
    expect((await exportGet("x".repeat(65))).status).toBe(404);
    expect(mocks.exportCustomer).toHaveBeenCalledTimes(1);
    expect((await exportGet("cmf0user0000000000000001")).status).toBe(200);
    expect(mocks.exportCustomer).toHaveBeenLastCalledWith({ userId: "cmf0user0000000000000001" });
    mocks.auth.mockResolvedValue(null);
    expect((await exportGet("cmf0user0000000000000001")).status).toBe(404);
  });
});

describe("packing slip route", () => {
  it("refuses out-of-range order numbers before the lookup and 404s unknown orders", async () => {
    expect((await slipGet("NS")).status).toBe(404);
    expect((await slipGet("N".repeat(65))).status).toBe(404);
    expect(mocks.orderFindUnique).not.toHaveBeenCalled();
    expect((await slipGet("NS-2026-00042")).status).toBe(404);
    expect(mocks.orderFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe("order filters schema", () => {
  it("keeps the hand-written rules: truncation, whitelists, page bounds, ISO dates", () => {
    expect(parseOrderFilters({ q: "x".repeat(300) }).q).toHaveLength(120);
    expect(parseOrderFilters({ stran: "999999999" }).page).toBe(1);
    expect(parseOrderFilters({ stran: "abc" }).page).toBe(1);
    expect(parseOrderFilters({ stran: "12" }).page).toBe(12);
    expect(parseOrderFilters({ status: ["PAID", "SHIPPED"] }).status).toBe("PAID");
    expect(parseOrderFilters({ od: "2026-09-01", do: "not-a-date" })).toMatchObject({ from: new Date(2026, 8, 1, 0, 0, 0, 0), to: null });
    expect(orderFiltersSchema.parse({}).stran).toBe(1);
  });
});

describe("customer list scan cap", () => {
  it("flags a truncated scan when the account query hits its cap", async () => {
    const user = (index: number) => ({ id: `u${index}`, email: `k${index}@test.si`, name: null, marketingOptIn: null, createdAt: new Date(2026, 0, 1), anonymizedAt: null, orders: [] });
    mocks.userFindMany.mockResolvedValue(Array.from({ length: CUSTOMER_SCAN_LIMIT }, (_, index) => user(index)));
    const result = await listCustomers({ q: "", hasOrders: null, marketing: null, page: 1 });
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(CUSTOMER_SCAN_LIMIT);
    expect(mocks.userFindMany.mock.calls[0][0]).toMatchObject({ take: CUSTOMER_SCAN_LIMIT });
    mocks.userFindMany.mockResolvedValue([user(1)]);
    expect((await listCustomers({ q: "", hasOrders: null, marketing: null, page: 1 })).truncated).toBe(false);
  });
});

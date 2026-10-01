import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ orderFindMany: vi.fn(), orderCount: vi.fn(), userFindMany: vi.fn(), subscriberFindMany: vi.fn(), queryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  order: { findMany: mocks.orderFindMany, count: mocks.orderCount }, user: { findMany: mocks.userFindMany },
  subscriber: { findMany: mocks.subscriberFindMany }, $queryRaw: mocks.queryRaw,
} }));
vi.mock("@/lib/orders/refunds", () => ({ refundedQuantities: () => new Map() }));
vi.mock("@/lib/support/photos", () => ({ removeSupportPhotos: vi.fn() }));

import { csvCell, csvDateTime, csvEur, likeEscaped, ordersCsv, orderWhere, parseOrderFilters } from "@/lib/admin/orders";
import { listCustomers, parseCustomerFilters } from "@/lib/admin/customers";

beforeEach(() => { vi.resetAllMocks(); mocks.subscriberFindMany.mockResolvedValue([]); });

describe("order filters", () => {
  it("parses and normalises the query", () => {
    const filters = parseOrderFilters({ q: "  NS-2026 ", status: "paid", od: "2026-09-01", do: "2026-09-10", provider: "Stripe", country: "si", stran: "3" });
    expect(filters).toMatchObject({ q: "NS-2026", status: "PAID", provider: "stripe", country: "SI", page: 3 });
    expect(filters.from).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(filters.to).toEqual(new Date(2026, 8, 10, 23, 59, 59, 999));
    expect(parseOrderFilters({ status: "nope", provider: "cash", country: "slo", stran: "-1", od: "yesterday" })).toMatchObject({ status: null, provider: null, country: null, page: 1, from: null });
  });

  it("builds the where clause across number, e-mail, tracking and the ids a name search matched", () => {
    const filters = parseOrderFilters({ q: "ana k", status: "SHIPPED", country: "SI" });
    // The recipient name lives in JSON, whose Prisma filter takes no `mode` and so renders a
    // case-sensitive LIKE. The name is matched by a separate ILIKE statement and fed back as ids.
    const where = orderWhere(filters, ["order-a", "order-b"]);
    expect(where.OR).toEqual([
      { number: { contains: "ana k", mode: "insensitive" } },
      { email: { contains: "ana k", mode: "insensitive" } },
      { trackingNumber: { contains: "ANAK" } },
      { id: { in: ["order-a", "order-b"] } },
    ]);
    expect(where).toMatchObject({ status: "SHIPPED", shippingAddress: { path: ["country"], equals: "SI" } });
  });

  it("omits the id term when no recipient name matched, so the other three still search", () => {
    const where = orderWhere(parseOrderFilters({ q: "ana k" }), []);
    expect(where.OR).toHaveLength(3);
    expect(where.OR).not.toContainEqual(expect.objectContaining({ id: expect.anything() }));
  });

  it("exports a BOM-prefixed semicolon CSV with quoted cells", async () => {
    mocks.orderFindMany.mockResolvedValue([{
      number: "NS-2026-00001", createdAt: new Date("2026-09-10T10:00:00Z"), status: "PAID", email: "ana@test.si",
      shippingAddress: { fullName: 'Ana "Ančka"; Kovač', country: "SI" }, totalCents: 3989, refundedCents: 0,
      paymentProvider: "stripe", trackingNumber: null, carrier: null, items: [{ quantity: 2 }, { quantity: 1 }],
    }]);
    const csv = await ordersCsv(parseOrderFilters({}));
    expect(csv.startsWith("﻿number;createdAt;status;email;name;country;items;totalEur;refundedEur;provider;trackingNumber;carrier\r\n")).toBe(true);
    // T5-05: the timestamp is Europe/Ljubljana (CEST here), amounts plain numbers with a decimal comma.
    expect(csv).toContain('NS-2026-00001;2026-09-10 12:00:00;PAID;ana@test.si;"Ana ""Ančka""; Kovač";SI;3;"39,89";"0,00";stripe;;');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("neutralises cells a spreadsheet would run as a formula (S2) and leaves numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\",\"x\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("\"'+1\"");
    expect(csvCell("-2")).toBe("\"'-2\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
    expect(csvCell("\tcmd")).toBe("\"'\tcmd\"");
    expect(csvCell("\rcmd")).toBe("\"'\rcmd\"");
    expect(csvCell("Ana Kovač")).toBe("Ana Kovač");
    expect(csvCell("O'Brien")).toBe("\"O'Brien\"");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(-1)).toBe("-1");
    expect(csvEur(3989)).toBe("39,89");
    expect(csvEur(0)).toBe("0,00");
    expect(csvEur(100)).toBe("1,00");
    expect(csvDateTime(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11 00:30:00");
  });

  it("treats % and _ in the search as literal characters in every term (T5-06)", () => {
    const where = orderWhere(parseOrderFilters({ q: "50%_a" }), []);
    expect(where.OR).toEqual([
      { number: { contains: "50\\%\\_a", mode: "insensitive" } },
      { email: { contains: "50\\%\\_a", mode: "insensitive" } },
      { trackingNumber: { contains: "50\\%\\_A" } },
    ]);
    expect(likeEscaped("a\\b")).toBe("a\\\\b");
  });
});

describe("customer list", () => {
  it("merges accounts and guest purchasers, counts LTV from paid orders and filters", async () => {
    mocks.userFindMany.mockResolvedValue([
      { id: "u1", email: "ana@test.si", name: "Ana", marketingOptIn: true, createdAt: new Date("2026-09-01"), anonymizedAt: null,
        orders: [{ status: "PAID", totalCents: 3000, refundedCents: 500 }, { status: "PENDING", totalCents: 9999, refundedCents: 0 }] },
      { id: "u2", email: "bor@test.si", name: null, marketingOptIn: false, createdAt: new Date("2026-08-01"), anonymizedAt: null, orders: [] },
    ]);
    mocks.orderFindMany.mockResolvedValue([
      { email: "gost@test.si", status: "DELIVERED", totalCents: 2000, refundedCents: 0, createdAt: new Date("2026-09-05"), shippingAddress: { fullName: "Gost Ena" }, marketingOptIn: false, anonymizedAt: null },
      { email: "gost@test.si", status: "CANCELLED", totalCents: 500, refundedCents: 0, createdAt: new Date("2026-09-06"), shippingAddress: {}, marketingOptIn: false, anonymizedAt: null },
    ]);
    const all = await listCustomers(parseCustomerFilters({}));
    expect(all.total).toBe(3);
    expect(all.rows.map((row) => [row.type, row.email, row.orders, row.ltvCents])).toEqual([
      ["guest", "gost@test.si", 2, 2000],
      ["account", "ana@test.si", 2, 2500],
      ["account", "bor@test.si", 0, 0],
    ]);
    expect(all.rows[0]).toMatchObject({ name: "Gost Ena", href: "/admin/stranke/gost?email=gost%40test.si" });

    const withOrders = await listCustomers(parseCustomerFilters({ narocila: "da" }));
    expect(withOrders.rows.map((row) => row.email)).toEqual(["gost@test.si", "ana@test.si"]);
    const marketing = await listCustomers(parseCustomerFilters({ enovice: "da" }));
    expect(marketing.rows.map((row) => row.email)).toEqual(["ana@test.si"]);
  });

  it("a guest's newsletter consent is a CONFIRMED subscriber, never the order's opt-in request (S4)", async () => {
    mocks.userFindMany.mockResolvedValue([]);
    mocks.orderFindMany.mockResolvedValue([
      // ticked the checkout box but never confirmed the double opt-in
      { email: "zahteva@test.si", status: "PAID", totalCents: 1000, refundedCents: 0, createdAt: new Date("2026-09-05"), shippingAddress: {}, marketingOptIn: true, anonymizedAt: null },
      // left the box unticked, confirmed through the footer
      { email: "potrjen@test.si", status: "PAID", totalCents: 1000, refundedCents: 0, createdAt: new Date("2026-09-04"), shippingAddress: {}, marketingOptIn: false, anonymizedAt: null },
    ]);
    mocks.subscriberFindMany.mockResolvedValue([{ email: "potrjen@test.si" }]);
    const all = await listCustomers(parseCustomerFilters({}));
    expect(mocks.subscriberFindMany).toHaveBeenCalledWith({
      where: { email: { in: ["zahteva@test.si", "potrjen@test.si"] }, status: "CONFIRMED" }, select: { email: true },
    });
    expect(all.rows.map((row) => [row.email, row.marketingOptIn])).toEqual([["zahteva@test.si", false], ["potrjen@test.si", true]]);
    expect(mocks.orderFindMany.mock.calls[0][0].select).not.toHaveProperty("marketingOptIn");
    expect((await listCustomers(parseCustomerFilters({ enovice: "da" }))).rows.map((row) => row.email)).toEqual(["potrjen@test.si"]);
    expect((await listCustomers(parseCustomerFilters({ enovice: "ne" }))).rows.map((row) => row.email)).toEqual(["zahteva@test.si"]);
  });

  it("finds a guest by name whatever the case staff type", async () => {
    mocks.userFindMany.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([
      { email: "janez@test.si", status: "PAID", totalCents: 1000, refundedCents: 0, createdAt: new Date("2026-09-05"), shippingAddress: { fullName: "Janez Novak" }, anonymizedAt: null },
    ]);
    const found = await listCustomers(parseCustomerFilters({ q: "Novak" }));
    expect(found.rows.map((row) => [row.name, row.email])).toEqual([["Janez Novak", "janez@test.si"]]);
    // Prisma's JSON filter takes no `mode` and renders a case-sensitive LIKE, which no
    // capitalised name ever matches, so the guest scan runs as one ILIKE statement.
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
    const [strings, ...values] = mocks.queryRaw.mock.calls[0] as [string[], ...unknown[]];
    expect(strings.join("?").replace(/\s+/g, " ")).toContain(`"email" ILIKE ? OR ("shippingAddress"->>'fullName') ILIKE ?`);
    expect(values).toEqual(["%novak%", "%novak%", 5000]);
  });

  it("treats LIKE wildcards in the query as literal characters", async () => {
    mocks.userFindMany.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([]);
    await listCustomers(parseCustomerFilters({ q: "50%_a" }));
    expect(mocks.queryRaw.mock.calls[0][1]).toBe("%50\\%\\_a%");
    // The account filter escapes too: Prisma's `contains` passes wildcards through (T5-06).
    expect(mocks.userFindMany.mock.calls[0][0].where.OR).toEqual([
      { email: { contains: "50\\%\\_a", mode: "insensitive" } },
      { name: { contains: "50\\%\\_a", mode: "insensitive" } },
    ]);
  });

  it("paginates the merged list in pages of fifty", async () => {
    mocks.userFindMany.mockResolvedValue([]);
    mocks.orderFindMany.mockResolvedValue(Array.from({ length: 55 }, (_, index) => ({
      email: `g${index}@test.si`, status: "PAID", totalCents: 100, refundedCents: 0, createdAt: new Date(2026, 0, 1 + index), shippingAddress: {}, marketingOptIn: false, anonymizedAt: null,
    })));
    const first = await listCustomers(parseCustomerFilters({}));
    expect(first).toMatchObject({ total: 55, page: 1, pages: 2 });
    expect(first.rows).toHaveLength(50);
    const second = await listCustomers(parseCustomerFilters({ stran: "9" }));
    expect(second).toMatchObject({ page: 2 });
    expect(second.rows).toHaveLength(5);
  });
});

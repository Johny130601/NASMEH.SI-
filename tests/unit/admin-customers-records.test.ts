import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 step 4 review fixes, run against one small in-memory store so the
 * real where-builders decide which rows match:
 * - S9/S16: a record linked to a different account is never exported, shown or
 *   erased, even when it carries the subject's e-mail;
 * - S10/I0: erasure leaves no queued ticket, confirmation or shipment mail the
 *   daily job could never finish (real retry queries, stubbed transport).
 */

type Row = Record<string, unknown>;

const store = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {};
  const isOperator = (value: unknown) => value !== null && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value);
  function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (key === "OR") return (condition as Row[]).some((branch) => matches(row, branch));
      // The one relation filter the code under test uses: a coupon redemption's order.
      if (key === "order") return matches((tables.order ?? []).find((order) => order.id === row.orderId) ?? {}, condition as Row);
      const value = row[key];
      if (!isOperator(condition)) return value === condition;
      const operator = condition as { lte?: Date; in?: unknown[]; not?: unknown };
      if ("lte" in operator) return value instanceof Date && value <= operator.lte!;
      if ("in" in operator) return operator.in!.includes(value);
      if ("not" in operator) return value !== operator.not;
      return false;
    });
  }
  function apply(row: Row, data: Row) {
    for (const [key, value] of Object.entries(data)) {
      if (isOperator(value) && "increment" in (value as Row)) row[key] = Number(row[key] ?? 0) + Number((value as Row).increment);
      else if (isOperator(value) && "push" in (value as Row)) row[key] = [...((row[key] as unknown[]) ?? []), (value as Row).push];
      else row[key] = value;
    }
  }
  function model(name: string, attach: (row: Row) => Row = (row) => row) {
    const rows = () => (tables[name] ??= []);
    const view = (row: Row | undefined) => (row ? attach({ ...row }) : null);
    return {
      findFirst: vi.fn(async ({ where }: { where?: Row } = {}) => view(rows().find((row) => matches(row, where)))),
      findUnique: vi.fn(async ({ where }: { where: Row }) => view(rows().find((row) => matches(row, where)))),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: Row }) => {
        const row = rows().find((candidate) => matches(candidate, where));
        if (!row) throw new Error("not found");
        return view(row);
      }),
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) => rows().filter((row) => matches(row, where)).map((row) => view(row)!)),
      create: vi.fn(async ({ data }: { data: Row }) => { const row = { id: `${name}-${rows().length + 1}`, ...data }; rows().push(row); return row; }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = rows().find((candidate) => matches(candidate, where));
        if (!row) throw new Error("not found");
        apply(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = rows().filter((row) => matches(row, where));
        hit.forEach((row) => apply(row, data));
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where?: Row } = {}) => {
        const keep = rows().filter((row) => !matches(row, where));
        const count = rows().length - keep.length;
        tables[name] = keep;
        return { count };
      }),
    };
  }
  const client: Record<string, unknown> = {
    user: model("user", (row) => ({ ...row, addresses: [], _count: { reviews: 0 } })),
    address: model("address"),
    cart: model("cart"),
    authToken: model("authToken"),
    review: model("review"),
    order: model("order", (row) => ({ ...row, items: (tables.orderItem ?? []).filter((item) => item.orderId === row.id) })),
    ticket: model("ticket", (row) => ({ ...row, attachments: [] })),
    ticketEmailDelivery: model("ticketEmailDelivery", (row) => ({ ...row, ticket: { ...(tables.ticket ?? []).find((ticket) => ticket.id === row.ticketId), attachments: [] } })),
    ticketAttachment: model("ticketAttachment"),
    subscriber: model("subscriber"),
    backInStockSubscription: model("backInStockSubscription"),
    abandonedCheckout: model("abandonedCheckout"),
    couponRedemption: model("couponRedemption"),
    orderNote: model("orderNote"),
    refund: model("refund"),
    consentLog: model("consentLog"),
    $queryRaw: vi.fn(async () => []),
  };
  client.$transaction = async (operation: (tx: unknown) => unknown) => operation(client);
  return { tables, client, sendMail: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: store.client }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ JOBS_SECRET: "jobs-secret" }) }));
vi.mock("@/lib/support/photos", () => ({ removeSupportPhotos: vi.fn() }));
vi.mock("@/lib/email/mailer", () => ({ sendMail: store.sendMail, sendOrderConfirmationEmail: store.sendMail, sendOrderShippedEmail: store.sendMail }));
vi.mock("@/lib/jobs/review-requests", () => ({ sendDueReviewRequests: vi.fn(async () => ({ sent: 0, failed: 0 })) }));
vi.mock("@/lib/jobs/restock-alerts", () => ({ sendPendingRestockAlerts: vi.fn(async () => ({ processed: 0, sent: 0, failed: 0 })) }));
vi.mock("@/lib/jobs/retention", () => ({ runRetention: vi.fn(async () => ({ failed: 0 })) }));

import { POST as dailyJob } from "@/app/api/jobs/daily/route";
import { anonymiseCustomer, exportCustomerData, loadCustomer, loadGuest } from "@/lib/admin/customers";

const ids = (rows: unknown) => (rows as Row[]).map((row) => row.id).sort();
const runDaily = () => dailyJob(new Request("https://nasmeh.example/api/jobs/daily", { method: "POST", headers: { authorization: "Bearer jobs-secret" } }));
const orderBase = {
  phone: "040123456", shippingAddress: { fullName: "Oseba", country: "SI" }, billingAddress: null, anonymizedAt: null, timeline: [], status: "PAID", totalCents: 1000, refundedCents: 0,
  confirmationEmailPending: false, confirmationEmailSentAt: null, confirmationEmailLeaseUntil: null, shippedEmailPending: false, shippedEmailSentAt: null, shippedEmailLeaseUntil: null,
};

beforeEach(() => {
  for (const key of Object.keys(store.tables)) delete store.tables[key];
  store.sendMail.mockReset();
  store.sendMail.mockResolvedValue(undefined);
});

describe("records of another account that share the subject's e-mail (S9, S16)", () => {
  const ANA = "ana@test.si";
  beforeEach(() => {
    store.tables.user = [
      { id: "u1", email: ANA, role: "CUSTOMER", marketingOptIn: false, name: "Ana", tags: [], adminNotes: null, anonymizedAt: null },
      { id: "u2", email: "bojan@test.si", role: "CUSTOMER", marketingOptIn: false, name: "Bojan", tags: [], adminNotes: null, anonymizedAt: null },
    ];
    store.tables.order = [
      { ...orderBase, id: "o-own", number: "NS-1", userId: "u1", email: "drug@test.si" },
      { ...orderBase, id: "o-guest", number: "NS-2", userId: null, email: ANA },
      // Bojan, signed in, typed Ana's address at checkout (a gift): Bojan's order, not Ana's.
      { ...orderBase, id: "o-foreign", number: "NS-3", userId: "u2", email: ANA, shippingAddress: { fullName: "Bojan", country: "SI" } },
    ];
    store.tables.orderItem = [{ id: "i-guest", orderId: "o-guest" }, { id: "i-foreign", orderId: "o-foreign" }];
    store.tables.review = [
      { id: "r-own", userId: "u1", orderItemId: null },
      { id: "r-guest", userId: null, orderItemId: "i-guest" },
      { id: "r-foreign", userId: "u2", orderItemId: "i-foreign" },
      { id: "r-foreign-on-guest-item", userId: "u2", orderItemId: "i-guest" },
    ];
    store.tables.couponRedemption = [
      { id: "cr-guest", email: ANA, orderId: "o-guest" },
      { id: "cr-foreign", email: ANA, orderId: "o-foreign" },
    ];
    store.tables.ticket = [
      { id: "t-own", userId: "u1", email: ANA, name: "Ana", message: "Moje vprašanje" },
      { id: "t-guest", userId: null, email: ANA, name: "Ana", message: "Brez prijave" },
      { id: "t-foreign", userId: "u2", email: ANA, name: "Bojan", message: "Bojanovo vprašanje" },
    ];
  });

  it("leaves them out of the account export", async () => {
    const data = await exportCustomerData({ userId: "u1" }) as Record<string, unknown>;
    expect(ids(data.orders)).toEqual(["o-guest", "o-own"]);
    expect(ids(data.tickets)).toEqual(["t-guest", "t-own"]);
    expect(ids(data.reviews)).toEqual(["r-guest", "r-own"]);
    expect(ids(data.couponRedemptions)).toEqual(["cr-guest"]);
    expect(JSON.stringify(data)).not.toContain("Bojan");
  });

  it("leaves them off the account detail page and out of its LTV", async () => {
    const page = await loadCustomer("u1");
    expect(ids(page!.orders)).toEqual(["o-guest", "o-own"]);
    expect(ids(page!.tickets)).toEqual(["t-guest", "t-own"]);
    expect(page!.ltvCents).toBe(2000);
  });

  it("never scrubs them when the account is erased", async () => {
    expect(await anonymiseCustomer({ userId: "u1" }, "support@nasmeh.si")).toEqual({ ok: true, orders: 2, tickets: 2 });
    const order = (id: string) => store.tables.order.find((row) => row.id === id)!;
    expect(order("o-foreign")).toMatchObject({ email: ANA, phone: "040123456", shippingAddress: { fullName: "Bojan", country: "SI" }, anonymizedAt: null });
    expect(order("o-guest")).toMatchObject({ email: "anonymised-u1@invalid", phone: null, shippingAddress: { country: "SI", anonymized: true } });
    expect(store.tables.ticket.find((row) => row.id === "t-foreign")).toMatchObject({ email: ANA, name: "Bojan", message: "Bojanovo vprašanje" });
    expect(store.tables.ticket.find((row) => row.id === "t-guest")).toMatchObject({ email: "anonymised-t-guest@invalid", message: "[anonimizirano]" });
    expect(store.tables.couponRedemption.map((row) => [row.id, row.email])).toEqual([["cr-guest", "anonymised@invalid"], ["cr-foreign", ANA]]);
  });

  it("gives a guest only unlinked records", async () => {
    store.tables.user = store.tables.user.filter((row) => row.id !== "u1");
    const data = await exportCustomerData({ email: ANA }) as Record<string, unknown>;
    expect(ids(data.orders)).toEqual(["o-guest"]);
    expect(ids(data.tickets)).toEqual(["t-guest"]);
    expect(ids(data.reviews)).toEqual(["r-guest"]);
    expect(ids(data.couponRedemptions)).toEqual(["cr-guest"]);
    const page = await loadGuest(ANA);
    expect(ids(page!.orders)).toEqual(["o-guest"]);
  });
});

describe("erasure and the daily delivery job (S10, I0)", () => {
  const EMAIL = "gost@test.si";
  beforeEach(() => {
    store.tables.order = [
      // Paid while SMTP was down: the confirmation is still queued.
      { ...orderBase, id: "o1", number: "NS-1", userId: null, email: EMAIL, confirmationEmailPending: true },
      // Shipped while SMTP was down: the shipment mail is still queued.
      { ...orderBase, id: "o2", number: "NS-2", userId: null, email: EMAIL, status: "SHIPPED", trackingNumber: "GLS1", shippedEmailPending: true },
    ];
    store.tables.ticket = [{ id: "t1", userId: null, email: EMAIL, name: "Gost", message: "Vprašanje", topic: "OTHER", reason: null, details: null, reference: "NP-1" }];
    store.tables.ticketEmailDelivery = [
      { id: "d-staff", ticketId: "t1", kind: "STAFF", recipient: "podpora@nasmeh.test", sentAt: null, leaseUntil: null, attempts: 1 },
      { id: "d-customer", ticketId: "t1", kind: "CUSTOMER", recipient: EMAIL, sentAt: null, leaseUntil: null, attempts: 1 },
    ];
  });

  it("leaves no queued ticket, confirmation or shipment mail behind, so the daily job stays at 200", async () => {
    expect(await anonymiseCustomer({ email: EMAIL }, "support@nasmeh.si")).toEqual({ ok: true, orders: 2, tickets: 1 });
    expect(store.tables.ticketEmailDelivery.filter((row) => row.sentAt === null)).toEqual([]);
    expect(store.tables.order.map((row) => [row.id, row.confirmationEmailPending, row.shippedEmailPending])).toEqual([["o1", false, false], ["o2", false, false]]);

    const response = await runDaily();
    const body = await response.json() as Record<string, { processed?: number; failed: number }>;
    expect(response.status).toBe(200);
    for (const key of ["ticketRetries", "confirmationRetries", "shippedRetries"]) expect(body[key]).toMatchObject({ processed: 0, failed: 0 });
    expect(store.sendMail).not.toHaveBeenCalled();
  });

  it("keeps sent delivery history, without the customer's address", async () => {
    store.tables.ticketEmailDelivery.forEach((row) => { row.sentAt = new Date(); });
    await anonymiseCustomer({ email: EMAIL }, "support@nasmeh.si");
    expect(store.tables.ticketEmailDelivery.map((row) => [row.kind, row.recipient])).toEqual([["STAFF", "podpora@nasmeh.test"], ["CUSTOMER", "anonymised-t1@invalid"]]);
    expect((await runDaily()).status).toBe(200);
  });
});

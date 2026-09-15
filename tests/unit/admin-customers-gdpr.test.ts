import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 9 step 4: one data subject for lookup, export (Arts. 15, 20) and anonymisation (Art. 17). */

type MockFn = ReturnType<typeof vi.fn>;
const mocks = vi.hoisted(() => {
  const model = (...names: string[]) => Object.fromEntries(names.map((name) => [name, vi.fn()]));
  const client = {
    user: model("findUnique", "update"),
    order: model("findFirst", "findMany", "update"),
    ticket: model("findFirst", "findMany", "update"),
    subscriber: model("findFirst", "findUnique", "findMany", "deleteMany"),
    backInStockSubscription: model("findFirst", "findMany", "deleteMany"),
    abandonedCheckout: model("findFirst", "findMany", "deleteMany"),
    couponRedemption: model("findMany", "updateMany"),
    address: model("findMany", "deleteMany"),
    cart: model("findUnique", "deleteMany"),
    review: model("findMany", "updateMany"),
    consentLog: model("findMany", "create"),
    authToken: model("deleteMany"),
    orderNote: model("updateMany"),
    refund: model("updateMany"),
    ticketAttachment: model("deleteMany"),
    ticketEmailDelivery: model("deleteMany", "updateMany"),
  };
  return { client, removeSupportPhotos: vi.fn(), queryRaw: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: { ...mocks.client, $queryRaw: mocks.queryRaw, $transaction: (operation: (tx: unknown) => unknown) => operation(mocks.client) } }));
vi.mock("@/lib/support/photos", () => ({ removeSupportPhotos: mocks.removeSupportPhotos }));

import { anonymiseCustomer, consentReferenceQuery, exportCustomerData, loadCustomer, loadGuest, resolveCustomerSubject, subjectOrderWhere, subjectReviewWhere, subjectTicketWhere, type CustomerSubject } from "@/lib/admin/customers";
import { marketingVersion } from "@/lib/consent-log";

const c = mocks.client;
const guest: CustomerSubject = { type: "guest", userId: null, email: "gost@test.si" };
const account: CustomerSubject = { type: "account", userId: "u1", email: "ana@test.si", role: "CUSTOMER", marketingOptIn: true };

beforeEach(() => {
  vi.resetAllMocks();
  for (const model of Object.values(c)) {
    for (const [name, method] of Object.entries(model)) {
      (method as MockFn).mockResolvedValue(name === "findMany" ? [] : name.endsWith("Many") ? { count: 0 } : null);
    }
  }
  c.consentLog.create.mockResolvedValue({ id: "consent" });
  mocks.queryRaw.mockResolvedValue([]);
});

/** The reference-consent statement's bound arrays: order numbers, subscriber ids, subscription ids (and the limit, when set). */
const rawValues = (call = 0) => (mocks.queryRaw.mock.calls[call][0] as Prisma.Sql).values;

describe("the data subject", () => {
  it("finds a guest through any e-mail-bearing row, normalising the address", async () => {
    c.subscriber.findFirst.mockResolvedValue({ id: "s1" });
    expect(await resolveCustomerSubject(c as never, { email: "  Gost@Test.SI " })).toEqual(guest);
    expect(c.order.findFirst).toHaveBeenCalledWith({ where: { userId: null, email: "gost@test.si" }, select: { id: true } });
    expect(c.ticket.findFirst).toHaveBeenCalledWith({ where: { userId: null, email: "gost@test.si" }, select: { id: true } });
    expect(c.backInStockSubscription.findFirst).not.toHaveBeenCalled();

    vi.resetAllMocks();
    c.abandonedCheckout.findFirst.mockResolvedValue({ id: "a1" });
    expect(await resolveCustomerSubject(c as never, { email: "gost@test.si" })).toEqual(guest);

    vi.resetAllMocks();
    expect(await resolveCustomerSubject(c as never, { email: "nihce@test.si" })).toBeNull();
    expect(await resolveCustomerSubject(c as never, { email: "   " })).toBeNull();
  });

  it("finds an account by id with its role and marketing choice", async () => {
    c.user.findUnique.mockResolvedValue({ id: "u1", email: "ana@test.si", role: "CUSTOMER", marketingOptIn: true });
    expect(await resolveCustomerSubject(c as never, { userId: "u1" })).toEqual(account);
  });

  it("matches an account's own rows and its unlinked rows by e-mail, never another account's; a guest's only unlinked ones", () => {
    expect(subjectOrderWhere(account)).toEqual({ OR: [{ userId: "u1" }, { userId: null, email: "ana@test.si" }] });
    expect(subjectTicketWhere(account)).toEqual({ OR: [{ userId: "u1" }, { userId: null, email: "ana@test.si" }] });
    expect(subjectOrderWhere(guest)).toEqual({ userId: null, email: "gost@test.si" });
    expect(subjectTicketWhere(guest)).toEqual({ userId: null, email: "gost@test.si" });
    expect(subjectReviewWhere(account, ["i1"])).toEqual({ OR: [{ userId: "u1" }, { userId: null, orderItemId: { in: ["i1"] } }] });
    expect(subjectReviewWhere(guest, ["i1"])).toEqual({ OR: [{ userId: null, orderItemId: { in: ["i1"] } }] });
  });

  it("finds unlinked consent rows by the order, subscriber and subscription ids in choices with one indexable statement", () => {
    expect(consentReferenceQuery({ orderNumbers: [], subscriberIds: [], subscriptionIds: [] })).toBeNull();
    const query = consentReferenceQuery({ orderNumbers: ["NS-1", "NS-2"], subscriberIds: ["s1"], subscriptionIds: [] }, 50)!;
    const sql = query.text.replace(/\s+/g, " ");
    // Cookie rows never carry a reference; rows linked to an account are read by userId instead.
    expect(sql).toContain(`WHERE "kind" <> 'cookie' AND "userId" IS NULL`);
    for (const key of ["orderNumber", "subscriberId", "subscriptionId"]) expect(sql).toContain(`("choices"->>'${key}') = ANY($`);
    expect(sql).toMatch(/ORDER BY "createdAt" DESC, "id" DESC LIMIT \$4$/);
    expect(query.values).toEqual([["NS-1", "NS-2"], ["s1"], [], 50]);
    expect(consentReferenceQuery({ orderNumbers: ["NS-1"], subscriberIds: [], subscriptionIds: [] })!.text).not.toContain("LIMIT");
  });

  it("loads a subscriber-only guest page instead of a 404", async () => {
    c.subscriber.findFirst.mockResolvedValue({ id: "s1" });
    c.subscriber.findUnique.mockResolvedValue({ id: "s1", status: "CONFIRMED" });
    mocks.queryRaw.mockResolvedValue([{ id: "consent", createdAt: new Date() }]);
    const page = await loadGuest("gost@test.si");
    expect(page).toMatchObject({ email: "gost@test.si", orders: [], tickets: [], subscriber: { id: "s1", status: "CONFIRMED" }, anonymizedAt: null, ltvCents: 0, consents: [{ id: "consent" }] });
    expect(c.consentLog.findMany).not.toHaveBeenCalled();
    expect(rawValues()).toEqual([[], ["s1"], [], 50]);
  });

  it("merges an account's linked and referenced consent rows newest first, capped on the detail page", async () => {
    c.user.findUnique.mockResolvedValue({ id: "u1", email: "ana@test.si", role: "CUSTOMER", marketingOptIn: true, tags: [], addresses: [], _count: { reviews: 0 } });
    c.order.findMany.mockResolvedValue([{ id: "o1", number: "NS-1", status: "PAID", totalCents: 100, refundedCents: 0 }]);
    const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 10, minute));
    c.consentLog.findMany.mockResolvedValue([{ id: "linked-new", createdAt: at(30) }, { id: "linked-old", createdAt: at(10) }]);
    mocks.queryRaw.mockResolvedValue([{ id: "ref", createdAt: at(20) }]);
    const page = await loadCustomer("u1");
    expect(page!.consents.map((row) => row.id)).toEqual(["linked-new", "ref", "linked-old"]);
    expect(c.consentLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" }, take: 50 }));
    expect(rawValues()).toEqual([["NS-1"], [], [], 50]);
    expect(c.order.findMany.mock.calls[0][0].where).toEqual({ OR: [{ userId: "u1" }, { userId: null, email: "ana@test.si" }] });
    expect(c.ticket.findMany.mock.calls[0][0].where).toEqual({ OR: [{ userId: "u1" }, { userId: null, email: "ana@test.si" }] });
  });
});

describe("GDPR export", () => {
  it("exports a guest with only a back-in-stock subscription, including its consent rows", async () => {
    c.backInStockSubscription.findFirst.mockResolvedValue({ id: "b1" });
    c.backInStockSubscription.findMany.mockResolvedValue([{ id: "b1", email: "gost@test.si", status: "CONFIRMED" }]);
    mocks.queryRaw.mockResolvedValue([{ id: "bis-consent", kind: "back-in-stock", createdAt: new Date() }]);
    const data = await exportCustomerData({ email: "gost@test.si" });
    expect(data).toMatchObject({ profile: { email: "gost@test.si", guest: true }, addresses: [], cart: null, orders: [], backInStock: [{ id: "b1" }], consents: [{ id: "bis-consent" }] });
    expect(rawValues()).toEqual([[], [], ["b1"]]);
    expect(c.consentLog.findMany).not.toHaveBeenCalled();
    expect(c.address.findMany).not.toHaveBeenCalled();
    expect(c.review.findMany.mock.calls[0][0].where).toEqual({ OR: [{ userId: null, orderItemId: { in: [] } }] });
    expect(c.couponRedemption.findMany.mock.calls[0][0].where).toEqual({ order: { userId: null, email: "gost@test.si" } });
  });

  it("exports an account with its guest orders, reviews by order item, checkout consents and e-mail-keyed rows, without secrets", async () => {
    c.user.findUnique.mockImplementation(async ({ select }) => select.role && !select.name
      ? { id: "u1", email: "ana@test.si", role: "CUSTOMER", marketingOptIn: true }
      : { id: "u1", email: "ana@test.si", name: "Ana Kovač" });
    c.order.findMany.mockResolvedValue([{ id: "o1", number: "NS-1", items: [{ id: "i1" }] }, { id: "o2", number: "NS-2", items: [{ id: "i2" }] }]);
    c.ticket.findMany.mockResolvedValue([{ id: "t1", attachments: [{ filename: "x.webp", size: 1 }] }]);
    c.subscriber.findMany.mockResolvedValue([{ id: "s1" }]);
    c.abandonedCheckout.findMany.mockResolvedValue([{ id: "a1", cartSnapshot: [] }]);
    const data = await exportCustomerData({ userId: "u1" });
    expect(data).toMatchObject({ profile: { name: "Ana Kovač" }, abandonedCheckouts: [{ id: "a1" }], tickets: [{ attachments: [{ filename: "x.webp" }] }] });

    const profileSelect = c.user.findUnique.mock.calls[1][0].select;
    for (const secret of ["passwordHash", "totpSecret", "totpRecoveryCodes", "totpLastStep", "sessionVersion"]) expect(profileSelect).not.toHaveProperty(secret);
    const orderQuery = c.order.findMany.mock.calls[0][0];
    expect(orderQuery.where).toEqual({ OR: [{ userId: "u1" }, { userId: null, email: "ana@test.si" }] });
    expect(c.ticket.findMany.mock.calls[0][0].where).toEqual({ OR: [{ userId: "u1" }, { userId: null, email: "ana@test.si" }] });
    expect(c.couponRedemption.findMany.mock.calls[0][0].where).toEqual({ order: { OR: [{ userId: "u1" }, { userId: null, email: "ana@test.si" }] } });
    for (const hidden of ["checkoutKey", "stripePaymentIntentId", "paypalOrderId", "timeline"]) expect(orderQuery.select).not.toHaveProperty(hidden);
    expect(orderQuery.select.notes.where).toEqual({ visibleToCustomer: true });
    expect(orderQuery.select.invoiceSnapshot).toBe(true);
    const ticketSelect = c.ticket.findMany.mock.calls[0][0].select;
    expect(ticketSelect.attachments.select).not.toHaveProperty("id");
    expect(ticketSelect).not.toHaveProperty("internalNote");
    expect(c.abandonedCheckout.findMany.mock.calls[0][0].select).not.toHaveProperty("recoveryToken");
    expect(c.subscriber.findMany.mock.calls[0][0].select).not.toHaveProperty("confirmToken");
    expect(c.review.findMany.mock.calls[0][0].where).toEqual({ OR: [{ userId: "u1" }, { userId: null, orderItemId: { in: ["i1", "i2"] } }] });
    expect(c.consentLog.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: "u1" } });
    expect(c.consentLog.findMany.mock.calls[0][0]).not.toHaveProperty("take");
    // The export is uncapped: no LIMIT value is bound.
    expect(rawValues()).toEqual([["NS-1", "NS-2"], ["s1"], []]);
  });

  it("returns null for an unknown person", async () => {
    expect(await exportCustomerData({ email: "nihce@test.si" })).toBeNull();
    expect(await exportCustomerData({ userId: "missing" })).toBeNull();
  });
});

describe("anonymisation", () => {
  it("covers exactly the rows the export reads", async () => {
    c.user.findUnique.mockResolvedValue({ id: "u1", email: "ana@test.si", role: "CUSTOMER", marketingOptIn: false });
    await exportCustomerData({ userId: "u1" });
    await anonymiseCustomer({ userId: "u1" }, "support@nasmeh.si");
    const [exportOrders, anonymiseOrders] = c.order.findMany.mock.calls.map((call) => call[0].where);
    expect(anonymiseOrders).toEqual(exportOrders);
    const [exportTickets, anonymiseTickets] = c.ticket.findMany.mock.calls.map((call) => call[0].where);
    expect(anonymiseTickets).toEqual(exportTickets);
    for (const model of [c.abandonedCheckout, c.subscriber, c.backInStockSubscription]) {
      expect(model.deleteMany).toHaveBeenCalledWith({ where: { email: "ana@test.si" } });
      expect(model.findMany.mock.calls[0][0].where).toEqual({ email: "ana@test.si" });
    }
    // Redemptions follow their orders: exported through the order filter, erased through the matched order ids.
    expect(c.couponRedemption.findMany.mock.calls[0][0].where).toEqual({ order: exportOrders });
    expect(c.couponRedemption.updateMany).not.toHaveBeenCalled();
  });

  it("erases a ticket-only guest: mail queue (receipt and staff alert), delivery recipient, photos and text, with no consent row", async () => {
    c.ticket.findFirst.mockResolvedValue({ id: "t1" });
    c.ticket.findMany.mockResolvedValue([{ id: "t1", attachments: [{ filename: "p.webp" }] }]);
    expect(await anonymiseCustomer({ email: "gost@test.si" }, "support@nasmeh.si")).toEqual({ ok: true, orders: 0, tickets: 1 });
    expect(c.ticketEmailDelivery.deleteMany).toHaveBeenCalledWith({ where: { ticketId: "t1", sentAt: null } });
    expect(c.ticketEmailDelivery.updateMany).toHaveBeenCalledWith({ where: { ticketId: "t1", kind: "CUSTOMER" }, data: { recipient: "anonymised-t1@invalid", lastError: null } });
    expect(c.ticketEmailDelivery.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(c.ticketEmailDelivery.updateMany.mock.invocationCallOrder[0]);
    expect(c.ticket.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { name: "—", email: "anonymised-t1@invalid", message: "[anonimizirano]", details: Prisma.DbNull, internalNote: null } });
    expect(c.orderNote.updateMany).not.toHaveBeenCalled();
    expect(c.consentLog.create).not.toHaveBeenCalled();
    expect(c.subscriber.deleteMany).toHaveBeenCalledWith({ where: { email: "gost@test.si" } });
    expect(mocks.removeSupportPhotos).toHaveBeenCalledWith([{ filename: "p.webp" }]);
  });

  it("logs the end of an account's opt-in, scrubs notes and keeps the invoice snapshot", async () => {
    c.user.findUnique.mockResolvedValue({ id: "u1", email: "ana@test.si", role: "CUSTOMER", marketingOptIn: true });
    c.order.findMany.mockResolvedValue([{ id: "o1", number: "NS-1", shippingAddress: { fullName: "Ana", country: "SI" }, billingAddress: null, marketingOptIn: true }]);
    expect(await anonymiseCustomer({ userId: "u1" }, "support@nasmeh.si")).toEqual({ ok: true, orders: 1, tickets: 0 });
    expect(c.consentLog.create).toHaveBeenCalledWith({ data: {
      kind: "marketing-preference", version: marketingVersion("marketing-preference"), userId: "u1", visitorId: null,
      choices: { marketing: false, previous: true, reason: "anonymised" },
    } });
    const orderUpdate = c.order.update.mock.calls[0][0];
    expect(orderUpdate.data).toMatchObject({
      email: "anonymised-u1@invalid", phone: null, shippingAddress: { country: "SI", anonymized: true }, billingAddress: Prisma.DbNull,
      confirmationEmailPending: false, shippedEmailPending: false,
    });
    expect(c.couponRedemption.updateMany).toHaveBeenCalledWith({ where: { orderId: { in: ["o1"] } }, data: { email: "anonymised@invalid" } });
    expect(orderUpdate.data).not.toHaveProperty("invoiceSnapshot");
    expect(orderUpdate.data).not.toHaveProperty("legalAcceptance");
    expect(c.orderNote.updateMany).toHaveBeenCalledWith({
      where: { orderId: { in: ["o1"] }, OR: [{ visibleToCustomer: true }, { body: { contains: "ana@test.si", mode: "insensitive" } }] },
      data: { body: "[anonimizirano]" },
    });
    expect(c.refund.updateMany).toHaveBeenCalledWith({ where: { orderId: { in: ["o1"] }, reason: { contains: "ana@test.si", mode: "insensitive" } }, data: { reason: "[anonimizirano]" } });
    expect(c.user.update.mock.calls[0][0].data).toMatchObject({ email: "anonymised-u1@invalid", name: null, passwordHash: null, marketingOptIn: false });
    expect(c.consentLog.create.mock.invocationCallOrder[0]).toBeLessThan(c.user.update.mock.invocationCallOrder[0]);
  });

  it("links a guest's withdrawal row to the latest order and the confirmed subscription", async () => {
    c.order.findFirst.mockResolvedValue({ id: "o2" });
    c.order.findMany.mockResolvedValue([
      { id: "o2", number: "NS-2", shippingAddress: {}, billingAddress: null, marketingOptIn: true },
      { id: "o1", number: "NS-1", shippingAddress: {}, billingAddress: null, marketingOptIn: false },
    ]);
    c.subscriber.findUnique.mockResolvedValue({ id: "s1", status: "CONFIRMED" });
    await anonymiseCustomer({ email: "gost@test.si" }, "support@nasmeh.si");
    expect(c.consentLog.create.mock.calls[0][0].data).toMatchObject({ userId: null, choices: { marketing: false, previous: true, reason: "anonymised", subscriberId: "s1", orderNumber: "NS-2" } });
    expect(c.order.update.mock.calls.map((call) => call[0].data.email)).toEqual(["anonymised-o2@invalid", "anonymised-o1@invalid"]);
  });

  it.each([
    ["an unconfirmed double opt-in", { id: "s1", status: "PENDING" }],
    ["an ended subscription", { id: "s1", status: "UNSUBSCRIBED" }],
    ["no subscription", null],
  ])("logs no withdrawal for a guest whose ticked checkout box led to %s (S12)", async (_label, subscriber) => {
    c.order.findFirst.mockResolvedValue({ id: "o2" });
    // A ticked box is a double opt-in request; it is not a consent the erasure could withdraw.
    c.order.findMany.mockResolvedValue([{ id: "o2", number: "NS-2", shippingAddress: {}, billingAddress: null, marketingOptIn: true }]);
    c.subscriber.findUnique.mockResolvedValue(subscriber);
    expect(await anonymiseCustomer({ email: "gost@test.si" }, "support@nasmeh.si")).toEqual({ ok: true, orders: 1, tickets: 0 });
    expect(c.consentLog.create).not.toHaveBeenCalled();
    expect(c.order.findMany.mock.calls[0][0].select).not.toHaveProperty("marketingOptIn");
  });

  it("logs no withdrawal for an account that never opted in and has no confirmed subscription", async () => {
    c.user.findUnique.mockResolvedValue({ id: "u1", email: "ana@test.si", role: "CUSTOMER", marketingOptIn: false });
    c.subscriber.findUnique.mockResolvedValue({ id: "s1", status: "PENDING" });
    await anonymiseCustomer({ userId: "u1" }, "support@nasmeh.si");
    expect(c.consentLog.create).not.toHaveBeenCalled();
  });

  it("refuses staff accounts and unknown people before any write", async () => {
    c.user.findUnique.mockResolvedValue({ id: "s1", email: "owner@nasmeh.si", role: "OWNER", marketingOptIn: false });
    expect(await anonymiseCustomer({ userId: "s1" }, "support@nasmeh.si")).toEqual({ ok: false, reason: "staff" });
    c.user.findUnique.mockResolvedValue(null);
    expect(await anonymiseCustomer({ email: "nihce@test.si" }, "support@nasmeh.si")).toEqual({ ok: false, reason: "not_found" });
    expect(c.user.update).not.toHaveBeenCalled();
    expect(c.subscriber.deleteMany).not.toHaveBeenCalled();
    expect(c.consentLog.create).not.toHaveBeenCalled();
  });
});

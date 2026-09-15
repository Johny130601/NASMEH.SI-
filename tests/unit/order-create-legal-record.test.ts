import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * placeOrder's legal record (Phase 9 step 4): Order.legalAcceptance inside the
 * order transaction, the marketing-checkout ConsentLog row through
 * recordConsent, and the checkout newsletter double opt-in whose verification
 * mail goes out only after commit, off the order response (`after`).
 */

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  findOrder: vi.fn(), updateOrder: vi.fn(), findVariants: vi.fn(), transaction: vi.fn(),
  auth: vi.fn(), getProvider: vi.fn(), createIntent: vi.fn(), pricing: vi.fn(), quoteMatches: vi.fn(),
  nextNumber: vi.fn(), legalLinks: vi.fn(), sendVerification: vi.fn(), clearCode: vi.fn(),
  after: vi.fn(), afterTasks: [] as Array<() => unknown>,
  tx: {
    order: { create: vi.fn() },
    contentPage: { findFirst: vi.fn() },
    subscriber: { findUnique: vi.fn(), createManyAndReturn: vi.fn(), updateMany: vi.fn() },
    consentLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: {
  order: { findUnique: mocks.findOrder, update: mocks.updateOrder },
  variant: { findMany: mocks.findVariants },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: mocks.getProvider }));
vi.mock("@/lib/payments/paypal", () => ({ capturePayPalOrder: vi.fn() }));
vi.mock("@/lib/koda", () => ({ clearKodaCode: mocks.clearCode }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
vi.mock("@/lib/settings", () => ({ getLegalLinks: mocks.legalLinks }));
vi.mock("@/lib/email/mailer", () => ({ sendSubscriptionVerification: mocks.sendVerification }));
vi.mock("@/lib/orders/quote", () => ({ buildCheckoutPricing: mocks.pricing, quoteMatches: mocks.quoteMatches }));
vi.mock("@/lib/promo/resolve", () => ({ resolveCouponInput: vi.fn() }));
vi.mock("@/lib/promo/coupons", () => ({ priceCartWithCoupon: vi.fn() }));
vi.mock("@/lib/orders/numbers", () => ({ nextOrderNumber: mocks.nextNumber }));
vi.mock("next/server", () => ({ after: mocks.after }));

import { placeOrder } from "@/lib/orders/create";
import { marketingVersion } from "@/lib/consent-log";

const ORDER_NUMBER = "NS-2026-00077";
const EMAIL = "kupec@example.test";
const pageUpdatedAt = new Date("2026-09-01T08:30:00.000Z");
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const input = {
  email: "Kupec@Example.test", phone: "", fullName: "Živa Ščuk", street: "Čopova ulica", streetNumber: "12",
  city: "Ljubljana", postalCode: "1000", country: "SI", shippingMethodId: "ps-standard", provider: "test",
  marketingOptIn: false, turnstileToken: "", checkoutKey: "a".repeat(32), quoteToken: "b".repeat(64),
};

/** Runs what placeOrder handed to `after`, as Next.js does once the response is sent. */
async function runAfterResponse() {
  for (const task of mocks.afterTasks.splice(0)) await task();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.events.length = 0;
  mocks.afterTasks.length = 0;
  mocks.after.mockImplementation((task: () => unknown) => { mocks.afterTasks.push(task); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue(null);
  mocks.findOrder.mockResolvedValue(null);
  mocks.updateOrder.mockResolvedValue({});
  mocks.quoteMatches.mockReturnValue(true);
  mocks.pricing.mockResolvedValue({
    hydrated: [],
    priced: { lines: [{ variantId: "v1", title: "Belilni trakci", sku: "BT-1", unitPriceCents: 1999, quantity: 1, isBundle: false }] },
    coupon: null,
    quote: { token: "b".repeat(64), subtotalCents: 1999, discountCents: 0, shippingCents: 390, totalCents: 2389, vatCents: 431 },
    method: { label: "Pošta Slovenije" },
    settings: { vatRatePercent: 22 },
    display: { code: null },
  });
  mocks.findVariants.mockResolvedValue([{ id: "v1", stock: 5, title: "Belilni trakci", allowBackorder: false }]);
  mocks.legalLinks.mockResolvedValue({
    terms: "/pogoji-poslovanja?e2e=1", privacy: "/politika-zasebnosti", cookies: "/politika-piskotkov",
    withdrawal: "/odstop-od-pogodbe", complaints: "/reklamacije",
  });
  mocks.nextNumber.mockResolvedValue(ORDER_NUMBER);
  mocks.getProvider.mockImplementation((name: string) => ({ name, createIntent: mocks.createIntent, retrieveIntent: vi.fn() }));
  mocks.createIntent.mockImplementation(async () => {
    mocks.events.push("payment-intent");
    return { provider: "test", intentId: "test_pi_1", clientSecret: "secret", status: "requires_payment_method" };
  });
  mocks.tx.contentPage.findFirst.mockImplementation(async ({ where }: { where: { slug: string } }) => ({ title: `Stran ${where.slug}`, body: `<p>${where.slug}</p>`, updatedAt: pageUpdatedAt }));
  mocks.tx.order.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "order-1", number: data.number, status: "PENDING", email: data.email, userId: null, paymentProvider: "test",
    totalCents: 2389, currency: "EUR", stripePaymentIntentId: null, paypalOrderId: null, checkoutKey: data.checkoutKey,
  }));
  mocks.tx.consentLog.create.mockResolvedValue({});
  mocks.tx.subscriber.createManyAndReturn.mockResolvedValue([{ id: "sub-1" }]);
  mocks.tx.subscriber.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => {
    const value = await callback(mocks.tx);
    mocks.events.push("commit");
    return value;
  });
  mocks.sendVerification.mockImplementation(async () => { mocks.events.push("verification-mail"); });
});

afterEach(() => vi.restoreAllMocks());

function createdOrderData(): Record<string, unknown> {
  return mocks.tx.order.create.mock.calls[0][0].data;
}

describe("placeOrder legal record", () => {
  it("stores which terms and withdrawal pages were in force, resolved from legal.links without the query", async () => {
    const result = await placeOrder(input);
    expect(result).toMatchObject({ ok: true, orderNumber: ORDER_NUMBER, created: true });

    const data = createdOrderData();
    expect(mocks.tx.contentPage.findFirst).toHaveBeenCalledWith({ where: { slug: "pogoji-poslovanja", published: true }, select: { title: true, body: true, updatedAt: true } });
    // The accepted text itself is stored next to its hash, so the confirmation can print what was accepted.
    expect(data.legalAcceptance).toEqual({
      acceptedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      noticeVersion: expect.stringMatching(/^t-[0-9a-f]{12}$/),
      pages: [
        { key: "terms", path: "/pogoji-poslovanja", slug: "pogoji-poslovanja", updatedAt: pageUpdatedAt.toISOString(), sha256: sha("<p>pogoji-poslovanja</p>"),
          title: "Stran pogoji-poslovanja", body: "<p>pogoji-poslovanja</p>" },
        { key: "withdrawal", path: "/odstop-od-pogodbe", slug: "odstop-od-pogodbe", updatedAt: pageUpdatedAt.toISOString(), sha256: sha("<p>odstop-od-pogodbe</p>"),
          title: "Stran odstop-od-pogodbe", body: "<p>odstop-od-pogodbe</p>" },
      ],
    });
    // The acceptance moment and the timeline's creation entry are the same instant.
    const legal = data.legalAcceptance as { acceptedAt: string };
    expect((data.timeline as Array<{ at: string }>)[0].at).toBe(legal.acceptedAt);
  });

  it("places the order with a null hash when a legal page is missing", async () => {
    mocks.tx.contentPage.findFirst.mockResolvedValue(null);
    expect(await placeOrder(input)).toMatchObject({ ok: true, orderNumber: ORDER_NUMBER });
    const pages = (createdOrderData().legalAcceptance as { pages: Array<{ slug: string; sha256: string | null }> }).pages;
    expect(pages).toEqual([
      expect.objectContaining({ slug: "pogoji-poslovanja", updatedAt: null, sha256: null, title: null, body: null }),
      expect.objectContaining({ slug: "odstop-od-pogodbe", updatedAt: null, sha256: null, title: null, body: null }),
    ]);
  });
});

describe("placeOrder checkout marketing consent", () => {
  it("logs an unticked box as not given with the wording version, and enrols nobody", async () => {
    await placeOrder(input);
    expect(createdOrderData().marketingOptIn).toBe(false);
    expect(mocks.tx.consentLog.create).toHaveBeenCalledWith({ data: {
      kind: "marketing-checkout", version: marketingVersion("marketing-checkout"), userId: null, visitorId: null,
      choices: { marketing: false, action: "not-given", orderNumber: ORDER_NUMBER },
    } });
    expect(marketingVersion("marketing-checkout")).not.toBe("1");
    expect(mocks.tx.subscriber.findUnique).not.toHaveBeenCalled();
    expect(mocks.tx.subscriber.createManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.tx.subscriber.updateMany).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.sendVerification).not.toHaveBeenCalled();
  });

  it("arms a PENDING checkout subscriber in the order transaction and mails the verification only after the response", async () => {
    mocks.tx.subscriber.findUnique.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    expect(await placeOrder({ ...input, marketingOptIn: true })).toMatchObject({ ok: true, orderNumber: ORDER_NUMBER, created: true });

    const created = mocks.tx.subscriber.createManyAndReturn.mock.calls[0][0];
    expect(created).toMatchObject({ data: [{ email: EMAIL, source: "checkout" }], skipDuplicates: true });
    expect(mocks.tx.consentLog.create).toHaveBeenCalledWith({ data: {
      kind: "marketing-checkout", version: marketingVersion("marketing-checkout"), userId: "user-1", visitorId: null,
      choices: { marketing: true, action: "pending-confirmation", orderNumber: ORDER_NUMBER, subscriberId: "sub-1" },
    } });
    // placeOrder returned without sending: the mail waits for `after`.
    expect(mocks.sendVerification).not.toHaveBeenCalled();
    await runAfterResponse();
    expect(mocks.sendVerification).toHaveBeenCalledWith(EMAIL, created.data[0].confirmToken, "sub-1");
    expect(mocks.events).toEqual(["commit", "payment-intent", "verification-mail"]);
  });

  it("re-sends the existing token for a still PENDING subscriber instead of invalidating the earlier mail", async () => {
    mocks.tx.subscriber.findUnique.mockResolvedValue({ id: "sub-2", status: "PENDING", confirmToken: "p".repeat(48) });
    await placeOrder({ ...input, marketingOptIn: true });
    expect(mocks.tx.subscriber.updateMany).toHaveBeenCalledWith({
      where: { id: "sub-2", status: "PENDING", confirmToken: "p".repeat(48) }, data: { updatedAt: expect.any(Date) },
    });
    await runAfterResponse();
    expect(mocks.sendVerification).toHaveBeenCalledWith(EMAIL, "p".repeat(48), "sub-2");
  });

  it("never downgrades or re-mails an already CONFIRMED subscriber", async () => {
    mocks.tx.subscriber.findUnique.mockResolvedValue({ id: "sub-9", status: "CONFIRMED", confirmToken: "c".repeat(48) });
    await placeOrder({ ...input, marketingOptIn: true });
    expect(mocks.tx.subscriber.createManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.tx.subscriber.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.consentLog.create.mock.calls[0][0].data.choices).toEqual({
      marketing: true, action: "already-confirmed", orderNumber: ORDER_NUMBER, subscriberId: "sub-9",
    });
    await runAfterResponse();
    expect(mocks.sendVerification).not.toHaveBeenCalled();
  });

  it("keeps the placed order when the verification mail fails", async () => {
    mocks.tx.subscriber.findUnique.mockResolvedValue(null);
    mocks.sendVerification.mockRejectedValue(new Error("smtp down"));
    expect(await placeOrder({ ...input, marketingOptIn: true })).toMatchObject({ ok: true, orderNumber: ORDER_NUMBER, created: true });
    await expect(runAfterResponse()).resolves.toBeUndefined();
  });

  it("returns the order while the mailer hangs, also outside a request scope", async () => {
    mocks.after.mockImplementation(() => { throw new Error("`after` was called outside a request scope"); });
    mocks.tx.subscriber.findUnique.mockResolvedValue(null);
    mocks.sendVerification.mockImplementation(() => new Promise(() => {}));
    const outcome = await Promise.race([
      placeOrder({ ...input, marketingOptIn: true }),
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 1_000)),
    ]);
    expect(outcome).toMatchObject({ ok: true, orderNumber: ORDER_NUMBER, created: true, clientSecret: "secret" });
    // The send did start (detached); the order result never waited for it.
    expect(mocks.sendVerification).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the order transaction rolls back", async () => {
    mocks.tx.subscriber.findUnique.mockResolvedValue(null);
    mocks.tx.consentLog.create.mockRejectedValue(new Error("write failed"));
    expect(await placeOrder({ ...input, marketingOptIn: true })).toEqual({ ok: false, error: "order_failed" });
    expect(mocks.after).not.toHaveBeenCalled();
    await runAfterResponse();
    expect(mocks.sendVerification).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });
});

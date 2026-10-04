import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 step 4: restock-alert confirmation and unsubscribe happen only in
 * POST actions. Both flip status conditionally and log once, with the
 * subscription id, the product and the account that owns the address.
 * The capture itself (findings A1, A2, A4) answers uniformly, writes
 * conditionally like the newsletter path, and bounds the verification mails.
 */

const mocks = vi.hoisted(() => ({
  human: vi.fn(), transaction: vi.fn(), consent: vi.fn(), sendMail: vi.fn(),
  product: { findUnique: vi.fn() },
  dbSubscription: { findUnique: vi.fn(), createManyAndReturn: vi.fn(), updateMany: vi.fn() },
  subscription: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: {
  $transaction: mocks.transaction, product: mocks.product, backInStockSubscription: mocks.dbSubscription,
} }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.human }));
vi.mock("@/lib/email/mailer", () => ({ sendBackInStockVerification: mocks.sendMail }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-restock-secret" }) }));

import {
  confirmBackInStockAction,
  subscribeBackInStockAction,
  unsubscribeBackInStockAction,
} from "@/app/(storefront)/actions/backInStock";
import { signUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";
import { marketingVersion } from "@/lib/consent-log";
import { __resetRateLimits } from "@/lib/rate-limit";
import { backInStock as copy } from "@/lib/copy";

const ID = "cmf0restocksubscription01";
const TOKEN = "b".repeat(48);
const tx = { backInStockSubscription: mocks.subscription, user: mocks.user, consentLog: { create: mocks.consent } };
const row = {
  id: ID, email: "ana@test.si", status: "PENDING", source: "back-in-stock", confirmToken: TOKEN, product: { slug: "belilni-trakci" },
};
const PRODUCT = { id: "cmf0product01", title: "Belilni trakci", slug: "belilni-trakci", variants: [{ id: "cmf0variant01" }] };
/** Older than the re-send cooldown, so the mail is not suppressed unless a test says so. */
const stored = { id: ID, status: "PENDING", confirmToken: TOKEN, notifiedAt: null, updatedAt: new Date(Date.now() - 60 * 60_000) };
const submit = (email = " Ana@Test.si ") =>
  subscribeBackInStockAction({ email, productSlug: "belilni-trakci", turnstileToken: "human" });

beforeEach(() => {
  vi.resetAllMocks();
  __resetRateLimits();
  mocks.human.mockResolvedValue(true);
  mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx));
  mocks.subscription.findUnique.mockResolvedValue(row);
  mocks.subscription.updateMany.mockResolvedValue({ count: 1 });
  mocks.user.findFirst.mockResolvedValue(null);
  mocks.product.findUnique.mockResolvedValue(PRODUCT);
  mocks.dbSubscription.findUnique.mockResolvedValue(null);
  mocks.dbSubscription.createManyAndReturn.mockResolvedValue([{ id: ID }]);
  mocks.dbSubscription.updateMany.mockResolvedValue({ count: 1 });
});

describe("subscribeBackInStockAction", () => {
  it("stores a pending alert for a new address and mails the verification link", async () => {
    expect(await submit()).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscription.createManyAndReturn).toHaveBeenCalledWith({
      data: [{
        email: "ana@test.si", productId: PRODUCT.id, variantId: PRODUCT.variants[0].id,
        confirmToken: expect.stringMatching(/^[a-f0-9]{48}$/),
      }],
      skipDuplicates: true,
      select: { id: true },
    });
    const created = mocks.dbSubscription.createManyAndReturn.mock.calls[0][0].data[0].confirmToken;
    expect(mocks.sendMail).toHaveBeenCalledWith("ana@test.si", created, PRODUCT.title, ID);
  });

  it("answers the same for an address that already holds a confirmed alert, and mails nothing (finding A1)", async () => {
    mocks.dbSubscription.findUnique.mockResolvedValue({ ...stored, status: "CONFIRMED", confirmedAt: new Date() });
    expect(await submit("nekdo.drug@test.si")).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscription.updateMany).not.toHaveBeenCalled();
    expect(mocks.dbSubscription.createManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("re-arms a confirmed alert that was already notified, without a new confirmation mail", async () => {
    mocks.dbSubscription.findUnique.mockResolvedValue({ ...stored, status: "CONFIRMED", notifiedAt: new Date() });
    expect(await submit()).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: "CONFIRMED" },
      data: {
        notifiedAt: null, alertPendingSince: null, alertLeaseUntil: null,
        alertLeaseToken: null, alertLastError: null, variantId: PRODUCT.variants[0].id,
      },
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("keeps a pending row's token, so the first mail's link stays valid (finding A2a)", async () => {
    mocks.dbSubscription.findUnique.mockResolvedValue(stored);
    expect(await submit()).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: "PENDING", confirmToken: TOKEN }, data: { variantId: PRODUCT.variants[0].id },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith("ana@test.si", TOKEN, PRODUCT.title, ID);
  });

  it("does not write or re-mail a pending row whose mail just went out", async () => {
    mocks.dbSubscription.findUnique.mockResolvedValue({ ...stored, updatedAt: new Date() });
    expect(await submit()).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscription.updateMany).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("never resets a row that turned CONFIRMED between the read and the write (finding A2b)", async () => {
    mocks.dbSubscription.findUnique
      .mockResolvedValueOnce(stored)
      .mockResolvedValueOnce({ ...stored, status: "CONFIRMED", confirmedAt: new Date() });
    mocks.dbSubscription.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await submit()).toEqual({ ok: true, message: copy.success });
    // The one write was conditional on the status and token that were read, so it changed nothing.
    expect(mocks.dbSubscription.updateMany).toHaveBeenCalledOnce();
    expect(mocks.dbSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: "PENDING", confirmToken: TOKEN }, data: { variantId: PRODUCT.variants[0].id },
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("re-arms an unsubscribed row with a fresh token, only while it is still unsubscribed", async () => {
    mocks.dbSubscription.findUnique.mockResolvedValue({ ...stored, status: "UNSUBSCRIBED" });
    expect(await submit()).toEqual({ ok: true, message: copy.success });
    const [call] = mocks.dbSubscription.updateMany.mock.calls[0];
    expect(call).toEqual({
      where: { id: ID, status: "UNSUBSCRIBED" },
      data: {
        status: "PENDING", confirmToken: expect.stringMatching(/^[a-f0-9]{48}$/), confirmedAt: null, notifiedAt: null,
        alertPendingSince: null, alertLeaseUntil: null, alertLeaseToken: null, variantId: PRODUCT.variants[0].id,
      },
    });
    expect(call.data.confirmToken).not.toBe(TOKEN);
    expect(mocks.sendMail).toHaveBeenCalledWith("ana@test.si", call.data.confirmToken, PRODUCT.title, ID);
  });

  it("bounds the verification mails per address and still answers uniformly (finding A4)", async () => {
    for (let index = 0; index < 5; index += 1) expect(await submit()).toEqual({ ok: true, message: copy.success });
    expect(mocks.sendMail).toHaveBeenCalledTimes(3);
  });

  it("fails closed on the bot check, before any read or write", async () => {
    mocks.human.mockResolvedValue(false);
    expect(await subscribeBackInStockAction({ email: "ana@test.si", productSlug: "belilni-trakci", turnstileToken: "" }))
      .toEqual({ ok: false, message: copy.botCheckFailed });
    expect(mocks.product.findUnique).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe("confirmBackInStockAction", () => {
  it("confirms a pending alert once and logs the transactional choice with its subject", async () => {
    mocks.user.findFirst.mockResolvedValue({ id: "user_1" });
    expect(await confirmBackInStockAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: true });
    expect(mocks.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: ID, confirmToken: TOKEN, status: "PENDING" }, data: { status: "CONFIRMED", confirmedAt: expect.any(Date) },
    });
    expect(mocks.consent).toHaveBeenCalledWith({ data: {
      kind: "back-in-stock", version: marketingVersion("back-in-stock"), userId: "user_1", visitorId: null,
      choices: { marketing: false, productSlug: "belilni-trakci", subscriptionId: ID, source: "back-in-stock" },
    } });
  });

  it("logs nothing for an already confirmed alert or a lost race, and refuses withdrawn or unknown tokens", async () => {
    mocks.subscription.findUnique.mockResolvedValueOnce({ ...row, status: "CONFIRMED" });
    expect(await confirmBackInStockAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: true });
    mocks.subscription.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.subscription.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ status: "PENDING" });
    expect(await confirmBackInStockAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: false, error: copy.confirm.bodyInvalid });
    mocks.subscription.findUnique.mockResolvedValueOnce({ ...row, status: "UNSUBSCRIBED" }).mockResolvedValueOnce(null);
    expect(await confirmBackInStockAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: false, error: copy.confirm.bodyInvalid });
    expect(await confirmBackInStockAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: false, error: copy.confirm.bodyInvalid });
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it("fails closed on the bot check before reading the token", async () => {
    mocks.human.mockResolvedValue(false);
    expect(await confirmBackInStockAction({ token: TOKEN, turnstileToken: "" })).toEqual({ ok: false, error: copy.botCheckFailed });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("unsubscribeBackInStockAction", () => {
  const token = signUnsubscribeToken(ID, "unit-restock-secret");

  it("unsubscribes once, clears the alert queue and logs the change; a repeat is a silent success", async () => {
    mocks.subscription.findUnique.mockResolvedValue({ ...row, status: "CONFIRMED" });
    expect(await unsubscribeBackInStockAction({ token })).toEqual({ ok: true });
    expect(mocks.human).not.toHaveBeenCalled();
    expect(mocks.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "UNSUBSCRIBED", alertPendingSince: null, alertLeaseUntil: null, alertLeaseToken: null },
    });
    expect(mocks.consent).toHaveBeenCalledWith({ data: {
      kind: "back-in-stock", version: marketingVersion("back-in-stock"), userId: null, visitorId: null,
      choices: { unsubscribed: true, previousStatus: "CONFIRMED", productSlug: "belilni-trakci", subscriptionId: ID, source: "unsubscribe-link" },
    } });
    mocks.subscription.updateMany.mockResolvedValue({ count: 0 });
    expect(await unsubscribeBackInStockAction({ token })).toEqual({ ok: true });
    expect(mocks.consent).toHaveBeenCalledTimes(1);
  });

  it("refuses forged tokens without a transaction and dangling ones without a row", async () => {
    expect(await unsubscribeBackInStockAction({ token: `${token.slice(0, -2)}xx` })).toEqual({ ok: false, error: copy.unsubscribe.bodyInvalid });
    expect(await unsubscribeBackInStockAction({})).toEqual({ ok: false, error: copy.unsubscribe.bodyInvalid });
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.subscription.findUnique.mockResolvedValue(null);
    expect(await unsubscribeBackInStockAction({ token })).toEqual({ ok: false, error: copy.unsubscribe.bodyInvalid });
    expect(mocks.consent).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 step 4: restock-alert confirmation and unsubscribe happen only in
 * POST actions. Both flip status conditionally and log once, with the
 * subscription id, the product and the account that owns the address.
 */

const mocks = vi.hoisted(() => ({
  human: vi.fn(), transaction: vi.fn(), consent: vi.fn(),
  subscription: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.human }));
vi.mock("@/lib/email/mailer", () => ({ sendBackInStockVerification: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-restock-secret" }) }));

import { confirmBackInStockAction, unsubscribeBackInStockAction } from "@/app/(storefront)/actions/backInStock";
import { signUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";
import { marketingVersion } from "@/lib/consent-log";
import { backInStock as copy } from "@/lib/copy";

const ID = "cmf0restocksubscription01";
const TOKEN = "b".repeat(48);
const tx = { backInStockSubscription: mocks.subscription, user: mocks.user, consentLog: { create: mocks.consent } };
const row = {
  id: ID, email: "ana@test.si", status: "PENDING", source: "back-in-stock", confirmToken: TOKEN, product: { slug: "belilni-trakci" },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.human.mockResolvedValue(true);
  mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx));
  mocks.subscription.findUnique.mockResolvedValue(row);
  mocks.subscription.updateMany.mockResolvedValue({ count: 1 });
  mocks.user.findFirst.mockResolvedValue(null);
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

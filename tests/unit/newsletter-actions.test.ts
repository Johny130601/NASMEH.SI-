import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 step 4: newsletter double opt-in and withdrawal. The link routes
 * never mutate; the POST actions flip status conditionally, log exactly once
 * through recordConsent with the wording version, the subject reference and
 * the real source, and a withdrawal also stops e-novice for the verified
 * account on the same address.
 */

const mocks = vi.hoisted(() => ({
  human: vi.fn(), sendMail: vi.fn(), transaction: vi.fn(),
  dbSubscriber: { findUnique: vi.fn(), createManyAndReturn: vi.fn(), updateMany: vi.fn() },
  subscriber: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn(), updateMany: vi.fn() },
  consent: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { subscriber: mocks.dbSubscriber, $transaction: mocks.transaction } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.human }));
vi.mock("@/lib/email/mailer", () => ({ sendSubscriptionVerification: mocks.sendMail }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-newsletter-secret" }) }));

import {
  confirmNewsletterAction,
  subscribeNewsletterAction,
  unsubscribeNewsletterAction,
} from "@/app/(storefront)/actions/newsletter";
import { marketingVersion } from "@/lib/consent-log";
import { signNewsletterUnsubscribeToken } from "@/lib/newsletter/unsubscribe-token";
import { unsubscribeLinkState } from "@/lib/newsletter/subscriber-consent";
import { newsletter as copy } from "@/lib/copy";

const SUBSCRIBER_ID = "cmf0newslettersubscriber1";
const TOKEN = "a".repeat(48);
const tx = { subscriber: mocks.subscriber, user: mocks.user, consentLog: { create: mocks.consent } };
const pending = { id: SUBSCRIBER_ID, email: "ana@test.si", status: "PENDING", source: "welcome-popup", confirmToken: TOKEN };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.human.mockResolvedValue(true);
  mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx));
  mocks.dbSubscriber.findUnique.mockResolvedValue(null);
  mocks.dbSubscriber.createManyAndReturn.mockResolvedValue([{ id: SUBSCRIBER_ID }]);
  mocks.dbSubscriber.updateMany.mockResolvedValue({ count: 1 });
  mocks.subscriber.findUnique.mockResolvedValue(pending);
  mocks.subscriber.updateMany.mockResolvedValue({ count: 1 });
  mocks.user.findFirst.mockResolvedValue(null);
  mocks.user.updateMany.mockResolvedValue({ count: 0 });
});

describe("subscribeNewsletterAction", () => {
  it.each(["footer", "welcome-popup"] as const)("stores the %s source on the pending subscriber and signs the withdrawal link with its id", async (source) => {
    expect(await subscribeNewsletterAction({ email: " Ana@Test.si ", turnstileToken: "human", source })).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscriber.createManyAndReturn).toHaveBeenCalledWith({
      data: [{ email: "ana@test.si", confirmToken: expect.stringMatching(/^[a-f0-9]{48}$/), source }],
      skipDuplicates: true,
      select: { id: true },
    });
    const created = mocks.dbSubscriber.createManyAndReturn.mock.calls[0][0].data[0].confirmToken;
    expect(mocks.sendMail).toHaveBeenCalledWith("ana@test.si", created, SUBSCRIBER_ID);
    // Capture writes no consent row: only the confirmation is consent.
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it("refuses a source outside the allow-list before the bot check or any write", async () => {
    for (const source of ["checkout", "admin", "", undefined]) {
      expect(await subscribeNewsletterAction({ email: "ana@test.si", turnstileToken: "human", source: source as never }))
        .toEqual({ ok: false, message: copy.genericError });
    }
    expect(mocks.human).not.toHaveBeenCalled();
    expect(mocks.dbSubscriber.createManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.dbSubscriber.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed on the bot check and never re-arms a confirmed address", async () => {
    mocks.human.mockResolvedValueOnce(false);
    expect(await subscribeNewsletterAction({ email: "ana@test.si", turnstileToken: "", source: "footer" })).toEqual({ ok: false, message: copy.botCheckFailed });
    mocks.dbSubscriber.findUnique.mockResolvedValue({ ...pending, status: "CONFIRMED" });
    expect(await subscribeNewsletterAction({ email: "ana@test.si", turnstileToken: "human", source: "footer" })).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscriber.createManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.dbSubscriber.updateMany).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("a PENDING subscriber keeps its token (the earlier link stays valid) and the mail is sent again", async () => {
    mocks.dbSubscriber.findUnique.mockResolvedValue(pending);
    expect(await subscribeNewsletterAction({ email: "ana@test.si", turnstileToken: "human", source: "footer" })).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscriber.updateMany).toHaveBeenCalledWith({
      where: { id: SUBSCRIBER_ID, status: "PENDING", confirmToken: TOKEN }, data: { source: "footer" },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith("ana@test.si", TOKEN, SUBSCRIBER_ID);
  });

  it("an UNSUBSCRIBED subscriber is re-armed with a fresh token only while still unsubscribed", async () => {
    mocks.dbSubscriber.findUnique.mockResolvedValue({ ...pending, status: "UNSUBSCRIBED" });
    expect(await subscribeNewsletterAction({ email: "ana@test.si", turnstileToken: "human", source: "welcome-popup" })).toEqual({ ok: true, message: copy.success });
    const [call] = mocks.dbSubscriber.updateMany.mock.calls[0];
    expect(call).toEqual({
      where: { id: SUBSCRIBER_ID, status: "UNSUBSCRIBED" },
      data: { status: "PENDING", confirmToken: expect.stringMatching(/^[a-f0-9]{48}$/), confirmedAt: null, source: "welcome-popup" },
    });
    expect(call.data.confirmToken).not.toBe(TOKEN);
    expect(mocks.sendMail).toHaveBeenCalledWith("ana@test.si", call.data.confirmToken, SUBSCRIBER_ID);
  });

  it("a confirmation that wins the race is re-read, never overwritten or re-mailed", async () => {
    mocks.dbSubscriber.findUnique
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: "CONFIRMED" });
    mocks.dbSubscriber.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await subscribeNewsletterAction({ email: "ana@test.si", turnstileToken: "human", source: "footer" })).toEqual({ ok: true, message: copy.success });
    expect(mocks.dbSubscriber.updateMany).toHaveBeenCalledOnce();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("a concurrent insert for the same address is followed instead of failing", async () => {
    mocks.dbSubscriber.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(pending);
    mocks.dbSubscriber.createManyAndReturn.mockResolvedValueOnce([]);
    expect(await subscribeNewsletterAction({ email: "ana@test.si", turnstileToken: "human", source: "footer" })).toEqual({ ok: true, message: copy.success });
    expect(mocks.sendMail).toHaveBeenCalledWith("ana@test.si", TOKEN, SUBSCRIBER_ID);
  });

  it("repeated lost races end in the generic error instead of an unconditional write", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.dbSubscriber.findUnique.mockResolvedValue(pending);
      mocks.dbSubscriber.updateMany.mockResolvedValue({ count: 0 });
      expect(await subscribeNewsletterAction({ email: "ana@test.si", turnstileToken: "human", source: "footer" })).toEqual({ ok: false, message: copy.genericError });
      expect(mocks.dbSubscriber.updateMany).toHaveBeenCalledTimes(3);
      expect(mocks.sendMail).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe("confirmNewsletterAction", () => {
  it("flips PENDING → CONFIRMED conditionally and logs once with version, subject, account and source", async () => {
    mocks.user.findFirst.mockResolvedValue({ id: "user_1" });
    expect(await confirmNewsletterAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: true });
    expect(mocks.subscriber.updateMany).toHaveBeenCalledWith({
      where: { id: SUBSCRIBER_ID, confirmToken: TOKEN, status: "PENDING" },
      data: { status: "CONFIRMED", confirmedAt: expect.any(Date) },
    });
    expect(mocks.user.findFirst).toHaveBeenCalledWith({ where: { email: "ana@test.si", emailVerified: { not: null } }, select: { id: true } });
    expect(mocks.consent).toHaveBeenCalledTimes(1);
    expect(mocks.consent).toHaveBeenCalledWith({ data: {
      kind: "marketing-email", version: marketingVersion("marketing-email"), userId: "user_1", visitorId: null,
      choices: { marketing: true, doubleOptIn: true, source: "welcome-popup", subscriberId: SUBSCRIBER_ID },
    } });
  });

  it("versions a checkout-armed subscription with the checkout box wording", async () => {
    mocks.subscriber.findUnique.mockResolvedValue({ ...pending, source: "checkout" });
    await confirmNewsletterAction({ token: TOKEN, turnstileToken: "human" });
    expect(mocks.consent).toHaveBeenCalledWith({ data: expect.objectContaining({ version: marketingVersion("marketing-checkout"), userId: null }) });
  });

  it("writes no second row for a repeated click or a lost race", async () => {
    mocks.subscriber.findUnique.mockResolvedValue({ ...pending, status: "CONFIRMED" });
    expect(await confirmNewsletterAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: true });
    expect(mocks.subscriber.updateMany).not.toHaveBeenCalled();

    mocks.subscriber.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce({ status: "CONFIRMED" });
    mocks.subscriber.updateMany.mockResolvedValue({ count: 0 });
    expect(await confirmNewsletterAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: true });
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it("refuses unknown and withdrawn tokens, a failed bot check and malformed input", async () => {
    mocks.subscriber.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...pending, status: "UNSUBSCRIBED" });
    expect(await confirmNewsletterAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: false, error: copy.confirm.bodyInvalid });
    expect(await confirmNewsletterAction({ token: TOKEN, turnstileToken: "human" })).toEqual({ ok: false, error: copy.confirm.bodyInvalid });
    mocks.human.mockResolvedValueOnce(false);
    expect(await confirmNewsletterAction({ token: TOKEN, turnstileToken: "" })).toEqual({ ok: false, error: copy.botCheckFailed });
    expect(await confirmNewsletterAction({ token: "x".repeat(200) })).toEqual({ ok: false, error: copy.confirm.bodyInvalid });
    expect(mocks.subscriber.updateMany).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
  });
});

describe("unsubscribeNewsletterAction", () => {
  const token = signNewsletterUnsubscribeToken(SUBSCRIBER_ID, "unit-newsletter-secret");

  it("withdraws the subscription and the verified account's e-novice, each logged once with its subject", async () => {
    mocks.subscriber.findUnique.mockResolvedValue({ ...pending, status: "CONFIRMED" });
    mocks.user.findFirst.mockResolvedValue({ id: "user_1" });
    mocks.user.updateMany.mockResolvedValue({ count: 1 });
    expect(await unsubscribeNewsletterAction({ token })).toEqual({ ok: true });
    expect(mocks.human).not.toHaveBeenCalled();
    expect(mocks.subscriber.findUnique).toHaveBeenCalledWith({ where: { id: SUBSCRIBER_ID } });
    expect(mocks.subscriber.updateMany).toHaveBeenCalledWith({
      where: { id: SUBSCRIBER_ID, status: { in: ["PENDING", "CONFIRMED"] } }, data: { status: "UNSUBSCRIBED" },
    });
    expect(mocks.user.updateMany).toHaveBeenCalledWith({ where: { id: "user_1", marketingOptIn: true }, data: { marketingOptIn: false } });
    expect(mocks.consent.mock.calls.map(([call]) => call.data)).toEqual([
      {
        kind: "marketing-email", version: marketingVersion("marketing-email"), userId: "user_1", visitorId: null,
        choices: { marketing: false, withdrawn: true, previousStatus: "CONFIRMED", source: "unsubscribe-link", subscriberId: SUBSCRIBER_ID },
      },
      {
        kind: "marketing-preference", version: marketingVersion("marketing-preference"), userId: "user_1", visitorId: null,
        choices: { marketing: false, previous: true, source: "newsletter-unsubscribe", subscriberId: SUBSCRIBER_ID },
      },
    ]);
  });

  it("is idempotent: a second visit changes and logs nothing but still reports success", async () => {
    mocks.subscriber.findUnique.mockResolvedValue({ ...pending, status: "UNSUBSCRIBED" });
    mocks.subscriber.updateMany.mockResolvedValue({ count: 0 });
    expect(await unsubscribeNewsletterAction({ token })).toEqual({ ok: true });
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it("refuses forged, foreign-purpose and dangling tokens without opening a transaction for bad signatures", async () => {
    for (const bad of [`${SUBSCRIBER_ID}-${"A".repeat(43)}`, token.replace("-", "."), "", undefined]) {
      expect(await unsubscribeNewsletterAction({ token: bad })).toEqual({ ok: false, error: copy.unsubscribe.bodyInvalid });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.subscriber.findUnique.mockResolvedValue(null);
    expect(await unsubscribeNewsletterAction({ token })).toEqual({ ok: false, error: copy.unsubscribe.bodyInvalid });
    expect(mocks.consent).not.toHaveBeenCalled();
  });
});

describe("the /odjava-novice link state (finding U4)", () => {
  const client = { subscriber: mocks.subscriber, user: mocks.user } as never;

  it("offers the withdrawal while the subscriber is active, and rejects bad or dangling links", async () => {
    expect(await unsubscribeLinkState(client, null)).toBe("invalid");
    expect(mocks.subscriber.findUnique).not.toHaveBeenCalled();
    mocks.subscriber.findUnique.mockResolvedValue(null);
    expect(await unsubscribeLinkState(client, SUBSCRIBER_ID)).toBe("invalid");
    for (const status of ["PENDING", "CONFIRMED"]) {
      mocks.subscriber.findUnique.mockResolvedValue({ status, email: "ana@test.si" });
      expect(await unsubscribeLinkState(client, SUBSCRIBER_ID)).toBe("confirm");
    }
    expect(mocks.user.findFirst).not.toHaveBeenCalled();
  });

  it("shows the done state only when no verified account on the address still has the e-novice opt-in", async () => {
    mocks.subscriber.findUnique.mockResolvedValue({ status: "UNSUBSCRIBED", email: "Ana@Test.si" });
    expect(await unsubscribeLinkState(client, SUBSCRIBER_ID)).toBe("done");
    expect(mocks.subscriber.findUnique).toHaveBeenCalledWith({ where: { id: SUBSCRIBER_ID }, select: { status: true, email: true } });
    expect(mocks.user.findFirst).toHaveBeenCalledWith({
      where: { email: "ana@test.si", emailVerified: { not: null }, marketingOptIn: true }, select: { id: true },
    });

    // Opted back in on the account after withdrawing by link: the link withdraws again instead of claiming success.
    mocks.user.findFirst.mockResolvedValue({ id: "user_1" });
    expect(await unsubscribeLinkState(client, SUBSCRIBER_ID)).toBe("confirm");
  });

  it("the page reads its state from the helper, not from the subscriber status alone", () => {
    const page = readFileSync(join(__dirname, "..", "..", "app", "(storefront)", "odjava-novice", "[token]", "page.tsx"), "utf8");
    expect(page).toContain("unsubscribeLinkState(db, id)");
    expect(page).not.toMatch(/subscriber\.status\s*===/);
  });
});

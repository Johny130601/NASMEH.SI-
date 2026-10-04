import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA 2026-10-03 T3-02: the activation page says before the click when confirming
 * the link also confirms the newsletter opt-in chosen with the account — the
 * link's own snapshot, unless the address unsubscribed after the link was sent
 * (that withdrawal wins at activation too, so the page must not promise it).
 */
const mocks = vi.hoisted(() => ({ read: vi.fn(), user: vi.fn(), subscriber: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.user }, subscriber: { findUnique: mocks.subscriber } } }));
vi.mock("@/lib/auth-tokens", () => ({ readActivationLink: mocks.read }));
import { activationPreview, withdrawnSince } from "@/lib/auth-activation";

const issuedAt = new Date("2026-10-03T08:00:00Z");
const snapshot = { passwordHash: "$2b$10$" + "a".repeat(53), name: "Ana Novak", marketingOptIn: true };
const later = new Date(issuedAt.getTime() + 60_000);
const earlier = new Date(issuedAt.getTime() - 60_000);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ userId: "u", snapshot, issuedAt });
  mocks.user.mockResolvedValue({ email: "Ana@Test.si" });
  mocks.subscriber.mockResolvedValue(null);
});

describe("activationPreview", () => {
  it("has nothing to show for a link that cannot be used", async () => {
    mocks.read.mockResolvedValue(null);
    expect(await activationPreview("x")).toBeNull();
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it("an opted-out link confirms no newsletter and needs no lookup", async () => {
    mocks.read.mockResolvedValue({ userId: "u", snapshot: { ...snapshot, marketingOptIn: false }, issuedAt });
    expect(await activationPreview("x")).toEqual({ newsletter: false });
    expect(mocks.subscriber).not.toHaveBeenCalled();
  });

  it.each([
    ["no subscriber", null],
    ["a confirmed subscription", { id: "s", status: "CONFIRMED", updatedAt: later }],
    ["a withdrawal before the link was sent", { id: "s", status: "UNSUBSCRIBED", updatedAt: earlier }],
  ])("an opted-in link confirms the newsletter too: %s", async (_label, subscriber) => {
    mocks.subscriber.mockResolvedValue(subscriber);
    expect(await activationPreview("x")).toEqual({ newsletter: true });
    expect(mocks.subscriber).toHaveBeenCalledWith({ where: { email: "ana@test.si" }, select: { id: true, status: true, updatedAt: true } });
  });

  it("a withdrawal after the link was sent wins: the page promises no newsletter", async () => {
    mocks.subscriber.mockResolvedValue({ id: "s", status: "UNSUBSCRIBED", updatedAt: later });
    expect(await activationPreview("x")).toEqual({ newsletter: false });
  });
});

describe("withdrawnSince", () => {
  it("names the subscriber only when it unsubscribed after the link was issued", async () => {
    const client = { user: { findUnique: mocks.user }, subscriber: { findUnique: mocks.subscriber } } as never;
    mocks.subscriber.mockResolvedValue({ id: "s", status: "UNSUBSCRIBED", updatedAt: later });
    expect(await withdrawnSince(client, "u", issuedAt)).toEqual({ id: "s", status: "UNSUBSCRIBED", updatedAt: later });
    mocks.subscriber.mockResolvedValue({ id: "s", status: "UNSUBSCRIBED", updatedAt: earlier });
    expect(await withdrawnSince(client, "u", issuedAt)).toBeNull();
    mocks.user.mockResolvedValue(null);
    expect(await withdrawnSince(client, "u", issuedAt)).toBeNull();
  });
});

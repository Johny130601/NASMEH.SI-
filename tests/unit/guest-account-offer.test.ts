import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA 2026-10-03 T2-09: the confirmation page of a paid guest order offered
 * "Ustvari račun" even when the order's address already had an account, then
 * answered "račun že obstaja". Such an address is offered sign-in instead; a
 * staff address is never confirmed to the public storefront (T2-10).
 */
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));
import { guestAccountOffer } from "@/lib/account/guest-offer";

beforeEach(() => findUnique.mockReset());

describe("guestAccountOffer", () => {
  it("offers account creation for an address without an account, looked up as stored", async () => {
    findUnique.mockResolvedValue(null);
    expect(await guestAccountOffer(" Kupec@Test.SI ", false)).toBe("create");
    expect(findUnique).toHaveBeenCalledWith({ where: { email: "kupec@test.si" }, select: { role: true } });
  });

  it("offers sign-in, not a second account, when a shopper's account exists", async () => {
    findUnique.mockResolvedValue({ role: "CUSTOMER" });
    expect(await guestAccountOffer("kupec@test.si", false)).toBe("signIn");
  });

  it("offers nothing once the visitor is signed in", async () => {
    findUnique.mockResolvedValue({ role: "CUSTOMER" });
    expect(await guestAccountOffer("kupec@test.si", true)).toBeNull();
  });

  it.each(["OWNER", "MANAGER", "SUPPORT", "FULFILLMENT"])("never confirms a %s address: no box at all", async (role) => {
    findUnique.mockResolvedValue({ role });
    expect(await guestAccountOffer("osebje@nasmeh.si", false)).toBeNull();
  });
});

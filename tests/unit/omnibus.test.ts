import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { priceHistory: { findMany: mocks.findMany } } }));

import { getPriceReductions } from "@/lib/omnibus";

const NOW = new Date("2026-09-09T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("getPriceReductions (batched Omnibus lookup for every surface)", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it("no announced reduction → no query, empty map", async () => {
    const result = await getPriceReductions(
      [
        { variantId: "v1", priceCents: 3499, compareAtPriceCents: null },
        { variantId: "v2", priceCents: 1999, compareAtPriceCents: 1999 },
      ],
      NOW,
    );
    expect(result.size).toBe(0);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("loads the history of all announced variants in ONE query and gates each on it", async () => {
    mocks.findMany.mockResolvedValue([
      { variantId: "serum", priceCents: 2499, compareAtPriceCents: null, createdAt: daysAgo(60) },
      { variantId: "serum", priceCents: 1999, compareAtPriceCents: 2499, createdAt: daysAgo(10) },
      // created with a compare-at: nothing to compare with
      { variantId: "fresh", priceCents: 1499, compareAtPriceCents: 2999, createdAt: daysAgo(2) },
    ]);

    const result = await getPriceReductions(
      [
        { variantId: "serum", priceCents: 1999, compareAtPriceCents: 2499 },
        { variantId: "fresh", priceCents: 1499, compareAtPriceCents: 2999 },
        { variantId: "plain", priceCents: 3499, compareAtPriceCents: null },
        { variantId: "serum", priceCents: 1999, compareAtPriceCents: 2499 }, // same card on two rails
      ],
      NOW,
    );

    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ variantId: { in: ["serum", "fresh"] } });
    // the announcement state per row drives compare-at merging and progressive runs
    expect(mocks.findMany.mock.calls[0][0].select).toMatchObject({ compareAtPriceCents: true, createdAt: true });
    expect([...result.entries()]).toEqual([
      ["serum", { priorPriceCents: 2499, priceCents: 1999, percentOff: 20 }],
    ]);
  });
});

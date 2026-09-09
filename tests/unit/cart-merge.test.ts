import { describe, expect, it } from "vitest";
import { mergeCartLines } from "@/lib/cart/merge";

const MAX = new Map([
  ["v1", 5],
  ["v2", 5],
  ["vB", 1],
]);

describe("mergeCartLines (merge-on-login, caps re-applied)", () => {
  it("guest 5 + account 5 → still 5 (maxCartQuantity)", () => {
    const merged = mergeCartLines(
      [{ variantId: "v1", quantity: 5 }],
      [{ variantId: "v1", quantity: 5 }],
      MAX,
    );
    expect(merged).toEqual([{ variantId: "v1", quantity: 5 }]);
  });

  it("sums below the cap", () => {
    const merged = mergeCartLines(
      [{ variantId: "v1", quantity: 1 }],
      [{ variantId: "v1", quantity: 2 }],
      MAX,
    );
    expect(merged).toEqual([{ variantId: "v1", quantity: 3 }]);
  });

  it("adds new guest lines and keeps db-only lines", () => {
    const merged = mergeCartLines(
      [{ variantId: "v1", quantity: 1 }],
      [{ variantId: "v2", quantity: 4 }],
      MAX,
    );
    expect(merged).toEqual([
      { variantId: "v1", quantity: 1 },
      { variantId: "v2", quantity: 4 },
    ]);
  });

  it("bundle cap 1 wins over any sum", () => {
    const merged = mergeCartLines(
      [{ variantId: "vB", quantity: 1 }],
      [{ variantId: "vB", quantity: 1 }],
      MAX,
    );
    expect(merged).toEqual([{ variantId: "vB", quantity: 1 }]);
  });

  it("empty guest → db unchanged; empty db → guest (capped)", () => {
    expect(mergeCartLines([{ variantId: "v1", quantity: 2 }], [], MAX)).toEqual([
      { variantId: "v1", quantity: 2 },
    ]);
    expect(mergeCartLines([], [{ variantId: "v1", quantity: 9 }], MAX)).toEqual([
      { variantId: "v1", quantity: 5 },
    ]);
  });
});

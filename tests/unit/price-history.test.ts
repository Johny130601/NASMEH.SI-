import { describe, expect, it, vi } from "vitest";
import {
  changeVariantPrice,
  changeVariantPriceInTx,
  recordInitialPriceInTx,
} from "@/lib/price-history";

function makeTx(current: {
  priceCents: number;
  compareAtPriceCents: number | null;
}) {
  return {
    variant: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(current),
      update: vi.fn().mockResolvedValue({}),
    },
    priceHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("changeVariantPriceInTx (Omnibus price-history path)", () => {
  it("appends a PriceHistory row and updates the variant in the SAME tx", async () => {
    const tx = makeTx({ priceCents: 3499, compareAtPriceCents: null });

    const result = await changeVariantPriceInTx(tx as never, {
      variantId: "v1",
      priceCents: 2999,
    });

    expect(result.priceRecorded).toBe(true);
    expect(tx.priceHistory.create).toHaveBeenCalledExactlyOnceWith({
      data: { variantId: "v1", priceCents: 2999, compareAtPriceCents: null },
    });
    expect(tx.variant.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "v1" },
      data: { priceCents: 2999 },
    });
    // history is written before/with the update — same transaction object
    expect(tx.priceHistory.create.mock.invocationCallOrder[0]).toBeLessThan(
      tx.variant.update.mock.invocationCallOrder[0],
    );
  });

  it("keeps the existing compare-at when only the price changes", async () => {
    const tx = makeTx({ priceCents: 3499, compareAtPriceCents: 3999 });

    await changeVariantPriceInTx(tx as never, {
      variantId: "v1",
      priceCents: 2999,
    });

    expect(tx.priceHistory.create).toHaveBeenCalledWith({
      data: { variantId: "v1", priceCents: 2999, compareAtPriceCents: 3999 },
    });
  });

  it("records a compare-at-only change (announcement switch) with the unchanged price", async () => {
    const tx = makeTx({ priceCents: 1999, compareAtPriceCents: null });

    const result = await changeVariantPriceInTx(tx as never, {
      variantId: "v1",
      priceCents: 1999,
      compareAtPriceCents: 2499,
    });

    expect(result.priceRecorded).toBe(true);
    expect(tx.priceHistory.create).toHaveBeenCalledExactlyOnceWith({
      data: { variantId: "v1", priceCents: 1999, compareAtPriceCents: 2499 },
    });
    expect(tx.variant.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "v1" },
      data: { priceCents: 1999, compareAtPriceCents: 2499 },
    });
  });

  it("is a no-op when the price is unchanged — no history row", async () => {
    const tx = makeTx({ priceCents: 3499, compareAtPriceCents: null });

    const result = await changeVariantPriceInTx(tx as never, {
      variantId: "v1",
      priceCents: 3499,
    });

    expect(result.priceRecorded).toBe(false);
    expect(tx.priceHistory.create).not.toHaveBeenCalled();
    expect(tx.variant.update).not.toHaveBeenCalled();
  });
});

describe("changeVariantPrice", () => {
  it("wraps update + history in prisma.$transaction (atomic)", async () => {
    const tx = makeTx({ priceCents: 3499, compareAtPriceCents: null });
    const $transaction = vi.fn((fn: (t: unknown) => unknown) => fn(tx));
    const prisma = { $transaction };

    await changeVariantPrice(prisma as never, {
      variantId: "v1",
      priceCents: 2499,
    });

    expect($transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    expect(tx.priceHistory.create).toHaveBeenCalledOnce();
    expect(tx.variant.update).toHaveBeenCalledOnce();
  });
});

describe("recordInitialPriceInTx", () => {
  it("records the initial price of a newly created variant", async () => {
    const tx = makeTx({ priceCents: 0, compareAtPriceCents: null });

    await recordInitialPriceInTx(tx as never, {
      variantId: "v1",
      priceCents: 3499,
    });

    expect(tx.priceHistory.create).toHaveBeenCalledExactlyOnceWith({
      data: { variantId: "v1", priceCents: 3499, compareAtPriceCents: null },
    });
  });
});

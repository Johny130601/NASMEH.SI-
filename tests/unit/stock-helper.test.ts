import { beforeEach, describe, expect, it, vi } from "vitest";
import { adjustVariantStockInTx, setVariantStockInTx } from "@/lib/inventory/stock";

const tx = {
  $queryRaw: vi.fn(),
  variant: { update: vi.fn() },
  bundle: { findMany: vi.fn() },
  backInStockSubscription: { updateMany: vi.fn() },
};
const client = tx as unknown as Parameters<typeof setVariantStockInTx>[0];

beforeEach(() => {
  vi.resetAllMocks();
  tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: 0, productId: "p1" }]);
  tx.variant.update.mockResolvedValue({});
  tx.backInStockSubscription.updateMany.mockResolvedValue({ count: 2 });
  tx.bundle.findMany.mockResolvedValue([]);
});

describe("setVariantStockInTx", () => {
  it("arms confirmed, un-notified, un-armed subscriptions on a 0 → N transition", async () => {
    expect(await setVariantStockInTx(client, "v1", 3)).toEqual({ variantId: "v1", before: 0, after: 3, armedAlerts: 2 });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.variant.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { stock: 3 } });
    expect(tx.backInStockSubscription.updateMany).toHaveBeenCalledWith({
      where: {
        status: "CONFIRMED", notifiedAt: null, alertPendingSince: null,
        OR: [{ variantId: "v1" }, { variantId: null, productId: "p1" }],
      },
      data: { alertPendingSince: expect.any(Date) },
    });
  });

  it.each([[5, 8], [5, 0], [0, 0], [3, 3]])("does not arm on %i → %i", async (before, after) => {
    tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: before, productId: "p1" }]);
    expect((await setVariantStockInTx(client, "v1", after)).armedAlerts).toBe(0);
    expect(tx.backInStockSubscription.updateMany).not.toHaveBeenCalled();
    if (after <= before) expect(tx.bundle.findMany).not.toHaveBeenCalled();
    if (before === after) expect(tx.variant.update).not.toHaveBeenCalled();
    else expect(tx.variant.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { stock: after } });
  });

  it("rejects negative or fractional quantities and unknown variants before writing", async () => {
    await expect(setVariantStockInTx(client, "v1", -1)).rejects.toThrow(RangeError);
    await expect(setVariantStockInTx(client, "v1", 1.5)).rejects.toThrow(RangeError);
    tx.$queryRaw.mockResolvedValue([]);
    await expect(setVariantStockInTx(client, "v1", 1)).rejects.toThrow("variant_not_found");
    expect(tx.variant.update).not.toHaveBeenCalled();
  });
});

describe("setVariantStockInTx — bundles filled by the component (QA M6)", () => {
  const bundleOf = (componentStock: number, perBundle = 1, other = { stock: 50, allowBackorder: false }) => ({
    productId: "bundle-product",
    items: [
      { quantity: perBundle, variant: { id: "v1", stock: componentStock, allowBackorder: false } },
      { quantity: 1, variant: { id: "v2", ...other } },
    ],
    product: { variants: [{ stock: 100, allowBackorder: false }] },
  });

  it("arms the bundle product's subscriptions when the component's increase makes the bundle sellable again", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: 0, productId: "p1" }]);
    tx.bundle.findMany.mockResolvedValue([bundleOf(3)]);
    tx.backInStockSubscription.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 4 });
    expect((await setVariantStockInTx(client, "v1", 3)).armedAlerts).toBe(6);
    expect(tx.bundle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { items: { some: { variantId: "v1" } } } }));
    expect(tx.backInStockSubscription.updateMany).toHaveBeenLastCalledWith({
      where: { status: "CONFIRMED", notifiedAt: null, alertPendingSince: null, productId: "bundle-product" },
      data: { alertPendingSince: expect.any(Date) },
    });
  });

  it("arms a bundle on a partial refill that crosses its per-bundle quantity, not before", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: 1, productId: "p1" }]);
    tx.bundle.findMany.mockResolvedValue([bundleOf(3, 2)]);
    // 1 → 3 with two per bundle: 0 bundles before, 1 after — only the bundle arms (the variant was not at 0)
    tx.backInStockSubscription.updateMany.mockResolvedValue({ count: 1 });
    expect((await setVariantStockInTx(client, "v1", 3)).armedAlerts).toBe(1);
    expect(tx.backInStockSubscription.updateMany).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: 0, productId: "p1" }]);
    tx.bundle.findMany.mockResolvedValue([bundleOf(1, 2)]);
    tx.backInStockSubscription.updateMany.mockResolvedValue({ count: 2 });
    // 0 → 1 with two per bundle: the variant's own subscriptions arm, the bundle still cannot be filled
    expect((await setVariantStockInTx(client, "v1", 1)).armedAlerts).toBe(2);
    expect(tx.backInStockSubscription.updateMany).toHaveBeenCalledOnce();
  });

  it("does not arm a bundle another component still holds at zero, nor one that was already sellable", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: 5, productId: "p1" }]);
    tx.bundle.findMany.mockResolvedValue([bundleOf(8, 1, { stock: 0, allowBackorder: false }), bundleOf(8)]);
    expect((await setVariantStockInTx(client, "v1", 8)).armedAlerts).toBe(0);
    expect(tx.backInStockSubscription.updateMany).not.toHaveBeenCalled();
  });
});

describe("adjustVariantStockInTx", () => {
  it("applies a delta through the same path and refuses to go below zero", async () => {
    expect((await adjustVariantStockInTx(client, "v1", 4)).armedAlerts).toBe(2);
    expect(tx.variant.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { stock: 4 } });
    tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: 2, productId: "p1" }]);
    await expect(adjustVariantStockInTx(client, "v1", -3)).rejects.toThrow(RangeError);
    await expect(adjustVariantStockInTx(client, "v1", 0.5)).rejects.toThrow(RangeError);
  });
});

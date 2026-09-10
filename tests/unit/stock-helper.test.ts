import { beforeEach, describe, expect, it, vi } from "vitest";
import { adjustVariantStockInTx, setVariantStockInTx } from "@/lib/inventory/stock";

const tx = {
  $queryRaw: vi.fn(),
  variant: { update: vi.fn() },
  backInStockSubscription: { updateMany: vi.fn() },
};
const client = tx as unknown as Parameters<typeof setVariantStockInTx>[0];

beforeEach(() => {
  vi.resetAllMocks();
  tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: 0, productId: "p1" }]);
  tx.variant.update.mockResolvedValue({});
  tx.backInStockSubscription.updateMany.mockResolvedValue({ count: 2 });
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

describe("adjustVariantStockInTx", () => {
  it("applies a delta through the same path and refuses to go below zero", async () => {
    expect((await adjustVariantStockInTx(client, "v1", 4)).armedAlerts).toBe(2);
    expect(tx.variant.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { stock: 4 } });
    tx.$queryRaw.mockResolvedValue([{ id: "v1", stock: 2, productId: "p1" }]);
    await expect(adjustVariantStockInTx(client, "v1", -3)).rejects.toThrow(RangeError);
    await expect(adjustVariantStockInTx(client, "v1", 0.5)).rejects.toThrow(RangeError);
  });
});

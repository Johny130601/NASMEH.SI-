import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Review finding C2: the product editor could move a bundle variant's price
 * away from the bundle price, leaving the card and the PDP claiming a saving
 * against a price nobody pays (UCPD Art. 6(1)(d)). `saveVariantAction` refuses
 * the edit, so the bundle editor stays the one place a bundle's price changes.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(),
  productFindUnique: vi.fn(), variantFindFirst: vi.fn(), variantUpdate: vi.fn(), variantCreate: vi.fn(),
  changePrice: vi.fn(), recordInitial: vi.fn(), setStock: vi.fn(), sendAlerts: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => {
  const client = {
    product: { findUnique: mocks.productFindUnique },
    variant: { findFirst: mocks.variantFindFirst, update: mocks.variantUpdate, create: mocks.variantCreate },
    $transaction: (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(client) : Promise.all(arg as Promise<unknown>[])),
  };
  return { db: client };
});
vi.mock("@/lib/price-history", () => ({ changeVariantPriceInTx: mocks.changePrice, recordInitialPriceInTx: mocks.recordInitial }));
vi.mock("@/lib/inventory/stock", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/inventory/stock")>()), setVariantStockInTx: mocks.setStock }));
vi.mock("@/lib/jobs/restock-alerts", () => ({ sendPendingRestockAlerts: mocks.sendAlerts }));
vi.mock("@/lib/admin/media", () => ({
  InvalidMediaFile: class InvalidMediaFile extends Error {}, prepareMediaImage: vi.fn(), saveMediaImage: vi.fn(), removeMediaImage: vi.fn(),
}));

import { saveVariantAction } from "@/app/admin/(shell)/izdelki/actions";

const session = { user: { id: "cmf0owner00000000000000001", email: "owner@nasmeh.si", name: "OWNER", role: "OWNER", mfaEnrolled: true } };
const productId = "cmf0product00000000000001";
const variantId = "cmf0variant00000000000001";
/** The bundle variant as the bundle editor left it: 49,99 €, one per order. */
const variant = {
  title: "Paket", sku: "nas-paket", priceCents: 4999, compareAtPriceCents: null, costCents: null, barcode: "", weightGrams: 120,
  stock: 3, maxCartQuantity: 1, allowBackorder: false, backorderNote: "",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(session);
  mocks.productFindUnique.mockResolvedValue({ slug: "paket-popolna-rutina", bundle: { priceCents: 4999 } });
  mocks.variantFindFirst.mockResolvedValue({ id: variantId, priceCents: 4999 });
  mocks.variantUpdate.mockResolvedValue({});
  mocks.variantCreate.mockResolvedValue({ id: "cmf0variant00000000000002" });
  mocks.setStock.mockResolvedValue({ variantId, before: 0, after: 3, armedAlerts: 0 });
  mocks.changePrice.mockResolvedValue({ priceRecorded: true });
  mocks.recordInitial.mockResolvedValue({});
});

describe("saveVariantAction on a bundle product", () => {
  it("refuses a price edit before any write", async () => {
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, priceCents: 5999 } })).toEqual({ ok: false, error: "bundlePrice" });
    expect(mocks.changePrice).not.toHaveBeenCalled();
    expect(mocks.variantUpdate).not.toHaveBeenCalled();
    expect(mocks.setStock).not.toHaveBeenCalled();
  });

  it("keeps every other edit, including switching the reduction announcement on", async () => {
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, title: "Paket Popolna rutina", compareAtPriceCents: 7497 } })).toEqual({ ok: true, armed: 0 });
    expect(mocks.changePrice).toHaveBeenCalledWith(expect.anything(), { variantId, priceCents: 4999, compareAtPriceCents: 7497 });
  });

  it("creates a new variant only at the bundle price", async () => {
    expect(await saveVariantAction({ productId, variantId: null, variant: { ...variant, sku: "nas-paket-2", priceCents: 5999 } })).toEqual({ ok: false, error: "bundlePrice" });
    expect(mocks.variantCreate).not.toHaveBeenCalled();
    expect(await saveVariantAction({ productId, variantId: null, variant: { ...variant, sku: "nas-paket-2" } })).toEqual({ ok: true, armed: 0 });
    expect(mocks.variantCreate.mock.calls[0][0].data).toMatchObject({ priceCents: 4999 });
  });

  it("leaves an ordinary product's price edit alone", async () => {
    mocks.productFindUnique.mockResolvedValue({ slug: "trakci", bundle: null });
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, priceCents: 5999 } })).toEqual({ ok: true, armed: 0 });
    expect(mocks.changePrice).toHaveBeenCalledWith(expect.anything(), { variantId, priceCents: 5999, compareAtPriceCents: null });
  });
});

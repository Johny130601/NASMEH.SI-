import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bundle builder submit (/sestavi-paket): one gesture, one write.
 *
 * The client sends intent only (AGENTS §5.2), so everything that decides the
 * outcome is re-read here: purchasability, stock and the per-line cap. Two
 * rules carry the action — a line is raised to at least the selection and
 * never lowered, and a submit where the base landed short is not confirmed as
 * a success (§8.23). The coupon comes from the Setting, and only when the
 * shopper is not already carrying a code of their own (§9.1, one per order).
 */

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  findMany: vi.fn(),
  auth: vi.fn(),
  getBundleBuilder: vi.fn(),
  readKodaCode: vi.fn(),
  applyKodaCode: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { variant: { findMany: mocks.findMany } } }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-test-guest-cart-secret" }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined),
    set: (name: string, value: string) => void mocks.jar.set(name, value),
    delete: (name: string) => void mocks.jar.delete(name),
  }),
}));
vi.mock("@/lib/koda", () => ({
  readKodaCode: mocks.readKodaCode,
  applyKodaCode: mocks.applyKodaCode,
}));
vi.mock("@/lib/settings", () => ({ getBundleBuilder: mocks.getBundleBuilder }));

import { addBundleToCartAction } from "@/app/(storefront)/actions/cart";
import { DEFAULT_BUNDLE_BUILDER } from "@/lib/admin/cms-schemas";

type CatalogueRow = {
  id: string;
  maxCartQuantity: number;
  stock: number;
  allowBackorder: boolean;
  product: { status: "DRAFT" | "ACTIVE" | "ARCHIVED"; hiddenDeal: boolean };
};

const baseId = "cmf0variant00000000000001";
const pastaId = "cmf0variant00000000000002";
const nitkaId = "cmf0variant00000000000003";
const draftId = "cmf0variant00000000000004";
const dealId = "cmf0variant00000000000005";

function variant(id: string, overrides: Partial<CatalogueRow> = {}): CatalogueRow {
  return {
    id,
    maxCartQuantity: 5,
    stock: 10,
    allowBackorder: false,
    product: { status: "ACTIVE", hiddenDeal: false },
    ...overrides,
  };
}

let catalogue: Map<string, CatalogueRow>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.jar.clear();
  // a guest: the cart is the signed cookie, so the whole write is observable here
  mocks.auth.mockResolvedValue(null);
  catalogue = new Map<string, CatalogueRow>([
    [baseId, variant(baseId)],
    [pastaId, variant(pastaId, { maxCartQuantity: 3 })],
    [nitkaId, variant(nitkaId, { maxCartQuantity: 3 })],
    [draftId, variant(draftId, { product: { status: "DRAFT", hiddenDeal: false } })],
    [dealId, variant(dealId, { product: { status: "ACTIVE", hiddenDeal: true } })],
  ]);
  mocks.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in
      .map((id) => catalogue.get(id))
      .filter((row): row is CatalogueRow => row !== undefined),
  );
  mocks.getBundleBuilder.mockResolvedValue({ ...DEFAULT_BUNDLE_BUILDER });
  mocks.readKodaCode.mockResolvedValue(null);
  mocks.applyKodaCode.mockResolvedValue({ ok: true, code: "PAKET20" });
});

describe("addBundleToCartAction — one gesture, one write", () => {
  it("stores the offer and its add-ons, and reports what each line took", () => {
    return expect(
      addBundleToCartAction({ baseVariantId: baseId, units: 2, addOnVariantIds: [pastaId, nitkaId] }),
    ).resolves.toEqual({
      ok: true,
      count: 4,
      lines: [
        { variantId: baseId, addedQuantity: 2, short: false },
        { variantId: pastaId, addedQuantity: 1, short: false },
        { variantId: nitkaId, addedQuantity: 1, short: false },
      ],
    });
  });

  it("refuses anything that is not an offer before it reads the catalogue", async () => {
    // zod at the boundary (§8.2): no units, too many add-ons, no variant
    expect(await addBundleToCartAction({ baseVariantId: baseId, units: 0, addOnVariantIds: [] })).toEqual({ ok: false, count: 0 });
    expect(await addBundleToCartAction({ baseVariantId: baseId, units: 21, addOnVariantIds: [] })).toEqual({ ok: false, count: 0 });
    expect(
      await addBundleToCartAction({ baseVariantId: baseId, units: 2, addOnVariantIds: [pastaId, nitkaId, draftId, dealId] }),
    ).toEqual({ ok: false, count: 0 });
    expect(await addBundleToCartAction({ units: 2, addOnVariantIds: [] })).toEqual({ ok: false, count: 0 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});

describe("the gates the single add applies, applied per line", () => {
  it("drops a draft add-on, reports it short, and still lands the base", async () => {
    const result = await addBundleToCartAction({
      baseVariantId: baseId,
      units: 1,
      addOnVariantIds: [draftId, pastaId],
    });
    expect(result).toEqual({
      ok: true,
      count: 2,
      capped: true,
      lines: [
        { variantId: baseId, addedQuantity: 1, short: false },
        { variantId: pastaId, addedQuantity: 1, short: false },
        // refused before the write, so it is short like any other shortfall
        { variantId: draftId, addedQuantity: 0, short: true },
      ],
    });
  });

  it("drops a hidden-deal add-on the same way", async () => {
    const result = await addBundleToCartAction({
      baseVariantId: baseId,
      units: 1,
      addOnVariantIds: [dealId],
    });
    expect(result.ok).toBe(true);
    expect(result.capped).toBe(true);
    expect(result.count).toBe(1);
    expect(result.lines).toEqual([
      { variantId: baseId, addedQuantity: 1, short: false },
      { variantId: dealId, addedQuantity: 0, short: true },
    ]);
  });

  it("refuses the submit when the base is out of stock and cannot be backordered", async () => {
    catalogue.set(baseId, variant(baseId, { stock: 0 }));
    // nothing purchasable at all: the write never happens
    expect(await addBundleToCartAction({ baseVariantId: baseId, units: 2, addOnVariantIds: [] })).toEqual({ ok: false, count: 0 });
    expect(mocks.jar.size).toBe(0);

    // the add-on may still land, but add-ons alone are not the bundle
    const result = await addBundleToCartAction({ baseVariantId: baseId, units: 2, addOnVariantIds: [pastaId] });
    expect(result).toEqual({
      ok: false,
      count: 1,
      capped: true,
      lines: [
        { variantId: pastaId, addedQuantity: 1, short: false },
        { variantId: baseId, addedQuantity: 0, short: true },
      ],
    });
  });

  it("lets a backordered base through, exactly as the product page does", async () => {
    catalogue.set(baseId, variant(baseId, { stock: 0, allowBackorder: true }));
    expect(await addBundleToCartAction({ baseVariantId: baseId, units: 2, addOnVariantIds: [] })).toEqual({
      ok: true,
      count: 2,
      lines: [{ variantId: baseId, addedQuantity: 2, short: false }],
    });
  });

  it("answers capped — never ok — when the per-line cap clamps the offer", async () => {
    catalogue.set(baseId, variant(baseId, { maxCartQuantity: 2 }));
    expect(await addBundleToCartAction({ baseVariantId: baseId, units: 3, addOnVariantIds: [] })).toEqual({
      ok: false,
      count: 2,
      capped: true,
      lines: [{ variantId: baseId, addedQuantity: 2, short: true }],
    });
  });
});

describe("a cart the builder did not fill", () => {
  it("leaves a line that already holds more than the offer asks, and still confirms", async () => {
    expect(await addBundleToCartAction({ baseVariantId: baseId, units: 4, addOnVariantIds: [] })).toEqual({
      ok: true,
      count: 4,
      lines: [{ variantId: baseId, addedQuantity: 4, short: false }],
    });

    // the shopper goes back and picks the smaller offer: the write raises, never lowers
    expect(await addBundleToCartAction({ baseVariantId: baseId, units: 2, addOnVariantIds: [] })).toEqual({
      ok: true,
      count: 4,
      lines: [{ variantId: baseId, addedQuantity: 0, short: false }],
    });
  });

  it("is idempotent: the same submit twice leaves the same cart", async () => {
    const submit = { baseVariantId: baseId, units: 2, addOnVariantIds: [pastaId] };
    expect(await addBundleToCartAction(submit)).toEqual({
      ok: true,
      count: 3,
      lines: [
        { variantId: baseId, addedQuantity: 2, short: false },
        { variantId: pastaId, addedQuantity: 1, short: false },
      ],
    });
    expect(await addBundleToCartAction(submit)).toEqual({
      ok: true,
      count: 3,
      lines: [
        { variantId: baseId, addedQuantity: 0, short: false },
        { variantId: pastaId, addedQuantity: 0, short: false },
      ],
    });
  });
});

describe("the add-on list the client sent", () => {
  it("dedupes a repeated add-on into one line", async () => {
    const result = await addBundleToCartAction({
      baseVariantId: baseId,
      units: 1,
      addOnVariantIds: [pastaId, pastaId],
    });
    expect(result).toEqual({
      ok: true,
      count: 2,
      lines: [
        { variantId: baseId, addedQuantity: 1, short: false },
        { variantId: pastaId, addedQuantity: 1, short: false },
      ],
    });
  });

  it("drops an add-on that is the base itself, rather than counting it twice", async () => {
    const result = await addBundleToCartAction({
      baseVariantId: baseId,
      units: 2,
      addOnVariantIds: [baseId],
    });
    expect(result).toEqual({
      ok: true,
      count: 2,
      lines: [{ variantId: baseId, addedQuantity: 2, short: false }],
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [baseId] } } }),
    );
  });
});

describe("the configured code (one per order, and theirs is not ours to replace)", () => {
  const submit = { baseVariantId: baseId, units: 2, addOnVariantIds: [] };

  it("applies the Setting's code when the shopper carries none", async () => {
    mocks.getBundleBuilder.mockResolvedValue({ ...DEFAULT_BUNDLE_BUILDER, couponCode: "PAKET20" });
    const result = await addBundleToCartAction(submit);
    expect(mocks.applyKodaCode).toHaveBeenCalledWith("PAKET20");
    expect(result.appliedCode).toBe("PAKET20");
  });

  it("never replaces a code the shopper is already carrying", async () => {
    mocks.getBundleBuilder.mockResolvedValue({ ...DEFAULT_BUNDLE_BUILDER, couponCode: "PAKET20" });
    mocks.readKodaCode.mockResolvedValue("MOJAKODA");
    const result = await addBundleToCartAction(submit);
    expect(mocks.applyKodaCode).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("appliedCode");
  });

  it("names no code when the Setting has none, or when the redemption check refuses it", async () => {
    // the default: no coupon configured, so no discount line anywhere
    expect(await addBundleToCartAction(submit)).not.toHaveProperty("appliedCode");
    expect(mocks.applyKodaCode).not.toHaveBeenCalled();

    mocks.getBundleBuilder.mockResolvedValue({ ...DEFAULT_BUNDLE_BUILDER, couponCode: "STARAKODA" });
    mocks.applyKodaCode.mockResolvedValue({ ok: false });
    const result = await addBundleToCartAction(submit);
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("appliedCode");
  });

  it("touches no code at all when the submit did not land", async () => {
    mocks.getBundleBuilder.mockResolvedValue({ ...DEFAULT_BUNDLE_BUILDER, couponCode: "PAKET20" });
    catalogue.set(baseId, variant(baseId, { maxCartQuantity: 1 }));
    const result = await addBundleToCartAction({ baseVariantId: baseId, units: 3, addOnVariantIds: [] });
    expect(result.ok).toBe(false);
    expect(mocks.getBundleBuilder).not.toHaveBeenCalled();
    expect(mocks.applyKodaCode).not.toHaveBeenCalled();
  });
});

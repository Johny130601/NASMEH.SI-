import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fixed bundle in the cart (QA M5, M6): the admin's "Aktiven" switch and the
 * components' stock decide whether it can be added and how many units a line
 * may hold — the bundle's own stock row is never decremented, so it cannot.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  auth: vi.fn(),
  addToCart: vi.fn(),
  setLineQuantity: vi.fn(),
  ensureCartLines: vi.fn(),
  getCartLines: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { variant: { findUnique: mocks.findUnique, findMany: mocks.findMany } } }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cart/server", () => ({
  addToCart: mocks.addToCart,
  setLineQuantity: mocks.setLineQuantity,
  ensureCartLines: mocks.ensureCartLines,
  getCartLines: mocks.getCartLines,
  removeLine: vi.fn(),
}));
vi.mock("@/lib/koda", () => ({ readKodaCode: vi.fn(), applyKodaCode: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getBundleBuilder: vi.fn() }));

import { addBundleToCartAction, addToCartAction, updateCartLineAction } from "@/app/(storefront)/actions/cart";
import { lineQuantityCap } from "@/lib/cart/hydrate";

const variantId = "cmf0variant00000000000009";
const component = (stock: number, quantity = 1, allowBackorder = false) => ({ quantity, variant: { stock, allowBackorder } });

function bundleVariant(options: { active?: boolean; items?: ReturnType<typeof component>[]; maxCartQuantity?: number } = {}) {
  return {
    id: variantId,
    maxCartQuantity: options.maxCartQuantity ?? 1,
    // the bundle row itself is never decremented: it always reads "plenty"
    stock: 100,
    allowBackorder: false,
    product: {
      status: "ACTIVE",
      hiddenDeal: false,
      bundle: { active: options.active ?? true, items: options.items ?? [component(40), component(40)] },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.addToCart.mockResolvedValue({ lines: [{ variantId, quantity: 1 }], addedQuantity: 1 });
  mocks.setLineQuantity.mockResolvedValue([{ variantId, quantity: 1 }]);
});

describe("addToCartAction with a fixed bundle", () => {
  it("adds an active bundle whose components can fill it, capped by its per-line cap", async () => {
    mocks.findUnique.mockResolvedValue(bundleVariant());
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 1, addedQuantity: 1 });
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 1 }, 1);
  });

  it("refuses a bundle whose Aktiven switch is off (QA M5)", async () => {
    mocks.findUnique.mockResolvedValue(bundleVariant({ active: false }));
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: false, count: 0, unavailable: true });
    expect(mocks.addToCart).not.toHaveBeenCalled();
  });

  it("refuses a bundle one of whose components is sold out, though its own row says 100 (QA M6)", async () => {
    mocks.findUnique.mockResolvedValue(bundleVariant({ items: [component(40), component(0)] }));
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: false, count: 0, soldOut: true });
    expect(mocks.addToCart).not.toHaveBeenCalled();
  });

  it("caps the line at what the components can fill", async () => {
    // cap 5, but the second component (2 per bundle, 5 in stock) fills only 2
    mocks.findUnique.mockResolvedValue(bundleVariant({ maxCartQuantity: 5, items: [component(40), component(5, 2)] }));
    await addToCartAction({ variantId, quantity: 5 });
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 5 }, 2);
  });

  it("lets a backorderable component through", async () => {
    mocks.findUnique.mockResolvedValue(bundleVariant({ maxCartQuantity: 3, items: [component(0, 1, true), component(40)] }));
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 1, addedQuantity: 1 });
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 1 }, 3);
  });
});

describe("updateCartLineAction with a fixed bundle", () => {
  it("refuses a withdrawn bundle and keeps a line within what the components can fill", async () => {
    mocks.findUnique.mockResolvedValue(bundleVariant({ active: false }));
    expect(await updateCartLineAction({ variantId, quantity: 1 })).toEqual({ ok: false, count: 0 });

    mocks.findUnique.mockResolvedValue(bundleVariant({ maxCartQuantity: 5, items: [component(3)] }));
    await updateCartLineAction({ variantId, quantity: 5 });
    expect(mocks.setLineQuantity).toHaveBeenLastCalledWith(null, variantId, 5, 3);
  });
});

/** A plain product in the add path, with the same shape the gate select reads. */
function plainVariant(stock: number, options: { maxCartQuantity?: number; allowBackorder?: boolean } = {}) {
  return {
    id: variantId,
    maxCartQuantity: options.maxCartQuantity ?? 5,
    stock,
    allowBackorder: options.allowBackorder ?? false,
    product: { status: "ACTIVE", hiddenDeal: false, bundle: null },
  };
}

describe("a plain product is capped the way the cart reads it back (lib/cart/hydrate lineQuantityCap)", () => {
  it("caps an add at the stock when the stock is below the per-line cap", async () => {
    mocks.findUnique.mockResolvedValue(plainVariant(3));
    await addToCartAction({ variantId, quantity: 5 });
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 5 }, 3);
    expect(lineQuantityCap(5, { stock: 3, allowBackorder: false }, null)).toBe(3);
  });

  it("answers capped — never ok — once the line holds the whole stock", async () => {
    // stock 2, the line already holds 2: the write adds nothing
    mocks.findUnique.mockResolvedValue(plainVariant(2));
    mocks.addToCart.mockResolvedValue({ lines: [{ variantId, quantity: 2 }], addedQuantity: 0 });
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: false, count: 2, capped: true });
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 1 }, 2);
  });

  it("keeps the per-line cap for a backorderable variant and for plenty of stock", async () => {
    mocks.findUnique.mockResolvedValue(plainVariant(0, { allowBackorder: true }));
    await addToCartAction({ variantId, quantity: 1 });
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 1 }, 5);

    mocks.findUnique.mockResolvedValue(plainVariant(40));
    await addToCartAction({ variantId, quantity: 1 });
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 1 }, 5);
  });

  it("lowers an update to the stock, as the cart page would show it", async () => {
    mocks.findUnique.mockResolvedValue(plainVariant(3));
    await updateCartLineAction({ variantId, quantity: 5 });
    expect(mocks.setLineQuantity).toHaveBeenLastCalledWith(null, variantId, 5, 3);
  });
});

describe("updateCartLineAction with a line that sold out in the cart (QA 2026-09-30)", () => {
  it("refuses to raise a sold-out plain line and writes nothing", async () => {
    mocks.findUnique.mockResolvedValue(plainVariant(0));
    mocks.getCartLines.mockResolvedValue([{ variantId, quantity: 1 }]);
    expect(await updateCartLineAction({ variantId, quantity: 2 })).toEqual({ ok: false, count: 1, capped: true });
    expect(mocks.setLineQuantity).not.toHaveBeenCalled();
  });

  it("refuses to raise a bundle whose component sold out, though its own row says 100", async () => {
    mocks.findUnique.mockResolvedValue(bundleVariant({ maxCartQuantity: 5, items: [component(40), component(0)] }));
    mocks.getCartLines.mockResolvedValue([{ variantId, quantity: 2 }]);
    expect(await updateCartLineAction({ variantId, quantity: 3 })).toEqual({ ok: false, count: 2, capped: true });
    expect(mocks.setLineQuantity).not.toHaveBeenCalled();
  });

  it("still lowers a sold-out line", async () => {
    mocks.findUnique.mockResolvedValue(plainVariant(0));
    mocks.getCartLines.mockResolvedValue([{ variantId, quantity: 3 }]);
    mocks.setLineQuantity.mockResolvedValue([{ variantId, quantity: 2 }]);
    expect(await updateCartLineAction({ variantId, quantity: 2 })).toEqual({ ok: true, count: 2 });
    expect(mocks.setLineQuantity).toHaveBeenLastCalledWith(null, variantId, 2, 5);
  });

  it("does not read the stored cart for a line that can still be sold", async () => {
    mocks.findUnique.mockResolvedValue(plainVariant(3));
    await updateCartLineAction({ variantId, quantity: 2 });
    expect(mocks.getCartLines).not.toHaveBeenCalled();
    expect(mocks.setLineQuantity).toHaveBeenLastCalledWith(null, variantId, 2, 3);
  });
});

describe("addBundleToCartAction gates each line the same way", () => {
  it("refuses a base whose bundle is withdrawn or cannot be filled", async () => {
    mocks.findMany.mockResolvedValue([bundleVariant({ active: false })]);
    expect(await addBundleToCartAction({ baseVariantId: variantId, units: 1, addOnVariantIds: [] })).toEqual({ ok: false, count: 0 });
    mocks.findMany.mockResolvedValue([bundleVariant({ items: [component(0)] })]);
    expect(await addBundleToCartAction({ baseVariantId: variantId, units: 1, addOnVariantIds: [] })).toEqual({ ok: false, count: 0 });
    expect(mocks.ensureCartLines).not.toHaveBeenCalled();
  });
});

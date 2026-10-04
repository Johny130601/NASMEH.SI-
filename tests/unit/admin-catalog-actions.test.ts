import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 7 step 3: direct action calls — permissions, write paths (rule 13) and guards. */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(),
  productFindUnique: vi.fn(), productCreate: vi.fn(), productUpdate: vi.fn(),
  variantCreate: vi.fn(), variantUpdate: vi.fn(), variantUpdateMany: vi.fn(), variantFindFirst: vi.fn(), variantFindMany: vi.fn(), variantDelete: vi.fn(),
  subscriptionUpdateMany: vi.fn(), settingUpsert: vi.fn(), settingFindUnique: vi.fn(), menuFindMany: vi.fn(),
  collectionCreate: vi.fn(), collectionUpdate: vi.fn(), collectionFindUnique: vi.fn(), collectionDelete: vi.fn(),
  bundleCreate: vi.fn(), bundleUpdate: vi.fn(), bundleItemDeleteMany: vi.fn(), bundleItemCreateMany: vi.fn(),
  changePrice: vi.fn(), recordInitial: vi.fn(), setStock: vi.fn(), sendAlerts: vi.fn(), removeMedia: vi.fn(),
  priceHistoryCount: vi.fn(), orderItemCount: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => {
  const client = {
    product: { findUnique: mocks.productFindUnique, create: mocks.productCreate, update: mocks.productUpdate },
    variant: { create: mocks.variantCreate, update: mocks.variantUpdate, updateMany: mocks.variantUpdateMany, findFirst: mocks.variantFindFirst, findMany: mocks.variantFindMany, delete: mocks.variantDelete },
    backInStockSubscription: { updateMany: mocks.subscriptionUpdateMany },
    priceHistory: { count: mocks.priceHistoryCount },
    orderItem: { count: mocks.orderItemCount },
    setting: { upsert: mocks.settingUpsert, findUnique: mocks.settingFindUnique },
    menu: { findMany: mocks.menuFindMany },
    collection: { create: mocks.collectionCreate, update: mocks.collectionUpdate, findUnique: mocks.collectionFindUnique, delete: mocks.collectionDelete },
    bundle: { create: mocks.bundleCreate, update: mocks.bundleUpdate },
    bundleItem: { deleteMany: mocks.bundleItemDeleteMany, createMany: mocks.bundleItemCreateMany },
    $transaction: (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(client) : Promise.all(arg as Promise<unknown>[])),
  };
  return { db: client };
});
vi.mock("@/lib/price-history", () => ({ changeVariantPriceInTx: mocks.changePrice, recordInitialPriceInTx: mocks.recordInitial }));
vi.mock("@/lib/inventory/stock", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/inventory/stock")>()), setVariantStockInTx: mocks.setStock }));
vi.mock("@/lib/jobs/restock-alerts", () => ({ sendPendingRestockAlerts: mocks.sendAlerts }));
vi.mock("@/lib/admin/media", () => ({
  InvalidMediaFile: class InvalidMediaFile extends Error {}, prepareMediaImage: vi.fn(), saveMediaImage: vi.fn(), removeMediaImage: mocks.removeMedia,
}));

import {
  createProductAction, deleteVariantAction, saveLowStockAction, saveProductAction, saveVariantAction, sendRestockAlertsAction,
} from "@/app/admin/(shell)/izdelki/actions";
import { saveCollectionAction } from "@/app/admin/(shell)/kolekcije/actions";
import { saveBundleAction } from "@/app/admin/(shell)/paketi/actions";

const session = (role: string, mfaEnrolled = true) => ({ user: { id: `cmf0${role.toLowerCase()}00000000000000001`, email: `${role.toLowerCase()}@nasmeh.si`, name: role, role, mfaEnrolled } });
const productId = "cmf0product00000000000001";
const variantId = "cmf0variant00000000000001";
const variant = {
  title: "14 uporab", sku: "nas-trk-14", priceCents: 2990, compareAtPriceCents: 3499, costCents: null, barcode: "", weightGrams: 40,
  stock: 3, maxCartQuantity: 5, allowBackorder: false, backorderNote: "",
};
const basics = {
  title: "Trakci", slug: "trakci", status: "ACTIVE" as const, description: "<p>x</p>", seoTitle: "", seoDescription: "",
  visibleInCatalog: true, visibleInSearch: true, hiddenDeal: false, klarnaEligible: true, soldOutBehavior: "NOTIFY" as const,
};
const content = {
  badges: [{ label: "Novo", style: "solid" as const }],
  merchandising: { uspChips: ["Brez peroksida"], intro: "", bullets: [], unitPrice: null, crossSell: [], extraJson: "" },
  accordions: { howItWorks: "", inci: "", guarantee: "", tested: "" }, faq: [], education: [],
};
const p2002 = (field: string) => new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6", meta: { target: [field] } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(session("OWNER"));
  mocks.productFindUnique.mockResolvedValue({ id: productId, slug: "trakci", status: "ACTIVE", variants: [{ id: variantId, stock: 3 }] });
  mocks.productCreate.mockResolvedValue({ id: productId, slug: "trakci" });
  mocks.productUpdate.mockResolvedValue({});
  mocks.variantCreate.mockResolvedValue({ id: "cmf0variant00000000000002" });
  mocks.variantUpdate.mockResolvedValue({});
  mocks.variantFindFirst.mockResolvedValue({ id: variantId });
  mocks.setStock.mockResolvedValue({ variantId, before: 0, after: 3, armedAlerts: 0 });
  mocks.changePrice.mockResolvedValue({ priceRecorded: true });
  mocks.recordInitial.mockResolvedValue({});
  // a variant as created: its initial PriceHistory row, never sold
  mocks.priceHistoryCount.mockResolvedValue(1);
  mocks.orderItemCount.mockResolvedValue(0);
  mocks.sendAlerts.mockResolvedValue({ processed: 1, sent: 1, failed: 0, skipped: 0 });
  mocks.subscriptionUpdateMany.mockResolvedValue({ count: 2 });
  mocks.settingUpsert.mockResolvedValue({});
  mocks.collectionUpdate.mockResolvedValue({});
  mocks.settingFindUnique.mockResolvedValue(null);
  mocks.menuFindMany.mockResolvedValue([]);
});

describe("catalog action permissions (direct calls)", () => {
  it("MANAGER manages the catalog; SUPPORT and FULFILLMENT are refused before any write", async () => {
    mocks.auth.mockResolvedValue(session("MANAGER"));
    expect(await createProductAction({ title: "Trakci", slug: "trakci", sku: "nas-trk-14", priceCents: 2990 })).toEqual({ ok: true, id: productId });
    for (const role of ["SUPPORT", "FULFILLMENT"]) {
      mocks.auth.mockResolvedValue(session(role));
      await expect(createProductAction({ title: "Trakci", slug: "trakci", sku: "NAS-TRK-14", priceCents: 2990 })).rejects.toThrow("forbidden");
      await expect(saveVariantAction({ productId, variantId, variant })).rejects.toThrow("forbidden");
      await expect(saveCollectionAction({ collectionId: "c1", fields: { title: "B", slug: "b", seoTitle: "", seoDescription: "", noindex: false, hideBannerText: false } })).rejects.toThrow("forbidden");
      await expect(saveBundleAction({ productId, priceCents: 4990, active: true, items: [{ variantId, quantity: 1 }] })).rejects.toThrow("forbidden");
    }
    expect(mocks.productCreate).toHaveBeenCalledTimes(1);
    expect(mocks.setStock).not.toHaveBeenCalled();
    expect(mocks.collectionUpdate).not.toHaveBeenCalled();
    expect(mocks.bundleUpdate).not.toHaveBeenCalled();
  });

  it("refuses unenrolled staff, customers and anonymous callers", async () => {
    mocks.auth.mockResolvedValue(session("OWNER", false));
    await expect(saveLowStockAction({ lowStockThreshold: 3 })).rejects.toThrow("mfa_required");
    for (const value of [null, session("CUSTOMER")]) {
      mocks.auth.mockResolvedValue(value);
      await expect(saveLowStockAction({ lowStockThreshold: 3 })).rejects.toThrow("forbidden");
    }
    expect(mocks.settingUpsert).not.toHaveBeenCalled();
  });
});

describe("products and variants", () => {
  it("creates a draft with one zero-stock variant, normalised slug/SKU and the initial price row", async () => {
    expect(await createProductAction({ title: " Trakci ", slug: " Trakci ", sku: "nas-trk-14", priceCents: 2990 })).toEqual({ ok: true, id: productId });
    expect(mocks.productCreate.mock.calls[0][0].data).toEqual({ title: "Trakci", slug: "trakci", status: "DRAFT" });
    expect(mocks.variantCreate.mock.calls[0][0].data).toMatchObject({ productId, sku: "NAS-TRK-14", priceCents: 2990, stock: 0 });
    expect(mocks.recordInitial).toHaveBeenCalledWith(expect.anything(), { variantId: "cmf0variant00000000000002", priceCents: 2990 });
    mocks.productCreate.mockRejectedValueOnce(p2002("slug"));
    expect(await createProductAction({ title: "Trakci", slug: "trakci", sku: "NAS-TRK-14", priceCents: 2990 })).toEqual({ ok: false, error: "slugTaken" });
    // A refused create names the field the form marks with its rule (QA T6-11, v-a).
    expect(await createProductAction({ title: "", slug: "trakci", sku: "NAS-TRK-14", priceCents: 2990 })).toEqual({ ok: false, error: "invalid", field: "title" });
  });

  it("names the create-form field that failed: slug, SKU or price (QA v-a)", async () => {
    expect(await createProductAction({ title: "QA", slug: "Neveljaven Slug!", sku: "QA-1", priceCents: 1500 })).toEqual({ ok: false, error: "invalid", field: "slug" });
    expect(await createProductAction({ title: "QA", slug: "slabo-ime!", sku: "QA-1", priceCents: 1500 })).toEqual({ ok: false, error: "invalid", field: "slug" });
    expect(await createProductAction({ title: "QA", slug: "qa-izdelek", sku: "!bad sku", priceCents: 1500 })).toEqual({ ok: false, error: "invalid", field: "sku" });
    expect(await createProductAction({ title: "QA", slug: "qa-izdelek", sku: "QA-1", priceCents: 15.5 })).toEqual({ ok: false, error: "invalid", field: "priceCents" });
    expect(mocks.productCreate).not.toHaveBeenCalled();
  });

  it("names the menus and home blocks that still link to a product a save takes off sale or renames (QA v-a)", async () => {
    mocks.menuFindMany.mockResolvedValue([
      { handle: "header", items: [{ label: "TRGOVINA", href: "/trgovina", children: [{ label: "Trakci", href: "/izdelek/trakci" }] }] },
      { handle: "footer-trgovina", items: [{ label: "Trakci", href: "/izdelek/trakci" }] },
    ]);
    mocks.settingFindUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
      (where.key === "home.hero" ? { value: { title: "T", subtitle: "S", ctaLabel: "K", ctaHref: "/izdelek/trakci" } } : null));
    // Still on sale under the same slug: nothing to report and nothing read.
    expect(await saveProductAction({ productId, basics, content })).toEqual({ ok: true });
    expect(mocks.menuFindMany).not.toHaveBeenCalled();
    // Hidden deal SKU, archived, draft: its page answers 404.
    for (const change of [{ hiddenDeal: true }, { status: "ARCHIVED" as const }, { status: "DRAFT" as const }]) {
      expect(await saveProductAction({ productId, basics: { ...basics, ...change }, content }), JSON.stringify(change)).toEqual({ ok: true, linkedFrom: ["header", "footer-trgovina", "hero"] });
    }
    // Renamed: the links still name the old slug.
    expect(await saveProductAction({ productId, basics: { ...basics, slug: "trakci-novi" }, content })).toEqual({ ok: true, linkedFrom: ["header", "footer-trgovina", "hero"] });
    // An active product whose bundle is withdrawn is off sale as well.
    mocks.productFindUnique.mockResolvedValueOnce({ slug: "trakci", bundle: { active: false } });
    expect(await saveProductAction({ productId, basics, content })).toEqual({ ok: true, linkedFrom: ["header", "footer-trgovina", "hero"] });
    // Nothing links to it: a plain success.
    mocks.menuFindMany.mockResolvedValue([]);
    mocks.settingFindUnique.mockResolvedValue(null);
    expect(await saveProductAction({ productId, basics: { ...basics, hiddenDeal: true }, content })).toEqual({ ok: true });
  });

  it("saves basics and content, structured merchandising keys winning over the JSON remainder", async () => {
    const result = await saveProductAction({ productId, basics, content: { ...content, merchandising: { ...content.merchandising, extraJson: JSON.stringify({ uspChips: ["shadow"], meta: { supplier: "X" } }) } } });
    expect(result).toEqual({ ok: true });
    const data = mocks.productUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: "Trakci", slug: "trakci", seoTitle: null, badges: [{ label: "Novo", style: "solid" }] });
    expect(data.customFields).toEqual({ meta: { supplier: "X" }, uspChips: ["Brez peroksida"], intro: "", bullets: [], crossSell: [] });
    expect(await saveProductAction({ productId, basics, content: { ...content, merchandising: { ...content.merchandising, extraJson: "[1]" } } })).toEqual({ ok: false, error: "extraJson" });
    mocks.productUpdate.mockRejectedValueOnce(p2002("slug"));
    expect(await saveProductAction({ productId, basics, content })).toEqual({ ok: false, error: "slugTaken" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/izdelek/trakci");
  });

  it("stores the description and accordion HTML sanitized (QA S1) and names the field a refused save failed on (QA T6-11)", async () => {
    const hostile = "<p>Varno</p><script>alert(1)</script><img src=x onerror=alert(2)>";
    expect(await saveProductAction({ productId, basics: { ...basics, description: hostile }, content: { ...content, accordions: { ...content.accordions, howItWorks: hostile, tested: "<a href=\"javascript:alert(3)\">x</a>" } } })).toEqual({ ok: true });
    const data = mocks.productUpdate.mock.calls[0][0].data;
    for (const html of [data.description, data.accordions.howItWorks, data.accordions.tested]) {
      expect(html).not.toMatch(/<script|onerror|javascript:/i);
    }
    expect(data.description).toContain("<p>Varno</p>");
    expect(await saveProductAction({ productId, basics: { ...basics, slug: "Ne Velja!" }, content })).toEqual({ ok: false, error: "invalid", field: "slug" });
    expect(await saveProductAction({ productId, basics, content: { ...content, merchandising: { ...content.merchandising, uspChips: ["x".repeat(41)] } } })).toEqual({ ok: false, error: "invalid", field: "uspChips" });
    expect(await saveProductAction({ productId, basics, content: { ...content, faq: [{ q: "", a: "odgovor" }] } })).toEqual({ ok: false, error: "invalid", field: "faq" });
    expect(await saveProductAction({ productId: "", basics, content })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.productUpdate).toHaveBeenCalledTimes(1);
  });

  it("routes an existing variant's price through the price-history helper and its stock through the stock helper, then flushes armed alerts", async () => {
    mocks.setStock.mockResolvedValueOnce({ variantId, before: 0, after: 3, armedAlerts: 2 });
    expect(await saveVariantAction({ productId, variantId, variant })).toEqual({ ok: true, armed: 2 });
    expect(mocks.variantUpdate.mock.calls[0][0]).toEqual({ where: { id: variantId }, data: {
      title: "14 uporab", sku: "NAS-TRK-14", costCents: null, barcode: null, weightGrams: 40, maxCartQuantity: 5, allowBackorder: false, backorderNote: null,
    } });
    expect(mocks.variantUpdate.mock.calls[0][0].data).not.toHaveProperty("priceCents");
    expect(mocks.variantUpdate.mock.calls[0][0].data).not.toHaveProperty("stock");
    expect(mocks.changePrice).toHaveBeenCalledWith(expect.anything(), { variantId, priceCents: 2990, compareAtPriceCents: 3499 });
    expect(mocks.setStock).toHaveBeenCalledWith(expect.anything(), variantId, 3, { expectedBefore: undefined });
    expect(mocks.sendAlerts).toHaveBeenCalledTimes(1);

    mocks.sendAlerts.mockClear();
    expect(await saveVariantAction({ productId, variantId, variant })).toEqual({ ok: true, armed: 0 });
    expect(mocks.sendAlerts).not.toHaveBeenCalled();
  });

  it("creates a new variant at zero stock with the initial price row before the stock helper raises it", async () => {
    expect(await saveVariantAction({ productId, variantId: null, variant: { ...variant, sku: "NAS-TRK-07", stock: 5 } })).toEqual({ ok: true, armed: 0 });
    expect(mocks.variantCreate.mock.calls[0][0].data).toMatchObject({ productId, sku: "NAS-TRK-07", priceCents: 2990, compareAtPriceCents: 3499, stock: 0 });
    expect(mocks.recordInitial).toHaveBeenCalledWith(expect.anything(), { variantId: "cmf0variant00000000000002", priceCents: 2990, compareAtPriceCents: 3499 });
    expect(mocks.changePrice).not.toHaveBeenCalled();
    expect(mocks.setStock).toHaveBeenCalledWith(expect.anything(), "cmf0variant00000000000002", 5, { expectedBefore: undefined });
    mocks.variantCreate.mockRejectedValueOnce(p2002("sku"));
    expect(await saveVariantAction({ productId, variantId: null, variant })).toEqual({ ok: false, error: "skuTaken" });
  });

  it("writes stock only when the operator changed it, and only over the figure the form showed (QA 2026-10-03 T5-01)", async () => {
    // an unrelated field saved on a form opened at 3: stock is left to whatever orders made of it
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, stock: 3 }, stockLoaded: 3 })).toEqual({ ok: true, armed: 0 });
    expect(mocks.setStock).not.toHaveBeenCalled();
    // a new figure is written over the one the form showed
    mocks.setStock.mockResolvedValueOnce({ variantId, before: 7, after: 10, armedAlerts: 0 });
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, stock: 10 }, stockLoaded: 7 })).toEqual({ ok: true, armed: 0 });
    expect(mocks.setStock).toHaveBeenCalledWith(expect.anything(), variantId, 10, { expectedBefore: 7 });
    // and refused when an order moved the stock since the form opened
    const { StockChangedError } = await import("@/lib/inventory/stock");
    mocks.setStock.mockRejectedValueOnce(new StockChangedError(5));
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, stock: 10 }, stockLoaded: 7 })).toEqual({ ok: false, error: "stockChanged", currentStock: 5 });
  });

  it("saves a backordered variant below zero without touching its stock, and refuses a new negative figure (QA 2026-10-03 T5-02)", async () => {
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, stock: -2, allowBackorder: true }, stockLoaded: -2 })).toEqual({ ok: true, armed: 0 });
    expect(mocks.setStock).not.toHaveBeenCalled();
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, stock: -1 }, stockLoaded: 4 })).toEqual({ ok: false, error: "stockNegative" });
    expect(await saveVariantAction({ productId, variantId: null, variant: { ...variant, sku: "NAS-NEG-1", stock: -1 } })).toEqual({ ok: false, error: "stockNegative" });
    expect(mocks.setStock).not.toHaveBeenCalled();
  });

  it("refuses invalid variants and variants of another product without writing", async () => {
    expect(await saveVariantAction({ productId, variantId, variant: { ...variant, compareAtPriceCents: 2990 } })).toEqual({ ok: false, error: "invalid" });
    mocks.variantFindFirst.mockResolvedValueOnce(null);
    expect(await saveVariantAction({ productId, variantId, variant })).toEqual({ ok: false, error: "not_found" });
    expect(mocks.changePrice).not.toHaveBeenCalled();
    expect(mocks.setStock).not.toHaveBeenCalled();
  });

  it("deletes a variant only when it is not the last one nor a bundle component, keeping subscriptions on the product", async () => {
    mocks.productFindUnique.mockResolvedValue({ slug: "trakci", variants: [{ id: variantId, _count: { bundleItems: 0 } }] });
    expect(await deleteVariantAction({ productId, variantId })).toEqual({ ok: false, error: "lastVariant" });
    mocks.productFindUnique.mockResolvedValue({ slug: "trakci", variants: [{ id: variantId, _count: { bundleItems: 1 } }, { id: "v2", _count: { bundleItems: 0 } }] });
    expect(await deleteVariantAction({ productId, variantId })).toEqual({ ok: false, error: "inBundle" });
    mocks.productFindUnique.mockResolvedValue({ slug: "trakci", variants: [{ id: variantId, _count: { bundleItems: 0 } }, { id: "v2", _count: { bundleItems: 0 } }] });
    mocks.subscriptionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.variantDelete.mockResolvedValue({});
    expect(await deleteVariantAction({ productId, variantId })).toEqual({ ok: true });
    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith({ where: { variantId }, data: { variantId: null } });
    expect(mocks.variantDelete).toHaveBeenCalledWith({ where: { id: variantId } });
  });

  it("refuses to delete a variant whose price history or sales are the Omnibus record (QA 2026-10-03 T5-09)", async () => {
    mocks.productFindUnique.mockResolvedValue({ slug: "trakci", variants: [{ id: variantId, _count: { bundleItems: 0 } }, { id: "v2", _count: { bundleItems: 0 } }] });
    mocks.priceHistoryCount.mockResolvedValue(2);
    expect(await deleteVariantAction({ productId, variantId })).toEqual({ ok: false, error: "hasHistory" });
    mocks.priceHistoryCount.mockResolvedValue(1);
    mocks.orderItemCount.mockResolvedValue(1);
    expect(await deleteVariantAction({ productId, variantId })).toEqual({ ok: false, error: "hasHistory" });
    expect(mocks.variantDelete).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it("re-arms confirmed, un-notified subscriptions for stocked variants and flushes the queue; refuses without stock", async () => {
    expect(await sendRestockAlertsAction({ productId })).toEqual({ ok: true, armed: 2, sent: 1, failed: 0 });
    expect(mocks.subscriptionUpdateMany.mock.calls[0][0]).toEqual({
      where: { productId, status: "CONFIRMED", notifiedAt: null, alertPendingSince: null, OR: [{ variantId: null }, { variantId: { in: [variantId] } }] },
      data: { alertPendingSince: expect.any(Date) },
    });
    expect(mocks.sendAlerts).toHaveBeenCalledTimes(1);
    mocks.productFindUnique.mockResolvedValue({ slug: "trakci", status: "ACTIVE", variants: [{ id: variantId, stock: 0 }] });
    expect(await sendRestockAlertsAction({ productId })).toEqual({ ok: false, error: "noStock" });
    mocks.productFindUnique.mockResolvedValue({ slug: "trakci", status: "DRAFT", variants: [{ id: variantId, stock: 4 }] });
    expect(await sendRestockAlertsAction({ productId })).toEqual({ ok: false, error: "noStock" });
    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("stores the low-stock threshold as a setting", async () => {
    expect(await saveLowStockAction({ lowStockThreshold: 8 })).toEqual({ ok: true });
    expect(mocks.settingUpsert).toHaveBeenCalledWith({
      where: { key: "inventory.lowStockThreshold" }, create: { key: "inventory.lowStockThreshold", value: 8 }, update: { value: 8 },
    });
    expect(await saveLowStockAction({ lowStockThreshold: -1 })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("collections and bundles", () => {
  it("maps unique-slug and missing-row failures for collections", async () => {
    const fields = { title: "Beljenje", slug: "beljenje", seoTitle: "", seoDescription: "", noindex: true, hideBannerText: false };
    expect(await saveCollectionAction({ collectionId: "cmf0collection000000000001", fields })).toEqual({ ok: true });
    expect(mocks.collectionUpdate.mock.calls[0][0].data).toEqual({ ...fields, seoTitle: null, seoDescription: null });
    mocks.collectionUpdate.mockRejectedValueOnce(p2002("slug"));
    expect(await saveCollectionAction({ collectionId: "cmf0collection000000000001", fields })).toEqual({ ok: false, error: "slugTaken" });
    mocks.collectionUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "6" }));
    expect(await saveCollectionAction({ collectionId: "cmf0collection000000000001", fields })).toEqual({ ok: false, error: "not_found" });
  });

  it("rejects self-referencing and nested bundles, then writes components and the bundle price through the price helper", async () => {
    const bundleProduct = { id: productId, slug: "paket", bundle: { id: "b1" }, variants: [{ id: "bundle-variant" }] };
    mocks.productFindUnique.mockResolvedValue(bundleProduct);
    mocks.variantFindMany.mockResolvedValueOnce([{ id: variantId, productId, product: { bundle: null } }]);
    expect(await saveBundleAction({ productId, priceCents: 4990, active: true, items: [{ variantId, quantity: 1 }] })).toEqual({ ok: false, error: "self" });
    mocks.variantFindMany.mockResolvedValueOnce([{ id: variantId, productId: "other", product: { bundle: { id: "b2" } } }]);
    expect(await saveBundleAction({ productId, priceCents: 4990, active: true, items: [{ variantId, quantity: 1 }] })).toEqual({ ok: false, error: "nested" });
    expect(await saveBundleAction({ productId, priceCents: 4990, active: true, items: [{ variantId, quantity: 1 }, { variantId, quantity: 2 }] })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.bundleUpdate).not.toHaveBeenCalled();

    mocks.variantFindMany.mockResolvedValueOnce([{ id: variantId, productId: "other", product: { bundle: null } }, { id: "v2", productId: "third", product: { bundle: null } }]);
    mocks.bundleUpdate.mockResolvedValue({});
    mocks.bundleItemDeleteMany.mockResolvedValue({});
    mocks.bundleItemCreateMany.mockResolvedValue({});
    expect(await saveBundleAction({ productId, priceCents: 4990, active: true, items: [{ variantId, quantity: 1 }, { variantId: "v2", quantity: 2 }] })).toEqual({ ok: true });
    expect(mocks.bundleUpdate).toHaveBeenCalledWith({ where: { id: "b1" }, data: { priceCents: 4990, active: true } });
    expect(mocks.bundleItemCreateMany.mock.calls[0][0].data).toEqual([{ bundleId: "b1", variantId, quantity: 1 }, { bundleId: "b1", variantId: "v2", quantity: 2 }]);
    expect(mocks.changePrice).toHaveBeenCalledWith(expect.anything(), { variantId: "bundle-variant", priceCents: 4990 });
    expect(mocks.variantUpdate).toHaveBeenCalledWith({ where: { id: "bundle-variant" }, data: { maxCartQuantity: 1 } });
    expect(mocks.menuFindMany).not.toHaveBeenCalled();
  });

  it("names the menus and home blocks that still link to a bundle saved inactive (QA v-a)", async () => {
    mocks.productFindUnique.mockResolvedValue({ id: productId, slug: "paket-popolna-rutina", bundle: { id: "b1" }, variants: [{ id: "bundle-variant" }] });
    mocks.variantFindMany.mockResolvedValue([{ id: variantId, productId: "other", product: { bundle: null } }]);
    mocks.bundleUpdate.mockResolvedValue({});
    mocks.bundleItemDeleteMany.mockResolvedValue({});
    mocks.bundleItemCreateMany.mockResolvedValue({});
    mocks.settingFindUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
      (where.key === "home.hero" ? { value: { title: "T", subtitle: "S", ctaLabel: "K", ctaHref: "/trgovina", promoOverlayText: "P", promoOverlayHref: "/izdelek/paket-popolna-rutina" } } : null));
    // The routine banner without a stored row links to the routine bundle by default.
    expect(await saveBundleAction({ productId, priceCents: 4990, active: false, items: [{ variantId, quantity: 1 }] })).toEqual({ ok: true, linkedFrom: ["hero", "routineBanner"] });
    expect(mocks.bundleUpdate).toHaveBeenCalledWith({ where: { id: "b1" }, data: { priceCents: 4990, active: false } });
    mocks.settingFindUnique.mockClear();
    expect(await saveBundleAction({ productId, priceCents: 4990, active: true, items: [{ variantId, quantity: 1 }] })).toEqual({ ok: true });
    expect(mocks.settingFindUnique).not.toHaveBeenCalled();
  });
});

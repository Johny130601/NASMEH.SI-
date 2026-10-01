import { beforeEach, describe, expect, it, vi } from "vitest";

/** QA 2026-09-30 v-a: operator links to a product page that answers 404 are found, dropped or replaced. */

const mocks = vi.hoisted(() => ({ productFindMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { product: { findMany: mocks.productFindMany } } }));

import { PURCHASABLE_PRODUCT_WHERE } from "@/lib/cart/visibility";
import {
  heroWithAvailableLinks, linkedProductSlug, linkIsAvailable, menuHrefs, menuWithAvailableLinks, productSlugsIn, purchasableSlugs,
  unavailableMenuTargets, unavailableProductLinks, unavailableReason, unavailableReasons,
} from "@/lib/content-links";
import type { MenuItem } from "@/lib/settings";

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://nasmeh.si";
});

describe("linkedProductSlug", () => {
  it("reads the slug of a product page with a trailing slash, query or hash, on the store's own origin too", () => {
    expect(linkedProductSlug("/izdelek/ustna-voda")).toBe("ustna-voda");
    expect(linkedProductSlug(" /izdelek/ustna-voda/ ")).toBe("ustna-voda");
    expect(linkedProductSlug("/izdelek/ustna-voda?varianta=1#mnenja")).toBe("ustna-voda");
    expect(linkedProductSlug("/izdelek/paket#vsebina")).toBe("paket");
    expect(linkedProductSlug("/izdelek/%C4%8Distilo")).toBe("čistilo");
    expect(linkedProductSlug("https://nasmeh.si/izdelek/serum?x=1")).toBe("serum");
  });

  it("returns null for every other link", () => {
    for (const href of ["/trgovina", "/trgovina?kolekcija=paketi", "/izdelek", "/izdelek/", "/izdelek/a/b", "#izdelki", "/", "//evil.example/izdelek/x",
      "https://instagram.com/izdelek/x", "https://nasmeh.si.evil.example/izdelek/x", "javascript:alert(1)", "", null, undefined, 42]) {
      expect(linkedProductSlug(href), String(href)).toBeNull();
    }
  });

  it("collects the product slugs of a list once each", () => {
    expect(productSlugsIn(["/izdelek/a", "/trgovina", "/izdelek/b?x=1", "/izdelek/a#top", null])).toEqual(["a", "b"]);
  });
});

describe("render-time filters", () => {
  const purchasable = new Set(["trakci", "serum"]);

  it("passes links that are not product pages and product pages that answer", () => {
    expect(linkIsAvailable("/trgovina", purchasable)).toBe(true);
    expect(linkIsAvailable("https://instagram.com/", purchasable)).toBe(true);
    expect(linkIsAvailable("/izdelek/trakci?x=1", purchasable)).toBe(true);
    expect(linkIsAvailable("/izdelek/ustna-voda", purchasable)).toBe(false);
  });

  it("drops dropdown links, featured slugs and items that lead to a 404, and keeps a dropdown's label", () => {
    const header: MenuItem[] = [
      {
        label: "TRGOVINA", href: "/trgovina", featured: ["trakci", "ustna-voda"],
        children: [{ label: "Vsi izdelki", href: "/trgovina" }, { label: "Trakci", href: "/izdelek/trakci" }, { label: "Ustna voda", href: "/izdelek/ustna-voda" }],
      },
      { label: "PAKET", href: "/izdelek/paket", color: "sale" },
      { label: "SERUM", href: "/izdelek/serum" },
    ];
    expect(menuWithAvailableLinks(header, purchasable)).toEqual([
      {
        label: "TRGOVINA", href: "/trgovina", featured: ["trakci"],
        children: [{ label: "Vsi izdelki", href: "/trgovina" }, { label: "Trakci", href: "/izdelek/trakci" }],
      },
      { label: "SERUM", href: "/izdelek/serum" },
    ]);
    expect(menuHrefs(header)).toEqual(["/trgovina", "/trgovina", "/izdelek/trakci", "/izdelek/ustna-voda", "/izdelek/paket", "/izdelek/serum"]);
  });

  it("turns an item whose dropdown is emptied into its own link, or drops it when that link leads to a 404 too", () => {
    const items: MenuItem[] = [
      { label: "USTNA VODA", href: "/izdelek/ustna-voda", children: [{ label: "500 ml", href: "/izdelek/ustna-voda?v=500" }] },
      { label: "PAKETI", href: "/trgovina?kolekcija=paketi", children: [{ label: "Paket", href: "/izdelek/paket" }] },
    ];
    expect(menuWithAvailableLinks(items, purchasable)).toEqual([{ label: "PAKETI", href: "/trgovina?kolekcija=paketi", children: [] }]);
  });

  it("drops a dead item whatever its children where items render as their own links (footer, utility bar)", () => {
    const items: MenuItem[] = [
      { label: "USTNA VODA", href: "/izdelek/ustna-voda", children: [{ label: "Kontakt", href: "/kontakt" }] },
      { label: "Kontakt", href: "/kontakt", children: [{ label: "Paket", href: "/izdelek/paket" }] },
      { label: "Trakci", href: "/izdelek/trakci" },
    ];
    expect(menuWithAvailableLinks(items, purchasable, { dropdowns: false })).toEqual([
      { label: "Kontakt", href: "/kontakt", children: [] },
      { label: "Trakci", href: "/izdelek/trakci" },
    ]);
    // The header and drawer render the first item as a dropdown button, so its dead href is never a link there.
    expect(menuWithAvailableLinks(items, purchasable)[0]).toEqual(items[0]);
  });

  it("leaves a footer column without product links untouched and passes malformed rows through", () => {
    const footer = [{ label: "Kontakt", href: "/kontakt" }, { label: "Instagram", href: "https://instagram.com/" }];
    expect(menuWithAvailableLinks(footer, new Set())).toEqual(footer);
    const malformed = [null, { label: "X" }] as unknown as MenuItem[];
    expect(menuWithAvailableLinks(malformed, new Set())).toEqual(malformed);
  });

  it("sends the hero button to the shop and drops the promo line when they name a product nobody can buy", () => {
    const hero = { title: "T", subtitle: "S", ctaLabel: "Kupi", ctaHref: "/izdelek/ustna-voda", promoOverlayText: "Paket", promoOverlayHref: "/izdelek/paket" };
    expect(heroWithAvailableLinks(hero, purchasable)).toEqual({ title: "T", subtitle: "S", ctaLabel: "Kupi", ctaHref: "/trgovina" });
    const live = { ...hero, ctaHref: "/izdelek/trakci", promoOverlayHref: "/izdelek/serum" };
    expect(heroWithAvailableLinks(live, purchasable)).toEqual(live);
    // A promo line without a link keeps its default target (the shop).
    const unlinked = { ...live, promoOverlayHref: undefined };
    expect(heroWithAvailableLinks(unlinked, purchasable)).toEqual(unlinked);
  });
});

describe("queries", () => {
  it("checks slugs with the purchasable fragment the product page and the header use, and skips an empty list", async () => {
    mocks.productFindMany.mockResolvedValueOnce([{ slug: "trakci" }]);
    expect(await purchasableSlugs(["trakci", "ustna-voda", "trakci"])).toEqual(new Set(["trakci"]));
    expect(mocks.productFindMany).toHaveBeenCalledWith({ where: { slug: { in: ["trakci", "ustna-voda"] }, ...PURCHASABLE_PRODUCT_WHERE }, select: { slug: true } });
    expect(await purchasableSlugs([])).toEqual(new Set());
    expect(mocks.productFindMany).toHaveBeenCalledTimes(1);
  });

  it("names why a product page answers 404, draft before hidden deal before a withdrawn bundle", () => {
    expect(unavailableReason(null)).toBe("unknown");
    expect(unavailableReason({ status: "DRAFT", hiddenDeal: true, bundle: { active: false } })).toBe("draft");
    expect(unavailableReason({ status: "ARCHIVED", hiddenDeal: false, bundle: null })).toBe("archived");
    expect(unavailableReason({ status: "ACTIVE", hiddenDeal: true, bundle: { active: false } })).toBe("hiddenDeal");
    expect(unavailableReason({ status: "ACTIVE", hiddenDeal: false, bundle: { active: false } })).toBe("bundleInactive");
    expect(unavailableReason({ status: "ACTIVE", hiddenDeal: false, bundle: { active: true } })).toBeNull();
  });

  it("lists the links that lead to a 404 with their reason, reading reasons only when one fails", async () => {
    mocks.productFindMany
      .mockResolvedValueOnce([{ slug: "trakci" }])
      .mockResolvedValueOnce([{ slug: "ustna-voda", status: "ACTIVE", hiddenDeal: true, bundle: null }]);
    expect(await unavailableProductLinks(["/izdelek/trakci", "/trgovina", "/izdelek/ustna-voda", "/izdelek/ne-obstaja?x=1", "/izdelek/ustna-voda", null])).toEqual([
      { href: "/izdelek/ustna-voda", reason: "hiddenDeal" },
      { href: "/izdelek/ne-obstaja?x=1", reason: "unknown" },
    ]);
    expect(mocks.productFindMany.mock.calls[1][0]).toEqual({
      where: { slug: { in: ["ustna-voda", "ne-obstaja"] } },
      select: { slug: true, status: true, hiddenDeal: true, bundle: { select: { active: true } } },
    });

    mocks.productFindMany.mockReset();
    mocks.productFindMany.mockResolvedValueOnce([{ slug: "trakci" }]);
    expect(await unavailableProductLinks(["/izdelek/trakci", "#izdelki"])).toEqual([]);
    expect(await unavailableProductLinks(["/trgovina", "https://instagram.com/"])).toEqual([]);
    expect(mocks.productFindMany).toHaveBeenCalledTimes(1);
  });

  it("checks a menu's links and featured cards in one query and reports them apart, featured slugs first", async () => {
    mocks.productFindMany
      .mockResolvedValueOnce([{ slug: "trakci" }])
      .mockResolvedValueOnce([
        { slug: "ustna-voda", status: "ACTIVE", hiddenDeal: true, bundle: null },
        { slug: "paket", status: "ACTIVE", hiddenDeal: false, bundle: { active: false } },
      ]);
    expect(await unavailableMenuTargets(["/trgovina", "/izdelek/trakci", "/izdelek/ustna-voda?x=1", null], ["paket", "trakci", "ustna-voda", "paket"])).toEqual({
      links: [{ href: "/izdelek/ustna-voda?x=1", reason: "hiddenDeal" }],
      featured: [{ slug: "paket", reason: "bundleInactive" }, { slug: "ustna-voda", reason: "hiddenDeal" }],
    });
    expect(mocks.productFindMany.mock.calls[0][0]).toEqual({ where: { slug: { in: ["paket", "trakci", "ustna-voda"] }, ...PURCHASABLE_PRODUCT_WHERE }, select: { slug: true } });
    expect(mocks.productFindMany.mock.calls[1][0].where).toEqual({ slug: { in: ["paket", "ustna-voda"] } });

    mocks.productFindMany.mockReset();
    expect(await unavailableMenuTargets(["/kontakt"], [])).toEqual({ links: [], featured: [] });
    expect(mocks.productFindMany).not.toHaveBeenCalled();
  });

  it("leaves out a slug that turned purchasable between the two reads", async () => {
    mocks.productFindMany.mockResolvedValueOnce([{ slug: "paket", status: "ACTIVE", hiddenDeal: false, bundle: { active: true } }]);
    expect(await unavailableReasons(["paket"])).toEqual(new Map());
  });
});

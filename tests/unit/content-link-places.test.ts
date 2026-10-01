import { beforeEach, describe, expect, it, vi } from "vitest";

/** QA 2026-09-30 v-a: the admin names where operator content links to a product that left sale. */

const mocks = vi.hoisted(() => ({ menuFindMany: vi.fn(), settingFindUnique: vi.fn(), productFindMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  menu: { findMany: mocks.menuFindMany },
  setting: { findUnique: mocks.settingFindUnique },
  product: { findMany: mocks.productFindMany },
} }));

import { contentLinksToProducts, loadHomeEditor, unavailableMenuLinks } from "@/lib/admin/cms";

const settings: Record<string, unknown> = {};

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of Object.keys(settings)) delete settings[key];
  mocks.settingFindUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (where.key in settings ? { key: where.key, value: settings[where.key] } : null));
  mocks.menuFindMany.mockResolvedValue([
    { handle: "header", items: [{ label: "TRGOVINA", href: "/trgovina", children: [{ label: "Ustna voda", href: "/izdelek/ustna-voda" }], featured: ["trakci"] }] },
    { handle: "mobile", items: [{ label: "TRGOVINA", href: "/trgovina", featured: ["serum", "paket"] }] },
    { handle: "footer-trgovina", items: [{ label: "Ustna voda", href: "/izdelek/ustna-voda?x=1" }, { label: "Paketi", href: "/trgovina?kolekcija=paketi" }] },
    { handle: "footer-pravno", items: "not-a-list" },
  ]);
});

describe("contentLinksToProducts", () => {
  it("names each menu by its links, dropdown links and featured cards, in handle order", async () => {
    expect(await contentLinksToProducts(["ustna-voda"])).toEqual(["header", "footer-trgovina"]);
    expect(await contentLinksToProducts(["paket"])).toEqual(["mobile"]);
    // Without a stored row the routine banner renders its default link to the routine bundle.
    expect(await contentLinksToProducts(["paket-popolna-rutina"])).toEqual(["routineBanner"]);
    expect(await contentLinksToProducts(["nobeden"])).toEqual([]);
  });

  it("names the hero, the banners with the storefront's defaults, and the marquee", async () => {
    settings["home.hero"] = { title: "T", subtitle: "S", ctaLabel: "K", ctaHref: "/izdelek/trakci", promoOverlayText: "P", promoOverlayHref: "/izdelek/paket" };
    settings["home.bundleBanner"] = { title: "B", cta: "C", href: "/izdelek/paket" };
    settings["home.routineBanner"] = { title: "R", href: "/trgovina", image: "/x.svg", imageAlt: "A", footnote: "" };
    settings["marquee.href"] = "/izdelek/paket#top";
    expect(await contentLinksToProducts(["paket"])).toEqual(["mobile", "hero", "bundleBanner", "marquee"]);
    expect(await contentLinksToProducts(["trakci", "serum"])).toEqual(["header", "mobile", "hero"]);
  });

  it("reads nothing for an empty list", async () => {
    expect(await contentLinksToProducts([])).toEqual([]);
    expect(mocks.menuFindMany).not.toHaveBeenCalled();
    expect(mocks.settingFindUnique).not.toHaveBeenCalled();
  });
});

describe("editor warnings on load", () => {
  it("names a stored menu's dead links and featured cards apart, since the save stores the one and refuses the other", async () => {
    mocks.productFindMany
      .mockResolvedValueOnce([{ slug: "trakci" }])
      .mockResolvedValueOnce([{ slug: "ustna-voda", status: "ACTIVE", hiddenDeal: true, bundle: null }]);
    const items = [{ label: "TRGOVINA", href: "/trgovina", children: [{ label: "Ustna voda", href: "/izdelek/ustna-voda" }], featured: ["trakci", "ustna-voda"] }];
    expect(await unavailableMenuLinks(items)).toEqual({
      links: [{ href: "/izdelek/ustna-voda", reason: "hiddenDeal" }],
      featured: [{ slug: "ustna-voda", reason: "hiddenDeal" }],
    });
    // One purchasable read for links and featured cards, the same check saveMenuAction runs.
    expect(mocks.productFindMany).toHaveBeenCalledTimes(2);
  });

  it("splits the home page's dead links by block", async () => {
    settings["home.hero"] = { title: "T", subtitle: "S", ctaLabel: "K", ctaHref: "/izdelek/trakci", promoOverlayText: "P", promoOverlayHref: "/izdelek/paket" };
    mocks.productFindMany
      .mockResolvedValueOnce([{ slug: "trakci" }])
      .mockResolvedValueOnce([{ slug: "paket", status: "ACTIVE", hiddenDeal: false, bundle: { active: false } }]);
    // Without a stored row the routine banner links to the routine bundle, which this catalog does not have.
    const editor = await loadHomeEditor();
    expect(editor.unavailableLinks).toEqual({
      hero: [{ href: "/izdelek/paket", reason: "bundleInactive" }],
      bundleBanner: [],
      routineBanner: [{ href: "/izdelek/paket-popolna-rutina", reason: "unknown" }],
    });
  });
});

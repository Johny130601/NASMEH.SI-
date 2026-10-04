import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA 2026-09-30 v-a, review round 2: the admin names dead product links when an editor opens, not only
 * after a save. A bundle shell is created inactive (its page answers 404), so the bundle editor names
 * the places that still link to it; the menu editor names stored featured cards apart from links,
 * because the save refuses the one and stores the other.
 */

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

const mocks = vi.hoisted(() => ({ loadBundle: vi.fn(), contentLinksToProducts: vi.fn(), loadMenu: vi.fn(), unavailableMenuLinks: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/admin/access", () => ({ requirePagePermission: vi.fn(async () => ({ role: "OWNER" })) }));
vi.mock("@/lib/admin/catalog", () => ({ loadBundle: mocks.loadBundle }));
vi.mock("@/lib/admin/cms", () => ({
  contentLinksToProducts: mocks.contentLinksToProducts, loadMenu: mocks.loadMenu, unavailableMenuLinks: mocks.unavailableMenuLinks,
}));
vi.mock("@/app/admin/(shell)/paketi/actions", () => ({ createBundleAction: vi.fn(), saveBundleAction: vi.fn() }));
vi.mock("@/app/admin/(shell)/navigacija/actions", () => ({ saveMenuAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import AdminBundleEditorPage from "@/app/admin/(shell)/paketi/[id]/page";
import AdminMenuEditorPage from "@/app/admin/(shell)/navigacija/[handle]/page";
import { linkPlacesText, unavailableFeaturedText, unavailableLinksText } from "@/components/admin/ContentLinkWarning";
import { admin as copy } from "@/lib/copy";

/** The escaping renderToStaticMarkup applies to text. */
const html = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const bundleProduct = (active: boolean, stock = 100) => ({
  id: "p1", title: "Paket", slug: "paket", status: "ACTIVE",
  variants: [{ id: "v1", sku: "PAK", priceCents: 4990, maxCartQuantity: 1, stock }],
  bundle: { priceCents: 4990, active, items: [] },
  options: { variants: [] },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bundle editor on load", () => {
  it("names the places that still link to an inactive bundle, as it does after a save", async () => {
    mocks.loadBundle.mockResolvedValue(bundleProduct(false));
    mocks.contentLinksToProducts.mockResolvedValue(["header", "hero"]);
    const markup = renderToStaticMarkup(await AdminBundleEditorPage({ params: Promise.resolve({ id: "p1" }) }));
    expect(mocks.contentLinksToProducts).toHaveBeenCalledWith(["paket"]);
    expect(markup).toContain("data-content-link-warning");
    expect(markup).toContain(html(linkPlacesText(["header", "hero"])));
  });

  it("reads nothing and warns about nothing for an active bundle or an inactive one nothing links to", async () => {
    mocks.loadBundle.mockResolvedValue(bundleProduct(true));
    expect(renderToStaticMarkup(await AdminBundleEditorPage({ params: Promise.resolve({ id: "p1" }) }))).not.toContain("data-content-link-warning");
    expect(mocks.contentLinksToProducts).not.toHaveBeenCalled();

    mocks.loadBundle.mockResolvedValue(bundleProduct(false));
    mocks.contentLinksToProducts.mockResolvedValue([]);
    expect(renderToStaticMarkup(await AdminBundleEditorPage({ params: Promise.resolve({ id: "p1" }) }))).not.toContain("data-content-link-warning");
  });
});

describe("bundle editor: its own stock (QA 2026-10-03 T5-03)", () => {
  it("warns that a bundle at its own stock 0 stays sold out, and links to where it is set", async () => {
    mocks.loadBundle.mockResolvedValue(bundleProduct(true, 0));
    const markup = renderToStaticMarkup(await AdminBundleEditorPage({ params: Promise.resolve({ id: "p1" }) }));
    expect(markup).toContain("data-bundle-own-stock-zero");
    expect(markup).toContain("href=\"/admin/izdelki/p1\"");
    mocks.loadBundle.mockResolvedValue(bundleProduct(true, 100));
    expect(renderToStaticMarkup(await AdminBundleEditorPage({ params: Promise.resolve({ id: "p1" }) }))).not.toContain("data-bundle-own-stock-zero");
  });
});

describe("menu editor on load", () => {
  it("says a stored featured card for a product off sale blocks the next save, and a stored link is only hidden", async () => {
    mocks.loadMenu.mockResolvedValue({ handle: "header", title: "Glavni", items: [{ label: "TRGOVINA", href: "/trgovina", featured: ["ustna-voda"] }] });
    mocks.unavailableMenuLinks.mockResolvedValue({
      links: [{ href: "/izdelek/paket", reason: "bundleInactive" }],
      featured: [{ slug: "ustna-voda", reason: "hiddenDeal" }],
    });
    const markup = renderToStaticMarkup(await AdminMenuEditorPage({ params: Promise.resolve({ handle: "header" }) }));
    const featured = unavailableFeaturedText(copy.content.links.featured, [{ slug: "ustna-voda", reason: "hiddenDeal" }]);
    expect(featured).toContain(`ustna-voda (${copy.content.links.reasons.hiddenDeal})`);
    expect(featured).not.toContain("{slugs}");
    expect(markup).toContain(html(featured));
    expect(markup).toContain(html(unavailableLinksText(copy.content.links.menu, [{ href: "/izdelek/paket", reason: "bundleInactive" }])));
    // The featured card is not presented as a harmlessly hidden link.
    expect(markup).not.toContain("/izdelek/ustna-voda");
    expect(markup.match(/data-content-link-warning/g)).toHaveLength(2);
  });

  it("shows no warning for a menu whose links and cards all lead to products on sale", async () => {
    mocks.loadMenu.mockResolvedValue({ handle: "footer-trgovina", title: "Trgovina", items: [{ label: "Kontakt", href: "/kontakt" }] });
    mocks.unavailableMenuLinks.mockResolvedValue({ links: [], featured: [] });
    expect(renderToStaticMarkup(await AdminMenuEditorPage({ params: Promise.resolve({ handle: "footer-trgovina" }) }))).not.toContain("data-content-link-warning");
  });
});

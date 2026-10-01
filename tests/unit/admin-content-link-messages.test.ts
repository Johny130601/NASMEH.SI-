import * as React from "react";
import { describe, expect, it, vi } from "vitest";

/** QA 2026-09-30 v-a: the create form names its failing field, and the editors say which links the storefront leaves out. */

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/admin/(shell)/izdelki/actions", () => ({
  createProductAction: vi.fn(), saveLowStockAction: vi.fn(), sendRestockAlertsAction: vi.fn(), toggleCollectionProductAction: vi.fn(),
}));

import { productCreateError } from "@/components/admin/ProductPanels";
import { contentLinkPlaceLabel, linkPlacesText, unavailableLinksText } from "@/components/admin/ContentLinkWarning";
import { admin as copy } from "@/lib/copy";

describe("create form refusals", () => {
  it("marks the failing field with its rule instead of the generic message", () => {
    expect(productCreateError({ ok: false, error: "invalid", field: "slug" })).toEqual({ field: "slug", text: copy.catalog.products.newErrors.slug });
    expect(productCreateError({ ok: false, error: "invalid", field: "sku" })).toEqual({ field: "sku", text: copy.catalog.products.newErrors.sku });
    expect(productCreateError({ ok: false, error: "invalid", field: "priceCents" })).toEqual({ field: "priceCents", text: copy.catalog.products.newErrors.priceCents });
    expect(productCreateError({ ok: false, error: "invalid", field: "title" })).toEqual({ field: "title", text: copy.catalog.products.newErrors.title });
    expect(copy.catalog.products.newErrors.slug).toContain("vezaje");
  });

  it("marks a taken slug or SKU at its field and keeps the generic message without a field", () => {
    expect(productCreateError({ ok: false, error: "slugTaken" })).toEqual({ field: "slug", text: copy.catalog.editor.slugTaken });
    expect(productCreateError({ ok: false, error: "skuTaken" })).toEqual({ field: "sku", text: copy.catalog.editor.variants.skuTaken });
    expect(productCreateError({ ok: false, error: "invalid" })).toEqual({ field: null, text: copy.catalog.editor.invalid });
    // An editor-only field is not one of the create form's inputs.
    expect(productCreateError({ ok: false, error: "invalid", field: "faq" })).toEqual({ field: null, text: copy.catalog.editor.invalid });
  });
});

describe("unavailable-link warnings", () => {
  it("lists each link with the reason its page answers 404", () => {
    const text = unavailableLinksText(copy.content.links.menu, [
      { href: "/izdelek/ustna-voda", reason: "hiddenDeal" },
      { href: "/izdelek/paket-popolna-rutina", reason: "bundleInactive" },
    ]);
    expect(text).toContain(`/izdelek/ustna-voda (${copy.content.links.reasons.hiddenDeal}), /izdelek/paket-popolna-rutina (${copy.content.links.reasons.bundleInactive})`);
    expect(text).not.toContain("{links}");
  });

  it("names menus by their admin label and home blocks by theirs", () => {
    expect(contentLinkPlaceLabel("header")).toBe(copy.content.menus.handles.header);
    expect(contentLinkPlaceLabel("footer-trgovina")).toBe(copy.content.menus.handles["footer-trgovina"]);
    expect(contentLinkPlaceLabel("routineBanner")).toBe(copy.content.links.places.routineBanner);
    const text = linkPlacesText(["header", "hero", "marquee"]);
    expect(text).toContain(`${copy.content.menus.handles.header}, ${copy.content.links.places.hero}, ${copy.content.links.places.marquee}`);
    expect(text).not.toContain("{places}");
  });

  it("no longer calls the hidden deal flag a mere label", () => {
    expect(copy.catalog.editor.fields.hiddenDeal).not.toMatch(/samo oznaka|faza 8/);
    expect(copy.catalog.editor.fields.hiddenDealHint).toContain("404");
    expect(copy.content.menus.editor.featuredHint).toMatch(/skriti akcijski SKU/);
  });

  it("does not overstate it either: only menu, home and marquee links are hidden, text bodies are the operator's to check", () => {
    const hint = copy.catalog.editor.fields.hiddenDealHint;
    expect(hint).not.toMatch(/Povezave nanj trgovina skrije\./);
    expect(hint).toMatch(/v menijih, na domači strani in v oglasni vrstici/);
    expect(hint).toMatch(/besedilih strani, opisih izdelkov .*preverite sami/);
  });
});

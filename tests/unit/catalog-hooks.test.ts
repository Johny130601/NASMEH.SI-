import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  bundleSavingsFor,
  descriptionSummary,
  displayBadges,
  hasCaretClaim,
  lowStockUnits,
  plainTextFromHtml,
  toCatalogProduct,
} from "@/lib/catalog";
import { catalog, kosForm, lowStockLine } from "@/lib/copy/catalog";
import { trust } from "@/lib/copy/pdp";
import { cart } from "@/lib/copy/cart";

/**
 * UI motion + sales hooks (2026-09-16): every hook on a card is computed from
 * live data — the history-backed reduction, the bundle's component prices,
 * the real stock under the admin's threshold — never typed content.
 */

type Row = Parameters<typeof toCatalogProduct>[0];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "p1",
    slug: "izdelek",
    title: "Izdelek",
    badges: [{ label: "NOVO", style: "outline" }],
    customFields: { unitPrice: { quantity: 14, unit: "na uporabo" } },
    createdAt: new Date("2026-09-01T00:00:00Z"),
    soldOutBehavior: "NOTIFY",
    variants: [
      { id: "v1", sku: "SKU-1", priceCents: 3499, compareAtPriceCents: null, stock: 100, allowBackorder: false, backorderNote: null, maxCartQuantity: 5 },
    ],
    media: [
      { id: "m1", kind: "CARD", url: "/uploads/card.svg", alt: "Kartica", sortOrder: 0 },
      { id: "m2", kind: "GALLERY", url: "/uploads/card.svg", alt: "Galerija 0", sortOrder: 0 },
      { id: "m3", kind: "GALLERY", url: "/uploads/detail.svg", alt: "Galerija 1", sortOrder: 1 },
    ],
    bundle: null,
    ...overrides,
  } as unknown as Row;
}

const noRatings = new Map<string, { average: number; count: number }>();
const noReductions = new Map();

describe("lowStockUnits (the only source of a scarcity figure)", () => {
  it("states the real count while the stock is 1…threshold", () => {
    expect(lowStockUnits(3, 5)).toBe(3);
    expect(lowStockUnits(5, 5)).toBe(5);
    expect(lowStockUnits(1, 5)).toBe(1);
  });

  it("says nothing for a healthy stock, an empty stock or a switched-off threshold", () => {
    expect(lowStockUnits(6, 5)).toBeNull();
    expect(lowStockUnits(100, 5)).toBeNull();
    expect(lowStockUnits(0, 5)).toBeNull();
    expect(lowStockUnits(3, 0)).toBeNull();
    expect(lowStockUnits(Number.NaN, 5)).toBeNull();
  });
});

describe("Slovenian count forms", () => {
  it("declines kos through singular, dual, plural and the hundreds cycle (21–24 are plural in Slovenian)", () => {
    expect([0, 1, 2, 3, 4, 5, 11, 21, 22, 23, 25, 101, 102, 103, 105].map(kosForm)).toEqual([
      "kosov", "kos", "kosa", "kosi", "kosi", "kosov", "kosov", "kosov", "kosov", "kosov", "kosov", "kos", "kosa", "kosi", "kosov",
    ]);
  });

  it("renders the low-stock line with the right form and no invented words", () => {
    expect(lowStockLine(1)).toBe("Samo še 1 kos na zalogi");
    expect(lowStockLine(2)).toBe("Samo še 2 kosa na zalogi");
    expect(lowStockLine(3)).toBe("Samo še 3 kosi na zalogi");
    expect(catalog.card.lowStock).toBe(lowStockLine);
  });
});

describe("computed hook copy", () => {
  it("percent-off and bundle value lines carry the figures they are given", () => {
    expect(catalog.card.percentOff(20)).toBe("−20 %");
    expect(catalog.card.bundleValue("74,97 €", 33)).toBe("Vrednost 74,97 € · prihranite 33 %");
    expect(cart.toast.line(2, "19,99 €")).toBe("2 × 19,99 €");
    // the cap is per variant, so the notice for a full line never states a number
    expect(catalog.card.atCap).not.toMatch(/\d/);
  });

  it("trust row wording comes from the shipping Setting, with honest fallbacks", () => {
    expect(trust.delivery("2–4 delovne dni")).toBe("Dostava 2–4 delovne dni");
    expect(trust.delivery(null)).toBe("Dostava po Sloveniji");
    expect(trust.freeShipping("45,00 €")).toBe("Brezplačna dostava od 45,00 €");
    expect(trust.freeShipping(null)).toBe("Brezplačna dostava pri vseh naročilih");
    expect(trust.guaranteeHref).toBe("/garancija-vracila-denarja");
    // no delivery or threshold figure is typed into the copy itself (the guarantee's 30 days is the policy's name)
    expect(trust.delivery(null) + trust.freeShipping(null) + trust.securePayment + trust.securePaymentDetail + trust.label).not.toMatch(/\d/);
  });
});

describe("bundleSavingsFor (value math from the components' current prices, §6.6)", () => {
  it("returns the value, the saving and the whole percent when the bundle costs less", () => {
    expect(
      bundleSavingsFor({ items: [{ quantity: 1, variant: { priceCents: 3499 } }, { quantity: 1, variant: { priceCents: 1999 } }, { quantity: 1, variant: { priceCents: 1999 } }] }, 4999),
    ).toEqual({ valueCents: 7497, savingsCents: 2498, savingsPercent: 33 });
  });

  it("multiplies quantities and returns null for no bundle, no items or no saving", () => {
    // 998/3998 is 24,96 %: floored like the Omnibus percent, so a saving is never overstated.
    expect(bundleSavingsFor({ items: [{ quantity: 2, variant: { priceCents: 1999 } }] }, 3000)).toEqual({ valueCents: 3998, savingsCents: 998, savingsPercent: 24 });
    expect(bundleSavingsFor(null, 4999)).toBeNull();
    expect(bundleSavingsFor({ items: [] }, 4999)).toBeNull();
    expect(bundleSavingsFor({ items: [{ quantity: 1, variant: { priceCents: 2500 } }, { quantity: 1, variant: { priceCents: 2500 } }] }, 5000)).toBeNull();
  });

  it("stands down while an announced reduction is on the card (the strikethrough is the mandated display)", () => {
    const items = [{ quantity: 1, variant: { priceCents: 3499 } }, { quantity: 1, variant: { priceCents: 1999 } }];
    expect(bundleSavingsFor({ items }, 4999, { priorPriceCents: 5999, priceCents: 4999, percentOff: 16 })).toBeNull();
    expect(bundleSavingsFor({ items }, 4999, null)).not.toBeNull();
  });
});

describe("toCatalogProduct", () => {
  it("picks the card image and the first different gallery view for the hover cross-fade", () => {
    const product = toCatalogProduct(row(), noRatings, noReductions, 5)!;
    expect(product.imageUrl).toBe("/uploads/card.svg");
    expect(product.imageAlt).toBe("Kartica");
    expect(product.hoverImageUrl).toBe("/uploads/detail.svg");
    expect(product.lowStock).toBeNull();
    expect(product.bundleSavings).toBeNull();
    expect(product.unitPrice).toEqual({ quantity: 14, unit: "na uporabo" });
  });

  it("has no hover image when the gallery only repeats the card image", () => {
    const product = toCatalogProduct(
      row({ media: [{ id: "m1", kind: "CARD", url: "/uploads/card.svg", alt: "", sortOrder: 0 }, { id: "m2", kind: "GALLERY", url: "/uploads/card.svg", alt: "", sortOrder: 0 }] } as Partial<Row>),
      noRatings, noReductions, 5,
    )!;
    expect(product.hoverImageUrl).toBeNull();
  });

  it("shows the real low stock under the threshold and never for a sold-out or backorder variant", () => {
    const low = row({ variants: [{ id: "v1", sku: "S", priceCents: 1999, compareAtPriceCents: null, stock: 3, allowBackorder: false, backorderNote: null, maxCartQuantity: 5 }] } as Partial<Row>);
    expect(toCatalogProduct(low, noRatings, noReductions, 5)!.lowStock).toBe(3);
    expect(toCatalogProduct(low, noRatings, noReductions, 2)!.lowStock).toBeNull();

    const soldOut = row({ variants: [{ id: "v1", sku: "S", priceCents: 1999, compareAtPriceCents: null, stock: 0, allowBackorder: false, backorderNote: null, maxCartQuantity: 5 }] } as Partial<Row>);
    const sold = toCatalogProduct(soldOut, noRatings, noReductions, 5)!;
    expect(sold.soldOut).toBe(true);
    expect(sold.lowStock).toBeNull();

    const backorder = row({ variants: [{ id: "v1", sku: "S", priceCents: 1999, compareAtPriceCents: null, stock: 0, allowBackorder: true, backorderNote: "Pošljemo v 10 dneh", maxCartQuantity: 5 }] } as Partial<Row>);
    const back = toCatalogProduct(backorder, noRatings, noReductions, 5)!;
    expect(back.soldOut).toBe(false);
    expect(back.lowStock).toBeNull();
    expect(back.backorderNote).toBe("Pošljemo v 10 dneh");
  });

  it("carries the bundle's value math and flags it as a bundle", () => {
    const bundle = row({
      bundle: {
        id: "b1",
        priceCents: 4999,
        active: true,
        items: [
          { quantity: 1, variant: { priceCents: 3499, stock: 100, allowBackorder: false } },
          { quantity: 1, variant: { priceCents: 1999, stock: 100, allowBackorder: false } },
          { quantity: 1, variant: { priceCents: 1999, stock: 100, allowBackorder: false } },
        ],
      },
    } as Partial<Row>);
    const product = toCatalogProduct(bundle, noRatings, noReductions, 5)!;
    expect(product.isBundle).toBe(true);
    // measured against the price on the card (the variant, 34,99 €) — never Bundle.priceCents, which nobody pays here
    expect(product.bundleSavings).toEqual({ valueCents: 7497, savingsCents: 3998, savingsPercent: 53 });
  });

  it("keeps the reduction (the −X % pill and strikethrough) on the Omnibus gate only", () => {
    const reductions = new Map([["v1", { priorPriceCents: 2499, priceCents: 1999, percentOff: 20 }]]);
    expect(toCatalogProduct(row(), noRatings, reductions, 5)!.reduction).toEqual({ priorPriceCents: 2499, priceCents: 1999, percentOff: 20 });
    expect(toCatalogProduct(row(), noRatings, noReductions, 5)!.reduction).toBeNull();
  });
});

describe("a bundle card states its components' availability (QA M6)", () => {
  const bundleRow = (serumStock: number, rowStock = 100) =>
    row({
      variants: [{ id: "v9", sku: "PAK", priceCents: 4999, compareAtPriceCents: null, stock: rowStock, allowBackorder: false, backorderNote: null, maxCartQuantity: 1 }],
      bundle: {
        id: "b1",
        priceCents: 4999,
        active: true,
        items: [
          { quantity: 1, variant: { priceCents: 3499, stock: 40, allowBackorder: false } },
          { quantity: 2, variant: { priceCents: 1999, stock: serumStock, allowBackorder: false } },
        ],
      },
    } as Partial<Row>);

  it("is sold out as soon as one component cannot fill it, whatever its own row says", () => {
    const card = toCatalogProduct(bundleRow(1), noRatings, noReductions, 5)!;
    expect(card.soldOut).toBe(true);
    expect(card.stock).toBe(0);
    expect(card.lowStock).toBeNull();
  });

  it("is sold out when only the bundle's own row is out, and a plain product at zero is too", () => {
    // a sold-out card offers "Obvestite me" either way: a component's restock re-arms the bundle's
    // subscriptions (lib/inventory/stock armBundleAlerts), an admin restock of the row arms its own
    expect(toCatalogProduct(bundleRow(6, 0), noRatings, noReductions, 5)!.soldOut).toBe(true);
    const soldOutPlain = row({ variants: [{ id: "v1", sku: "S", priceCents: 1999, compareAtPriceCents: null, stock: 0, allowBackorder: false, backorderNote: null, maxCartQuantity: 5 }] } as Partial<Row>);
    expect(toCatalogProduct(soldOutPlain, noRatings, noReductions, 5)!.soldOut).toBe(true);
  });

  it("states the bundles the components can fill, low-stock line included", () => {
    const card = toCatalogProduct(bundleRow(6), noRatings, noReductions, 5)!;
    expect(card.soldOut).toBe(false);
    expect(card.stock).toBe(3);
    expect(card.lowStock).toBe(3);
    expect(toCatalogProduct(bundleRow(200), noRatings, noReductions, 5)!.stock).toBe(40);
  });
});

describe("admin badges never repeat or contradict the sold-out state (QA T1-13, T6-09)", () => {
  it("drops an admin badge that says sold out, in any case", () => {
    expect(
      displayBadges([
        { label: "NOVO", style: "outline" },
        { label: "RAZPRODANO", style: "grey" },
        { label: " razprodano ", style: "grey" },
      ]),
    ).toEqual([{ label: "NOVO", style: "outline" }]);
  });

  it("keeps the card's badges free of it, so a restocked product never reads sold out", () => {
    const restocked = row({ badges: [{ label: "RAZPRODANO", style: "grey" }, { label: "NOVO", style: "outline" }] } as Partial<Row>);
    const card = toCatalogProduct(restocked, noRatings, noReductions, 5)!;
    expect(card.soldOut).toBe(false);
    expect(card.badges).toEqual([{ label: "NOVO", style: "outline" }]);
  });
});

describe("operator HTML as plain text (meta, JSON-LD, search — QA T6-07)", () => {
  it("drops tags, scripts and styles, decodes entities and collapses whitespace", () => {
    expect(plainTextFromHtml("<p>QA opis z <mark>oznako</mark></p>\n<ul><li>ena</li><li>dva</li></ul>")).toBe("QA opis z oznako ena dva");
    expect(plainTextFromHtml("<script>alert(1)</script><style>p{}</style>Besedilo")).toBe("Besedilo");
    expect(plainTextFromHtml("Cena &lt;30&gt; &amp; več&nbsp;&#8364; &#x2014; &quot;x&quot;")).toBe("Cena <30> & več € — \"x\"");
    expect(plainTextFromHtml("")).toBe("");
  });

  it("summarises a long description at a word boundary", () => {
    const long = `<p>${"beseda ".repeat(40)}</p>`;
    const summary = descriptionSummary(long, 50);
    expect(summary.endsWith("…")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(51);
    expect(summary).not.toContain("<");
    expect(descriptionSummary("<p>Kratek opis.</p>")).toBe("Kratek opis.");
  });
});

describe("the guarantee caret follows a real ^ claim on the page (QA T1-14)", () => {
  const product = (overrides: Partial<Parameters<typeof hasCaretClaim>[0]> = {}) => ({
    title: "Ustna voda",
    description: "<p>Svež dah.</p>",
    customFields: { intro: "Uvod", bullets: ["Brez alkohola"], uspChips: ["Vegansko"] },
    accordions: { howItWorks: "<p>Izperite 30 s.</p>", guarantee: "<p>^ Velja 30 dni.</p>" },
    faq: [{ q: "Kako?", a: "Tako." }],
    education: [{ heading: "Zakaj", body: "Ker." }],
    ...overrides,
  });

  it("finds no claim when only the guarantee's own resolution carries the caret", () => {
    expect(hasCaretClaim(product())).toBe(false);
  });

  it("finds a caret in the description, customFields text, other accordions, FAQ or education", () => {
    expect(hasCaretClaim(product({ description: "<p>Belejši zobje v 7 dneh^</p>" }))).toBe(true);
    expect(hasCaretClaim(product({ description: "<p>Rezultat&#94;</p>" }))).toBe(true);
    expect(hasCaretClaim(product({ customFields: { bullets: ["Zadovoljstvo zajamčeno^"] } }))).toBe(true);
    expect(hasCaretClaim(product({ accordions: { tested: "<p>Klinično testirano^</p>" } }))).toBe(true);
    expect(hasCaretClaim(product({ faq: [{ q: "Ali deluje?", a: "Da^" }] }))).toBe(true);
    expect(hasCaretClaim(product({ education: [{ heading: "Rezultati^", body: "" }] }))).toBe(true);
  });

  it("ignores keys and handles that are not text on the page", () => {
    expect(hasCaretClaim(product({ customFields: { crossSell: ["serum^"] } }))).toBe(false);
  });
});

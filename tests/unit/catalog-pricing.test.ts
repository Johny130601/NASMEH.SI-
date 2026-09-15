import { describe, expect, it } from "vitest";
import { cart } from "@/lib/copy/cart";
import { pdp } from "@/lib/copy/pdp";
import {
  bundleSavings,
  formatEUR,
  formatUnitPrice,
  klarnaInstallmentCents,
  OMNIBUS_ANNOUNCEMENT_GRACE_HOURS,
  omnibusPriorPriceCents,
  priceReduction,
  standardShippingMethod,
  unitPriceCents,
  type PriceHistoryPoint,
} from "@/lib/pricing";

const NOW = new Date("2026-09-09T12:00:00Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const daysLater = (days: number) => new Date(NOW.getTime() + days * DAY);
/** a history row; `compareAt` set above the price = reduction announced */
const row = (priceCents: number, days: number, compareAt: number | null = null): PriceHistoryPoint => ({
  priceCents,
  compareAtPriceCents: compareAt,
  createdAt: daysAgo(days),
});

describe("omnibusPriorPriceCents (Omnibus prior price, §9.2)", () => {
  it("no history → null (no line)", () => {
    expect(omnibusPriorPriceCents([], NOW)).toBeNull();
  });

  it("single row (only current price) → null", () => {
    expect(omnibusPriorPriceCents([row(1999, 1, 2499)], NOW)).toBeNull();
  });

  it("price stable since June and cut today → the June price (in force at the window start)", () => {
    expect(omnibusPriorPriceCents([row(2999, 100), row(1999, 0, 2999)], NOW)).toBe(2999);
  });

  it("24,99 € 45 days ago, 29,99 € 10 days ago, 19,99 € today → 24,99 € (the true lowest)", () => {
    expect(
      omnibusPriorPriceCents([row(2499, 45), row(2999, 10), row(1999, 0, 2999)], NOW),
    ).toBe(2499);
  });

  it("reduction started 10 days ago → window is the 30 days before that start", () => {
    // window [-40 d, -10 d): 2999 still in force at -40 d, then 2299, then 2499
    const history = [row(2999, 100), row(2299, 25), row(2499, 15), row(1999, 10, 2999)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2299);
  });

  it("a price replaced exactly at the window start does not count", () => {
    // window [-40 d, -10 d): 2999 ended at -40 d
    expect(
      omnibusPriorPriceCents([row(2999, 100), row(2499, 40), row(1999, 10, 2499)], NOW),
    ).toBe(2499);
  });

  it("a reduction still running after 40 days keeps the same prior price", () => {
    const history = [row(2499, 100), row(1999, 40, 2499)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2499);
    expect(omnibusPriorPriceCents(history, daysLater(60))).toBe(2499);
  });

  it("compare-at-only rows after the reduction neither restart it nor pose as the prior price", () => {
    const history = [row(2499, 100), row(1999, 5, 2499), row(1999, 1, 2999)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2499);
  });

  it("the seed's repeated 24,99 € rows merge into one period", () => {
    expect(
      omnibusPriorPriceCents([row(2499, 40), row(2499, 10), row(1999, 1, 2499)], NOW),
    ).toBe(2499);
  });

  it("progressive reduction 30,00 → 25,00 → 20,00 € (unbroken, announced) → 30,00 €", () => {
    const history = [row(3000, 50), row(2500, 20, 3000), row(2000, 5, 3000)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(3000);
  });

  it("a compare-at-only edit inside a progressive run does not break it", () => {
    const history = [row(3000, 50), row(2500, 20, 3000), row(2500, 15, 3500), row(2000, 5, 3500)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(3000);
  });

  it("an announcement switched off between two steps breaks the progressive run", () => {
    // 25,00 € lost its compare-at at -10 d → run starts at 20,00 € (-5 d); window [-35 d, -5 d)
    const history = [row(3000, 50), row(2500, 20, 3000), row(2500, 10), row(2000, 5, 3000)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2500);
  });

  it("a plain price cut before the announced reduction is not part of the run", () => {
    const history = [row(3000, 50), row(2500, 20), row(2000, 5, 3000)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2500);
  });

  it("a price increase breaks a progressive run", () => {
    // run starts at 2500 (-20 d); window [-50 d, -20 d) saw 3000 and 2000
    const history = [row(3000, 60), row(2000, 40, 3000), row(2500, 20, 3000), row(2000, 5, 3000)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2000);
  });

  it("less than 30 days of history → lowest over what exists", () => {
    expect(omnibusPriorPriceCents([row(2499, 12), row(1999, 2, 2499)], NOW)).toBe(2499);
  });

  it("rows created after `now` are not in force yet", () => {
    const history = [row(2499, 60), row(1999, 10, 2499), { priceCents: 1499, compareAtPriceCents: 2499, createdAt: daysLater(2) }];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2499);
  });
});

describe("priceReduction (the one strikethrough gate)", () => {
  const serum = { priceCents: 1999, compareAtPriceCents: 2499 };

  it("struck and 30-day figures come from the history, not from the free compare-at", () => {
    expect(
      priceReduction({ priceCents: 1999, compareAtPriceCents: 3999 }, [row(2499, 60), row(1999, 10, 3999)], NOW),
    ).toEqual({ priorPriceCents: 2499, priceCents: 1999, percentOff: 20 });
  });

  it("no announcement (compare-at null or not above the price) → plain price", () => {
    const history = [row(2499, 60), row(1999, 10)];
    expect(priceReduction({ priceCents: 1999, compareAtPriceCents: null }, history, NOW)).toBeNull();
    expect(priceReduction({ priceCents: 1999, compareAtPriceCents: 1999 }, history, NOW)).toBeNull();
  });

  it("variant created with a compare-at (single history row) → no strikethrough", () => {
    expect(priceReduction(serum, [row(1999, 3, 2499)], NOW)).toBeNull();
  });

  it("no history at all → no strikethrough", () => {
    expect(priceReduction(serum, [], NOW)).toBeNull();
  });

  it("prior price not above the current price (raised, then 'reduced' back) → no strikethrough", () => {
    expect(priceReduction(serum, [row(1999, 60), row(2499, 20), row(1999, 1, 2499)], NOW)).toBeNull();
  });

  it("compare-at switched on at an unchanged price is not a reduction", () => {
    expect(priceReduction(serum, [row(1999, 100), row(1999, 1, 2499)], NOW)).toBeNull();
  });

  it("price and compare-at in one save → window anchored at the cut", () => {
    expect(priceReduction(serum, [row(2499, 100), row(1999, 2, 2499)], NOW)).toEqual({
      priorPriceCents: 2499,
      priceCents: 1999,
      percentOff: 20,
    });
  });

  it("compare-at added in a second save a minute after the price cut → window anchored at the cut", () => {
    // 24,99 € since -100 d; cut to 19,99 € at -2 d; compare-at added one minute later
    const history = [row(2499, 100), row(1999, 2), { ...row(1999, 2, 2499), createdAt: new Date(daysAgo(2).getTime() + MINUTE) }];
    expect(priceReduction(serum, history, NOW)).toEqual({ priorPriceCents: 2499, priceCents: 1999, percentOff: 20 });
  });

  it(`the grace period is ${OMNIBUS_ANNOUNCEMENT_GRACE_HOURS} h: at the limit the cut still counts, a minute later it does not`, () => {
    const cut = daysAgo(5).getTime();
    const announcedAfter = (ms: number) => [
      row(2499, 100),
      row(1999, 5),
      { priceCents: 1999, compareAtPriceCents: 2499, createdAt: new Date(cut + ms) },
    ];
    const grace = OMNIBUS_ANNOUNCEMENT_GRACE_HOURS * HOUR;
    expect(priceReduction(serum, announcedAfter(grace), NOW)?.priorPriceCents).toBe(2499);
    expect(priceReduction(serum, announcedAfter(grace + MINUTE), NOW)).toBeNull();
  });

  it("finding case 1: plain cut 200 days ago, compare-at switched on today → no invented prior price", () => {
    const history = [row(2499, 400), row(1999, 200), row(1999, 0, 2499)];
    expect(priceReduction(serum, history, NOW)).toBeNull();
    // the window is anchored at the announcement, where only 19,99 € applied
    expect(omnibusPriorPriceCents(history, NOW)).toBe(1999);
  });

  it("finding case 2: sale ended by clearing the compare-at, switched on again later → a new announcement, no reduction", () => {
    const sale = { priceCents: 2500, compareAtPriceCents: 3000 };
    const history = [row(3000, 400), row(2500, 180, 3000), row(2500, 170), row(2500, 0, 3000)];
    expect(priceReduction(sale, history, NOW)).toBeNull();
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2500);
  });

  it("finding case 3: an off row in the middle of a segment breaks the progressive run", () => {
    // 25,00 € announced at -80 d, switched off at -75 d (regular price), on again at -2 d, 20,00 € at -1 d
    const history = [row(3000, 100), row(2500, 80, 3000), row(2500, 75), row(2500, 2, 3000), row(2000, 1, 3000)];
    expect(priceReduction({ priceCents: 2000, compareAtPriceCents: 3000 }, history, NOW)).toEqual({
      priorPriceCents: 2500,
      priceCents: 2000,
      percentOff: 20,
    });
  });

  it("switched off and on again inside the grace period still counts from the cut", () => {
    const cut = daysAgo(5).getTime();
    const history = [
      row(2499, 100),
      row(1999, 5, 2499),
      { priceCents: 1999, compareAtPriceCents: null, createdAt: new Date(cut + HOUR) },
      { priceCents: 1999, compareAtPriceCents: 2499, createdAt: new Date(cut + 2 * HOUR) },
    ];
    expect(priceReduction(serum, history, NOW)?.priorPriceCents).toBe(2499);
  });

  it("a progressive step whose compare-at followed a minute later continues the run", () => {
    const step = daysAgo(5).getTime();
    const history = [
      row(3000, 50),
      row(2500, 20, 3000),
      { priceCents: 2000, compareAtPriceCents: null, createdAt: new Date(step) },
      { priceCents: 2000, compareAtPriceCents: 3000, createdAt: new Date(step + MINUTE) },
    ];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(3000);
  });

  it("a progressive step down onto a price announced late does not reach back past the late announcement", () => {
    // 25,00 € plain since -60 d, announced only at -10 d, then 20,00 € at -5 d: run stops at 20,00 €
    const history = [row(3000, 100), row(2500, 60), row(2500, 10, 3000), row(2000, 5, 3000)];
    expect(omnibusPriorPriceCents(history, NOW)).toBe(2500);
  });

  it("history that does not end at the live price cannot vouch for it", () => {
    expect(priceReduction({ priceCents: 1799, compareAtPriceCents: 2499 }, [row(2499, 60), row(1999, 10, 2499)], NOW)).toBeNull();
  });

  it("history whose latest row carries no announcement cannot vouch for the variant's compare-at", () => {
    // compare-at written to the variant outside lib/price-history
    expect(priceReduction(serum, [row(2499, 60), row(1999, 10)], NOW)).toBeNull();
  });

  it("percentOff is rounded down so it is never overstated", () => {
    // 10,19 / 30,00 = 33,97 % → 33
    expect(priceReduction({ priceCents: 1981, compareAtPriceCents: 3000 }, [row(3000, 60), row(1981, 5, 3000)], NOW)?.percentOff).toBe(33);
  });

  it("reduction started 10 days ago stays identical on day 40 of the sale", () => {
    const history = [row(2499, 100), row(1999, 10, 2499)];
    expect(priceReduction(serum, history, NOW)).toEqual(priceReduction(serum, history, daysLater(30)));
    expect(priceReduction(serum, history, daysLater(30))?.priorPriceCents).toBe(2499);
  });
});

describe("unit price anchor", () => {
  it("€34.99 / 14 uses → 250 cents → '2,50 € na uporabo'", () => {
    expect(unitPriceCents(3499, 14)).toBe(250);
    // formatEUR uses NBSP before € (sl-SI) — normalize whitespace for the check
    expect(formatUnitPrice(3499, 14, "na uporabo").replace(/\u00A0/g, " ")).toBe("2,50 € na uporabo");
  });

  it("rejects invalid quantities", () => {
    expect(() => unitPriceCents(3499, 0)).toThrow(RangeError);
    expect(() => unitPriceCents(3499, 2.5)).toThrow(RangeError);
  });
});

describe("Omnibus line wording", () => {
  it("uses the statutory framing on cards/PDP and in the cart (the reference is fixed while a reduction runs)", () => {
    for (const prefix of [pdp.buyBox.omnibusPrefix, cart.line.omnibusPrefix]) {
      expect(prefix).toBe("Najnižja cena v 30 dneh pred znižanjem");
      expect(prefix).not.toContain("zadnjih");
    }
  });
});

describe("PDP delivery copy from the shipping Setting", () => {
  const METHODS = [
    { id: "ps-express", priceCents: 690, estimate: "1–2 delovna dneva", countries: ["SI"] },
    { id: "ps-standard", priceCents: 390, estimate: "2–4 delovna dneva", countries: ["SI"] },
    { id: "eu", priceCents: 290, estimate: "5–7 delovnih dni", countries: ["AT", "HR"] },
  ];

  it("picks the Slovenian method charged at the cart's standard cost", () => {
    expect(standardShippingMethod(METHODS, 390)?.id).toBe("ps-standard");
  });

  it("falls back to the cheapest Slovenian method, and to null when none ships to SI", () => {
    expect(standardShippingMethod(METHODS, 450)?.id).toBe("ps-standard");
    expect(standardShippingMethod([METHODS[2]], 290)).toBeNull();
  });

  it("renders the configured estimate and threshold instead of fixed figures", () => {
    const text = pdp.delivery.shipping({ estimate: "1–3 delovne dni", freeThreshold: formatEUR(6000) });
    expect(text.replace(/ /g, " ")).toBe(
      "Predviden rok dostave po Sloveniji: 1–3 delovne dni. Brezplačna dostava pri naročilih od 60,00 €.",
    );
    expect(text).not.toContain("2–4");
    expect(text).not.toContain("45");
  });

  it("no estimate configured and no threshold (every order ships free) → no invented figures", () => {
    expect(pdp.delivery.shipping({ estimate: null, freeThreshold: null })).toBe(
      "Dostavljamo po Sloveniji. Dostava je brezplačna pri vseh naročilih.",
    );
  });

  it("the returns part carries no shipping figures", () => {
    expect(pdp.delivery.body).not.toMatch(/delovnih dneh|€/);
  });
});

describe("klarnaInstallmentCents", () => {
  it("3499 → 1166 (spec example '3 obroka po 11,66 €')", () => {
    expect(klarnaInstallmentCents(3499)).toBe(1166);
  });
});

describe("bundleSavings", () => {
  it("computes value/savings/percent from live component prices", () => {
    const result = bundleSavings([3499, 1999, 1999], 4999);
    expect(result).toEqual({
      valueCents: 7497,
      savingsCents: 2498,
      savingsPercent: 33,
    });
  });

  it("no saving → zeros", () => {
    expect(bundleSavings([1000, 1000], 2500)).toEqual({
      valueCents: 2000,
      savingsCents: 0,
      savingsPercent: 0,
    });
  });
});

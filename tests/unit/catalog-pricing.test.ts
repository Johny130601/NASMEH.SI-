import { describe, expect, it } from "vitest";
import {
  bundleSavings,
  formatUnitPrice,
  klarnaInstallmentCents,
  lowestPriceInLast30Days,
  unitPriceCents,
} from "@/lib/pricing";

const NOW = new Date("2026-09-09T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("lowestPriceInLast30Days (Omnibus, §9.2)", () => {
  it("no history → null (no line)", () => {
    expect(lowestPriceInLast30Days([], NOW)).toBeNull();
  });

  it("single row (only current price) → null", () => {
    expect(
      lowestPriceInLast30Days(
        [{ priceCents: 1999, createdAt: daysAgo(1) }],
        NOW,
      ),
    ).toBeNull();
  });

  it("discount with 30-day-low → exact lowest prior price", () => {
    const history = [
      { priceCents: 2499, createdAt: daysAgo(40) }, // outside window
      { priceCents: 2499, createdAt: daysAgo(10) }, // inside window
      { priceCents: 1999, createdAt: daysAgo(1) }, // latest = current
    ];
    expect(lowestPriceInLast30Days(history, NOW)).toBe(2499);
  });

  it("picks the MINIMUM prior price within the window", () => {
    const history = [
      { priceCents: 2999, createdAt: daysAgo(20) },
      { priceCents: 2299, createdAt: daysAgo(5) },
      { priceCents: 1999, createdAt: daysAgo(1) },
    ];
    expect(lowestPriceInLast30Days(history, NOW)).toBe(2299);
  });

  it("prices older than 30 days are excluded → null when nothing recent", () => {
    const history = [
      { priceCents: 2499, createdAt: daysAgo(45) },
      { priceCents: 1999, createdAt: daysAgo(31) },
    ];
    // latest (current) is 31 days old, the only prior row is 45 days old
    expect(lowestPriceInLast30Days(history, NOW)).toBeNull();
  });

  it("ignores the latest row even if it is the lowest", () => {
    const history = [
      { priceCents: 2999, createdAt: daysAgo(10) },
      { priceCents: 1499, createdAt: daysAgo(0) },
    ];
    expect(lowestPriceInLast30Days(history, NOW)).toBe(2999);
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

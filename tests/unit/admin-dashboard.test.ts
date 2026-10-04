import { describe, expect, it } from "vitest";
import { buildBuckets, parseDashboardRange, summarisePaidOrders, type PaidOrderFacts } from "@/lib/admin/dashboard";
import { chartTicks, fitLabel } from "@/components/admin/BarChart";

const now = new Date(2026, 8, 10, 15, 30); // 10 September 2026, local time

describe("dashboard range", () => {
  it("defaults to the last 30 days with daily buckets", () => {
    const range = parseDashboardRange({}, now);
    expect(range.preset).toBe("30d");
    expect(range.days).toBe(30);
    expect(range.bucket).toBe("day");
    expect(range.from).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
    expect(range.to).toEqual(new Date(2026, 8, 10, 23, 59, 59, 999));
    expect(buildBuckets(range)).toHaveLength(30);
  });

  it("uses weekly buckets for 90 days and honours a valid custom span", () => {
    expect(parseDashboardRange({ obdobje: "90d" }, now)).toMatchObject({ preset: "90d", days: 90, bucket: "week" });
    const custom = parseDashboardRange({ obdobje: "custom", od: "2026-09-01", do: "2026-09-03" }, now);
    expect(custom).toMatchObject({ preset: "custom", days: 3, bucket: "day" });
    expect(buildBuckets(custom).map((bucket) => bucket.label)).toEqual(["1. 9.", "2. 9.", "3. 9."]);
  });

  it("falls back to 30 days for reversed, malformed or oversized custom ranges", () => {
    for (const query of [
      { obdobje: "custom", od: "2026-09-05", do: "2026-09-01" },
      { obdobje: "custom", od: "2026-02-30", do: "2026-09-01" },
      { obdobje: "custom", od: "2025-01-01", do: "2026-09-01" },
      { obdobje: "custom" },
      { obdobje: "nonsense" },
    ]) {
      expect(parseDashboardRange(query, now)).toMatchObject({ preset: "30d", days: 30 });
    }
  });

  it("says why a custom range was not used (QA N1)", () => {
    expect(parseDashboardRange({ obdobje: "custom", od: "2026-09-05", do: "2026-09-01" }, now).invalid).toBe("reversed");
    expect(parseDashboardRange({ obdobje: "custom", od: "2026-02-30", do: "2026-09-01" }, now).invalid).toBe("malformed");
    expect(parseDashboardRange({ obdobje: "custom" }, now).invalid).toBe("malformed");
    expect(parseDashboardRange({ obdobje: "custom", od: "2025-01-01", do: "2026-09-01" }, now).invalid).toBe("too_long");
    expect(parseDashboardRange({ obdobje: "custom", od: "2026-09-01", do: "2026-09-03" }, now)).not.toHaveProperty("invalid");
    expect(parseDashboardRange({ obdobje: "7d" }, now)).not.toHaveProperty("invalid");
  });

  it("starts weekly buckets on Monday", () => {
    const range = parseDashboardRange({ obdobje: "custom", od: "2026-09-01", do: "2026-10-15" }, now);
    const buckets = buildBuckets(range);
    expect(range.bucket).toBe("week");
    expect(new Date(buckets[0].key).getDay()).toBe(1);
    expect(buckets[0].label).toBe("31. 8.");
  });
});

/**
 * QA 2026-10-03 T4-02: the orders paid on the ops QA server (nasmeh_qa2_ops), with their totals,
 * refundedCents and COMPLETED Refund rows as stored. The old dashboard dropped every CANCELLED
 * order, so the cancelled paid bundle order (49,99 € refunded) vanished from every KPI: "Vrnjeno"
 * showed 43,88 € against 93,87 € of completed refunds.
 */
describe("dashboard KPIs over the orders paid in the range (QA 2026-10-03 T4-02)", () => {
  const today = new Date(2026, 9, 3, 15, 0);
  const paid = new Date(2026, 9, 3, 13, 20);
  const range = parseDashboardRange({}, today);
  const STRIPS = "Belilni trakci za zobe (14 uporab)";
  const RINSE = "Ustna voda za globinsko čiščenje";
  const SERUM = "Serum korektor barve zob";
  const BUNDLE = "Paket popolna rutina";
  const TRAVEL = "Belilni trakci — potovalno pakiranje (7 uporab)";
  const order = (totalCents: number, refundedCents: number, items: Array<[string, string, number, number]>, refundLines: Array<Array<[string, number]>> = []): PaidOrderFacts => ({
    paidAt: paid, totalCents, refundedCents,
    items: items.map(([id, title, quantity, unitPriceCents]) => ({ id, title, quantity, unitPriceCents })),
    refunds: refundLines.map((lines) => ({ lines: lines.map(([orderItemId, quantity]) => ({ orderItemId, quantity })) })),
  });
  // At the tester's dashboard check: NS-00001…00007 (NS-00003 was never paid, so the query never returns it).
  const atCheck = [
    order(6998, 0, [["o1", STRIPS, 2, 3499]]),
    order(4388, 4388, [["o2a", RINSE, 1, 1999], ["o2b", SERUM, 1, 1999]], [[["o2a", 1]], [["o2b", 1]]]), // REFUNDED: 19,99 €, then 23,89 € incl. shipping
    order(2389, 0, [["o4", SERUM, 1, 1999]]),
    order(2389, 0, [["o5", RINSE, 1, 1999]]),
    order(3889, 0, [["o6", STRIPS, 1, 3499]]),
    order(4999, 4999, [["o7", BUNDLE, 1, 4999]], [[["o7", 1]]]), // paid, then cancelled by staff: refunded in full
  ];
  // Later: a 5,00 € goodwill refund on NS-00001 (money only, no lines) and the settled stock-out NS-00008.
  const later = [
    { ...atCheck[0], refundedCents: 500, refunds: [{ lines: [] }] },
    ...atCheck.slice(1),
    order(2389, 2389, [["o8", TRAVEL, 1, 1999]], [[["o8", 1]]]),
  ];

  it("keeps a cancelled paid order: its refund counts in Vrnjeno, its order among the paid ones", () => {
    const { kpis } = summarisePaidOrders(atCheck, range);
    expect(kpis).toEqual({
      orders: 6, grossCents: 25052, refundedCents: 9387, revenueCents: 15665,
      aovCents: Math.round(25052 / 6), itemsPerOrder: 1.3,
    });
    // Vrnjeno equals the completed refunds at that moment: 19,99 + 23,89 + 49,99 = 93,87 €.
    expect(kpis.refundedCents).toBe(1999 + 2389 + 4999);
  });

  it("matches every completed refund, money-only and stock-out settlements included, and nets revenue on the tile", () => {
    const { kpis, revenueSeries, ordersSeries } = summarisePaidOrders(later, range);
    // The five COMPLETED Refund rows on the server: 5,00 + 19,99 + 23,89 + 49,99 + 23,89 = 122,76 €.
    expect(kpis.refundedCents).toBe(500 + 1999 + 2389 + 4999 + 2389);
    expect(kpis).toMatchObject({ orders: 7, grossCents: 27441, revenueCents: 27441 - 12276, aovCents: 3920, itemsPerOrder: 1.3 });
    // The series are the same cohort: their bars add up to the tiles.
    expect(revenueSeries.reduce((sum, point) => sum + point.value, 0)).toBe(kpis.revenueCents);
    expect(ordersSeries.reduce((sum, point) => sum + point.value, 0)).toBe(kpis.orders);
  });

  it("charts product revenue without the units that went back", () => {
    const { revenueByProduct } = summarisePaidOrders(later, range);
    // The money-only refund on NS-00001 names no unit: both its strips stay, beside NS-00006's.
    expect(revenueByProduct[0]).toEqual({ label: STRIPS, value: 3 * 3499 });
    // One rinse and one serum went back with NS-00002; the other order of each stays. The cancelled
    // bundle and the settled stock-out kept nothing, so they are not charted at all.
    expect(revenueByProduct).toHaveLength(3);
    expect(revenueByProduct).toEqual(expect.arrayContaining([{ label: RINSE, value: 1999 }, { label: SERUM, value: 1999 }]));
  });

  it("takes out every unit of an order refunded in full without Refund rows (a refund in the provider's dashboard)", () => {
    const providerSide = order(3889, 3889, [["p1", STRIPS, 1, 3499]]);
    const partial = order(6998, 3499, [["p2", STRIPS, 2, 3499]], [[["p2", 1]]]);
    const result = summarisePaidOrders([providerSide, partial], range);
    expect(result.revenueByProduct).toEqual([{ label: STRIPS, value: 3499 }]);
    expect(result.kpis).toMatchObject({ orders: 2, grossCents: 10887, refundedCents: 7388, revenueCents: 3499 });
  });

  it("counts a captured payment still awaiting its refund in full until the refund completes", () => {
    const owed = order(2389, 0, [["s1", TRAVEL, 1, 1999]]);
    expect(summarisePaidOrders([owed], range).kpis).toMatchObject({ orders: 1, grossCents: 2389, refundedCents: 0, revenueCents: 2389 });
  });

  it("reports zeros for a range without paid orders", () => {
    const empty = summarisePaidOrders([], range);
    expect(empty.kpis).toEqual({ orders: 0, grossCents: 0, refundedCents: 0, revenueCents: 0, aovCents: 0, itemsPerOrder: 0 });
    expect(empty.revenueByProduct).toEqual([]);
    expect(empty.revenueSeries).toHaveLength(30);
  });
});

describe("chart ticks", () => {
  it("produces clean, rounded tick values that cover the maximum", () => {
    expect(chartTicks(0)).toEqual([0]);
    expect(chartTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(chartTicks(123456)).toEqual([0, 50000, 100000, 150000]);
    expect(chartTicks(3)).toEqual([0, 1, 2, 3]);
  });

  it("cuts an x-axis label to the width it owns so neighbours never overlap (QA T5-02)", () => {
    expect(fitLabel("12. 9.", 70)).toBe("12. 9.");
    const cut = fitLabel("Serum korektor barve zob", 90);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(Math.floor(90 / 6.4));
    expect(fitLabel("Beljenje", 4).length).toBe(3);
  });
});

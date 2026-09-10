import { describe, expect, it } from "vitest";
import { buildBuckets, parseDashboardRange } from "@/lib/admin/dashboard";
import { chartTicks } from "@/components/admin/BarChart";

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

  it("starts weekly buckets on Monday", () => {
    const range = parseDashboardRange({ obdobje: "custom", od: "2026-09-01", do: "2026-10-15" }, now);
    const buckets = buildBuckets(range);
    expect(range.bucket).toBe("week");
    expect(new Date(buckets[0].key).getDay()).toBe(1);
    expect(buckets[0].label).toBe("31. 8.");
  });
});

describe("chart ticks", () => {
  it("produces clean, rounded tick values that cover the maximum", () => {
    expect(chartTicks(0)).toEqual([0]);
    expect(chartTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(chartTicks(123456)).toEqual([0, 50000, 100000, 150000]);
    expect(chartTicks(3)).toEqual([0, 1, 2, 3]);
  });
});

import { describe, expect, it } from "vitest";
import { aggregateRatings, formatAverage } from "@/lib/reviews/aggregate";

describe("aggregateRatings (§10)", () => {
  it("empty → zeros", () => {
    expect(aggregateRatings([])).toEqual({
      count: 0,
      average: 0,
      distribution: [0, 0, 0, 0, 0],
      percentDistribution: [0, 0, 0, 0, 0],
    });
  });

  it("computes average (1 decimal), distribution and percents", () => {
    const result = aggregateRatings([5, 5, 4, 3, 1]);
    expect(result.count).toBe(5);
    expect(result.average).toBe(3.6);
    expect(result.distribution).toEqual([1, 0, 1, 1, 2]);
    expect(result.percentDistribution).toEqual([20, 0, 20, 20, 40]);
  });

  it("ignores out-of-range ratings", () => {
    const result = aggregateRatings([5, 0, 6, -1, 5]);
    expect(result.count).toBe(2);
    expect(result.average).toBe(5);
  });
});

describe("formatAverage", () => {
  it("shows the visible average with a Slovenian decimal comma (QA 2026-09-29)", () => {
    expect(formatAverage(3)).toBe("3,0");
    expect(formatAverage(4.4)).toBe("4,4");
    expect(formatAverage(0)).toBe("0,0");
  });
});

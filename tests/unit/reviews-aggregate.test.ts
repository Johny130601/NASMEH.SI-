import { describe, expect, it } from "vitest";
import { aggregateRatings } from "@/lib/reviews/aggregate";

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

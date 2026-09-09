/** Review aggregate math (§10) — PURE, unit-tested. */

export interface ReviewAggregate {
  count: number;
  average: number; // 1 decimal
  distribution: [number, number, number, number, number]; // count of 1★..5★
  percentDistribution: [number, number, number, number, number];
}

export function aggregateRatings(ratings: number[]): ReviewAggregate {
  const distribution: ReviewAggregate["distribution"] = [0, 0, 0, 0, 0];
  for (const rating of ratings) {
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      distribution[rating - 1] += 1;
    }
  }
  const count = distribution.reduce((sum, n) => sum + n, 0);
  const weighted = distribution.reduce((sum, n, i) => sum + n * (i + 1), 0);
  const average = count > 0 ? Math.round((weighted / count) * 10) / 10 : 0;
  const percentDistribution = distribution.map((n) =>
    count > 0 ? Math.round((n / count) * 100) : 0,
  ) as ReviewAggregate["percentDistribution"];
  return { count, average, distribution, percentDistribution };
}

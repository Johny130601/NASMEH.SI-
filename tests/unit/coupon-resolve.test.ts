import { describe, expect, it } from "vitest";
import { isValidPercentOff } from "@/lib/promo/resolve";

describe("isValidPercentOff (resolve-boundary guard, Phase 7 admin until then)", () => {
  it.each([1, 10, 50, 100])("accepts %i", (value) => {
    expect(isValidPercentOff(value)).toBe(true);
  });

  it.each([0, -5, 101, 150, 10.5, null])("rejects %s", (value) => {
    expect(isValidPercentOff(value)).toBe(false);
  });
});

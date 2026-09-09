import { describe, expect, it } from "vitest";
import {
  formatEUR,
  formatDdvLine,
  sumCents,
  vatBreakdown,
} from "@/lib/pricing";

describe("formatEUR", () => {
  it("€34.99 is stored as 3499 integer cents", () => {
    expect(formatEUR(3499)).toContain("34,99");
    expect(formatEUR(3499)).toContain("€");
  });

  it("formats zero and large amounts", () => {
    expect(formatEUR(0)).toContain("0,00");
    expect(formatEUR(123456789)).toContain("1.234.567,89");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatEUR(10.5)).toThrow(TypeError);
    expect(() => formatEUR(Number.NaN)).toThrow(TypeError);
  });
});

describe("vatBreakdown at SI 22 % (VAT-inclusive prices)", () => {
  it("3499 → net 2868 + tax 631 (exact cents)", () => {
    const breakdown = vatBreakdown(3499, 22);
    expect(breakdown.netCents).toBe(2868);
    expect(breakdown.taxCents).toBe(631);
    expect(breakdown.grossCents).toBe(3499);
  });

  it.each([
    [1999, 1639, 360],
    [4500, 3689, 811],
    [4999, 4098, 901],
    [100, 82, 18],
    [0, 0, 0],
  ])("%i → net %i + tax %i", (gross, net, tax) => {
    const breakdown = vatBreakdown(gross, 22);
    expect(breakdown.netCents).toBe(net);
    expect(breakdown.taxCents).toBe(tax);
  });

  it("net + tax always equals gross (no cent leakage) across a range", () => {
    for (let gross = 0; gross <= 20000; gross += 13) {
      const { netCents, taxCents } = vatBreakdown(gross, 22);
      expect(netCents + taxCents).toBe(gross);
    }
  });

  it("rejects invalid rates", () => {
    expect(() => vatBreakdown(100, -1)).toThrow(RangeError);
    expect(() => vatBreakdown(100, 22.5)).toThrow(RangeError);
  });
});

describe("formatDdvLine", () => {
  it('renders "vključen DDV 22 %: €X" with the exact tax amount', () => {
    const line = formatDdvLine(3499, 22);
    expect(line).toMatch(/^vključen DDV 22 %: /);
    expect(line).toContain("6,31");
    expect(line).toContain("€");
  });
});

describe("sumCents", () => {
  it("sums integer cents", () => {
    expect(sumCents([3499, 1999, 1999])).toBe(7497);
    expect(sumCents([])).toBe(0);
  });

  it("rejects non-integer members", () => {
    expect(() => sumCents([100, 1.5])).toThrow(TypeError);
  });
});

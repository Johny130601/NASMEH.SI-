import { describe, expect, it } from "vitest";
import { formatOrderNumber } from "@/lib/orders/numbers";

describe("order numbering (NS- sequence)", () => {
  it("formats NS-{year}-{seq:05}", () => {
    expect(formatOrderNumber(1, 2026)).toBe("NS-2026-00001");
    expect(formatOrderNumber(42, 2026)).toBe("NS-2026-00042");
    expect(formatOrderNumber(12345, 2027)).toBe("NS-2027-12345");
  });

  it("pads beyond 5 digits naturally", () => {
    expect(formatOrderNumber(123456, 2026)).toBe("NS-2026-123456");
  });

  it("rejects invalid sequences", () => {
    expect(() => formatOrderNumber(0, 2026)).toThrow(RangeError);
    expect(() => formatOrderNumber(-1, 2026)).toThrow(RangeError);
    expect(() => formatOrderNumber(1.5, 2026)).toThrow(RangeError);
  });
});

import { describe, expect, it, vi } from "vitest";
import { formatOrderNumber, nextOrderNumber, storeYear } from "@/lib/orders/numbers";

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

  it("takes the year prefix from the Europe/Ljubljana calendar, not UTC", async () => {
    // 2026-12-31T23:30Z is 00:30 on 1 January 2027 in Ljubljana (CET, UTC+1).
    const newYear = new Date("2026-12-31T23:30:00Z");
    expect(storeYear(newYear)).toBe(2027);
    expect(storeYear(new Date("2026-12-31T22:59:00Z"))).toBe(2026);
    expect(storeYear(new Date("2026-06-30T21:59:00Z"))).toBe(2026);
    const upsert = vi.fn().mockResolvedValue({ key: "order", value: 7 });
    const tx = { counter: { upsert } } as unknown as Parameters<typeof nextOrderNumber>[0];
    expect(await nextOrderNumber(tx, newYear)).toBe("NS-2027-00007");
    expect(upsert).toHaveBeenCalledWith({ where: { key: "order" }, update: { value: { increment: 1 } }, create: { key: "order", value: 1 } });
  });
});

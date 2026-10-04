import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA 2026-10-03 T5-13: the builder's coupon is checked when it is saved; a
 * coupon switched off, expired or used up later silently stops the discount,
 * so the settings page names why.
 */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { coupon: { findUnique: mocks.findUnique } } }));

import { builderCouponProblem } from "@/lib/admin/cms";

const now = new Date("2026-10-03T12:00:00Z");
const live = { active: true, type: "PERCENT", startsAt: null, endsAt: null, usageLimitTotal: null, usedCount: 0 };

beforeEach(() => {
  mocks.findUnique.mockReset();
  mocks.findUnique.mockResolvedValue(live);
});

describe("builderCouponProblem", () => {
  it("is null without a code and for a live percent coupon", async () => {
    expect(await builderCouponProblem("", now)).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(await builderCouponProblem("PAKET20", now)).toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: "PAKET20" } }));
  });

  it("names each way a saved coupon stops discounting", async () => {
    const cases: Array<[object | null, string]> = [
      [null, "missing"],
      [{ ...live, active: false }, "inactive"],
      [{ ...live, type: "FIXED" }, "notPercent"],
      [{ ...live, startsAt: new Date("2026-10-04T00:00:00Z") }, "notStarted"],
      [{ ...live, endsAt: new Date("2026-10-03T11:59:59Z") }, "expired"],
      [{ ...live, usageLimitTotal: 10, usedCount: 10 }, "usedUp"],
    ];
    for (const [row, problem] of cases) {
      mocks.findUnique.mockResolvedValueOnce(row);
      expect(await builderCouponProblem("PAKET20", now)).toBe(problem);
    }
  });
});

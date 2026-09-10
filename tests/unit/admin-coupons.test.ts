import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));

import {
  couponIsUnused, couponLink, couponSchema, couponToInput, couponValueLabel, dateToZonedDateTime, parseCouponFilters, toCouponData, zonedDateTimeToDate, type CouponInput,
} from "@/lib/admin/coupons";

const base: CouponInput = {
  code: " e2e-15 ", type: "PERCENT", percentOff: 15, amountOffCents: null, usageLimitTotal: null, usageLimitPerCustomer: 1,
  startsAt: null, endsAt: null, minSpendCents: 2000, eligibleProductIds: [], eligibleCollectionSlugs: [], eligibleEmails: ["A@B.SI", "a@b.si"],
  excludedProductIds: [], active: true,
};

describe("coupon form schema", () => {
  it("normalises the code and e-mails and keeps the percent within 1–100", () => {
    const parsed = couponSchema.parse(base);
    expect(parsed.code).toBe("E2E-15");
    expect(parsed.eligibleEmails).toEqual(["a@b.si", "a@b.si"]);
    expect(couponSchema.safeParse({ ...base, code: "x" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, code: "kupon 10" }).success).toBe(false);
    for (const percentOff of [0, 101, 12.5, null]) expect(couponSchema.safeParse({ ...base, percentOff }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, percentOff: 100 }).success).toBe(true);
  });

  it("requires the value field of the chosen type and accepts free shipping without one", () => {
    expect(couponSchema.safeParse({ ...base, type: "FIXED", percentOff: null, amountOffCents: null }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, type: "FIXED_PRODUCT", percentOff: null, amountOffCents: 0 }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, type: "FIXED", percentOff: null, amountOffCents: 500 }).success).toBe(true);
    expect(couponSchema.safeParse({ ...base, type: "FREE_SHIPPING", percentOff: null, amountOffCents: null }).success).toBe(true);
    expect(couponSchema.safeParse({ ...base, type: "BXGY" }).success).toBe(false);
  });

  it("parses datetime-local values and refuses an end before the start", () => {
    const parsed = couponSchema.parse({ ...base, startsAt: "2026-09-10T08:00", endsAt: "2026-09-30T23:59" });
    expect(parsed.startsAt).toBeInstanceOf(Date);
    expect(parsed.endsAt!.getTime()).toBeGreaterThan(parsed.startsAt!.getTime());
    expect(couponSchema.safeParse({ ...base, startsAt: "2026-09-30T08:00", endsAt: "2026-09-10T08:00" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, startsAt: "2026-09-10T08:00", endsAt: "2026-09-10T08:00" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, startsAt: "2026-09-10" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, endsAt: "2026-13-45T00:00" }).success).toBe(false);
    expect(couponSchema.parse({ ...base, startsAt: "" }).startsAt).toBeNull();
  });

  it("reads validity windows in the store's time zone regardless of the server zone", () => {
    expect(zonedDateTimeToDate("2026-07-01T08:00")?.toISOString()).toBe("2026-07-01T06:00:00.000Z"); // CEST
    expect(zonedDateTimeToDate("2026-01-15T08:00")?.toISOString()).toBe("2026-01-15T07:00:00.000Z"); // CET
    expect(zonedDateTimeToDate("2026-02-30T08:00")).toBeNull();
    expect(zonedDateTimeToDate("2026-09-10")).toBeNull();
    expect(dateToZonedDateTime(new Date("2026-07-01T06:00:00.000Z"))).toBe("2026-07-01T08:00");
    expect(dateToZonedDateTime(new Date("2026-01-15T07:00:00.000Z"))).toBe("2026-01-15T08:00");
    expect(dateToZonedDateTime(null)).toBeNull();
    expect(couponSchema.parse({ ...base, startsAt: "2026-07-01T08:00" }).startsAt?.toISOString()).toBe("2026-07-01T06:00:00.000Z");
  });

  it("limits are positive integers or empty", () => {
    expect(couponSchema.safeParse({ ...base, usageLimitTotal: 0 }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, minSpendCents: 0 }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, usageLimitTotal: null, minSpendCents: null }).success).toBe(true);
  });
});

describe("coupon data mapping", () => {
  it("keeps only the value of the chosen type and writes eligibility JSON only when a list is set", () => {
    const percent = toCouponData(couponSchema.parse(base));
    expect(percent).toMatchObject({ code: "E2E-15", type: "PERCENT", percentOff: 15, amountOffCents: null, stackable: false, active: true });
    expect(percent.eligibility).toEqual({ emails: ["a@b.si"] });
    expect(percent.exclusions).toBe(Prisma.DbNull);
    const fixed = toCouponData(couponSchema.parse({ ...base, type: "FIXED", percentOff: 15, amountOffCents: 500, eligibleEmails: [], eligibleProductIds: ["p1", "p1", "p2"], excludedProductIds: ["p3"] }));
    expect(fixed).toMatchObject({ percentOff: null, amountOffCents: 500 });
    expect(fixed.eligibility).toEqual({ productIds: ["p1", "p2"] });
    expect(fixed.exclusions).toEqual({ productIds: ["p3"] });
    expect(toCouponData(couponSchema.parse({ ...base, eligibleEmails: [] })).eligibility).toBe(Prisma.DbNull);
  });

  it("maps a stored row back to editor values, showing BXGY rows as percent", () => {
    const row = {
      id: "c1", code: "TEST10", type: "BXGY" as const, percentOff: 10, amountOffCents: null, usageLimitTotal: 5, usageLimitPerCustomer: null,
      usedCount: 2, startsAt: new Date("2026-09-10T06:05:00.000Z"), endsAt: null, minSpendCents: null,
      eligibility: { productIds: ["p1"], collectionSlugs: ["beljenje"], emails: ["a@b.si"], junk: 1 }, exclusions: { productIds: ["p2"] },
      stackable: false, active: true, createdAt: new Date(), updatedAt: new Date(),
    };
    expect(couponToInput(row)).toEqual({
      code: "TEST10", type: "PERCENT", percentOff: 10, amountOffCents: null, usageLimitTotal: 5, usageLimitPerCustomer: null,
      startsAt: "2026-09-10T08:05", endsAt: null, minSpendCents: null, eligibleProductIds: ["p1"], eligibleCollectionSlugs: ["beljenje"],
      eligibleEmails: ["a@b.si"], excludedProductIds: ["p2"], active: true,
    });
    expect(couponToInput({ ...row, type: "FREE_SHIPPING", eligibility: null, exclusions: null }).eligibleProductIds).toEqual([]);
  });

  it("builds the absolute auto-apply link, value labels, filters and the delete rule", () => {
    expect(couponLink("E2E-15")).toBe("https://nasmeh.example/koda/E2E-15");
    const eur = (cents: number) => `${(cents / 100).toFixed(2)} €`;
    expect(couponValueLabel({ type: "PERCENT", percentOff: 15, amountOffCents: null }, eur)).toBe("15 %");
    expect(couponValueLabel({ type: "FIXED", percentOff: null, amountOffCents: 500 }, eur)).toBe("5.00 €");
    expect(couponValueLabel({ type: "FREE_SHIPPING", percentOff: null, amountOffCents: null }, eur)).toBe("—");
    expect(parseCouponFilters({ q: [" test "], stanje: "aktivni" })).toEqual({ q: "TEST", active: true });
    expect(parseCouponFilters({ stanje: "neaktivni" })).toEqual({ q: "", active: false });
    expect(parseCouponFilters({ stanje: "x", q: "a".repeat(60) }).q).toHaveLength(40);
    expect(couponIsUnused({ usedCount: 0, _count: { couponRedemptions: 0 } })).toBe(true);
    expect(couponIsUnused({ usedCount: 1, _count: { couponRedemptions: 0 } })).toBe(false);
    expect(couponIsUnused({ usedCount: 0, _count: { couponRedemptions: 1 } })).toBe(false);
  });
});

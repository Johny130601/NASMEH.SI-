import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 7 step 4: direct action calls for coupons and moderation, and the QR route guard. */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(),
  couponCreate: vi.fn(), couponUpdate: vi.fn(), couponFindUnique: vi.fn(), couponDelete: vi.fn(),
  reviewFindUnique: vi.fn(), reviewUpdate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
vi.mock("@/lib/db", () => ({ db: {
  coupon: { create: mocks.couponCreate, update: mocks.couponUpdate, findUnique: mocks.couponFindUnique, delete: mocks.couponDelete },
  review: { findUnique: mocks.reviewFindUnique, update: mocks.reviewUpdate },
} }));

import { createCouponAction, deleteCouponAction, saveCouponAction } from "@/app/admin/(shell)/kuponi/actions";
import { GET as qrRoute } from "@/app/admin/(shell)/kuponi/[id]/qr.svg/route";
import { moderateReviewAction } from "@/app/admin/(shell)/ocene/actions";
import type { CouponInput } from "@/lib/admin/coupons";

const session = (role: string, mfaEnrolled = true) => ({ user: { id: `cmf0${role.toLowerCase()}00000000000000001`, email: `${role.toLowerCase()}@nasmeh.si`, name: role, role, mfaEnrolled } });
const couponId = "cmf0coupon000000000000001";
const input: CouponInput = {
  code: "e2e-15", type: "PERCENT", percentOff: 15, amountOffCents: null, usageLimitTotal: null, usageLimitPerCustomer: 1, startsAt: null, endsAt: null,
  minSpendCents: 2000, eligibleProductIds: [], eligibleCollectionSlugs: [], eligibleEmails: [], excludedProductIds: [], active: true,
};
const p2002 = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6", meta: { target: ["code"] } });
const qr = (id: string) => qrRoute(new Request("https://nasmeh.example/admin/kuponi/x/qr.svg"), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(session("MANAGER"));
  mocks.couponCreate.mockResolvedValue({ id: couponId, code: "E2E-15" });
  mocks.couponUpdate.mockResolvedValue({});
  mocks.couponFindUnique.mockResolvedValue({ id: couponId, code: "E2E-15", usedCount: 0, _count: { couponRedemptions: 0 } });
  mocks.couponDelete.mockResolvedValue({});
  mocks.reviewFindUnique.mockResolvedValue({ product: { slug: "serum" } });
  mocks.reviewUpdate.mockResolvedValue({});
});

describe("coupon actions (direct calls)", () => {
  it("MANAGER creates, saves and deletes; SUPPORT and FULFILLMENT are refused before any write", async () => {
    expect(await createCouponAction(input)).toEqual({ ok: true, id: couponId });
    expect(mocks.couponCreate.mock.calls[0][0].data).toMatchObject({ code: "E2E-15", type: "PERCENT", percentOff: 15, minSpendCents: 2000, eligibility: Prisma.DbNull, stackable: false });
    expect(await saveCouponAction({ couponId, coupon: { ...input, active: false } })).toEqual({ ok: true });
    expect(mocks.couponUpdate.mock.calls[0][0]).toMatchObject({ where: { id: couponId }, data: { active: false } });
    expect(await deleteCouponAction({ couponId })).toEqual({ ok: true });
    for (const role of ["SUPPORT", "FULFILLMENT"]) {
      mocks.auth.mockResolvedValue(session(role));
      await expect(createCouponAction(input)).rejects.toThrow("forbidden");
      await expect(saveCouponAction({ couponId, coupon: input })).rejects.toThrow("forbidden");
      await expect(deleteCouponAction({ couponId })).rejects.toThrow("forbidden");
    }
    expect(mocks.couponCreate).toHaveBeenCalledTimes(1);
    expect(mocks.couponDelete).toHaveBeenCalledTimes(1);
  });

  it("maps invalid input, duplicate codes and used coupons to results", async () => {
    expect(await createCouponAction({ ...input, percentOff: 0 })).toEqual({ ok: false, error: "invalid" });
    mocks.couponCreate.mockRejectedValueOnce(p2002);
    expect(await createCouponAction(input)).toEqual({ ok: false, error: "codeTaken" });
    mocks.couponUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "6" }));
    expect(await saveCouponAction({ couponId, coupon: input })).toEqual({ ok: false, error: "not_found" });
    mocks.couponFindUnique.mockResolvedValueOnce({ id: couponId, usedCount: 1, _count: { couponRedemptions: 1 } });
    expect(await deleteCouponAction({ couponId })).toEqual({ ok: false, error: "used" });
    expect(mocks.couponDelete).not.toHaveBeenCalled();
  });

  it("refuses unenrolled staff and anonymous callers", async () => {
    mocks.auth.mockResolvedValue(session("OWNER", false));
    await expect(createCouponAction(input)).rejects.toThrow("mfa_required");
    mocks.auth.mockResolvedValue(null);
    await expect(createCouponAction(input)).rejects.toThrow("forbidden");
  });
});

describe("QR route guard", () => {
  it("answers 404 to anonymous callers and roles without the promotions permission", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await qr(couponId)).status).toBe(404);
    mocks.auth.mockResolvedValue(session("SUPPORT"));
    expect((await qr(couponId)).status).toBe(404);
    mocks.auth.mockResolvedValue(session("FULFILLMENT"));
    expect((await qr(couponId)).status).toBe(404);
    mocks.auth.mockResolvedValue(session("MANAGER"));
    expect((await qr("x".repeat(65))).status).toBe(404); // step 7: params are validated before the lookup
    expect(mocks.couponFindUnique).not.toHaveBeenCalled();
  });

  it("renders an SVG of the auto-apply link for a manager and 404 for an unknown coupon", async () => {
    const response = await qr(couponId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toContain("<svg");
    mocks.couponFindUnique.mockResolvedValueOnce(null);
    expect((await qr("missing")).status).toBe(404);
  });
});

describe("moderation permission", () => {
  it("SUPPORT and MANAGER moderate reviews, FULFILLMENT does not", async () => {
    for (const role of ["SUPPORT", "MANAGER", "OWNER"]) {
      mocks.auth.mockResolvedValue(session(role));
      expect(await moderateReviewAction({ reviewId: "cmf0review000000000000001", decision: "approve" })).toEqual({ ok: true });
    }
    expect(mocks.reviewUpdate).toHaveBeenCalledTimes(3);
    mocks.auth.mockResolvedValue(session("FULFILLMENT"));
    await expect(moderateReviewAction({ reviewId: "cmf0review000000000000001", decision: "approve" })).rejects.toThrow("forbidden");
  });
});

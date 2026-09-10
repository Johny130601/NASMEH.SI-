import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn(), lock: vi.fn(), remove: vi.fn(), upsert: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/reviews/photo-storage", () => ({ removeReviewPhotos: mocks.remove }));
vi.mock("@/lib/db", () => {
  const tx = { setting: { upsert: mocks.upsert }, $queryRaw: mocks.lock, review: { findUnique: mocks.find, update: mocks.update } };
  return { db: { ...tx, $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } };
});
import { moderateReviewAction, deleteReviewPhotoAction, saveReviewSettingsAction } from "@/app/admin/(shell)/ocene/actions";
const url = `/uploads/reviews/${"a".repeat(24)}.webp`;
const other = `/uploads/reviews/${"b".repeat(24)}.webp`;
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { role: "OWNER", id: "admin", mfaEnrolled: true } }); mocks.find.mockResolvedValue({ product: { slug: "product" }, photos: [url, other] }); mocks.update.mockResolvedValue({}); mocks.remove.mockResolvedValue(undefined); });
describe("review moderation authority and persistence", () => {
  it.each([null, { user: { role: "CUSTOMER", id: "customer" } }])("denies moderation and file removal without admin authority", async (session) => {
    mocks.auth.mockResolvedValue(session);
    await expect(moderateReviewAction({ reviewId: "review", decision: "approve" })).rejects.toThrow("forbidden");
    await expect(deleteReviewPhotoAction({ reviewId: "review", photoUrl: url })).rejects.toThrow("forbidden");
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("can clear a published reply without changing moderation status", async () => {
    expect(await moderateReviewAction({ reviewId: "review", decision: "reply", merchantReply: "  " })).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "review" }, data: { merchantReply: null } });
    expect(mocks.revalidate).toHaveBeenCalledWith("/izdelek/product");
  });
  it.each([["approve", "PUBLISHED"], ["reject", "REJECTED"]] as const)("%s persists %s with sanitized reply", async (decision, status) => {
    await moderateReviewAction({ reviewId: "review", decision, merchantReply: " Thank you " });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "review" }, data: { status, merchantReply: "Thank you" } });
  });
  it("locks photo membership, removes only the selected path and cleans its generated files", async () => {
    expect((await deleteReviewPhotoAction({ reviewId: "review", photoUrl: url })).ok).toBe(true);
    expect(mocks.lock).toHaveBeenCalledOnce(); expect(mocks.update).toHaveBeenCalledWith({ where: { id: "review" }, data: { photos: [other] } });
    expect(mocks.remove).toHaveBeenCalledWith([url]);
  });
  it("rejects arbitrary paths or another review's photo without deleting files", async () => {
    expect((await deleteReviewPhotoAction({ reviewId: "review", photoUrl: "../../secret" })).ok).toBe(false);
    mocks.find.mockResolvedValue({ product: { slug: "product" }, photos: [other] });
    expect((await deleteReviewPhotoAction({ reviewId: "review", photoUrl: url })).ok).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not unlink a photo if the DB removal fails", async () => {
    mocks.update.mockRejectedValueOnce(new Error("write failed"));
    await expect(deleteReviewPhotoAction({ reviewId: "review", photoUrl: url })).rejects.toThrow();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("review collection settings", () => {
  it("requires admin role and validates both bounded configuration values", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(saveReviewSettingsAction({ autoPublishMinStars: 4, requestDelayDays: 7 })).rejects.toThrow("forbidden");
    mocks.auth.mockResolvedValue({ user: { role: "OWNER", id: "admin", mfaEnrolled: true } });
    expect((await saveReviewSettingsAction({ autoPublishMinStars: 4, requestDelayDays: 6 })).ok).toBe(false);
    expect((await saveReviewSettingsAction({ autoPublishMinStars: 4, requestDelayDays: 11 })).ok).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("saves both review settings in one transaction", async () => {
    expect((await saveReviewSettingsAction({ autoPublishMinStars: 4, requestDelayDays: 9 })).ok).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { key: "reviews.autoPublishMinStars" }, create: { key: "reviews.autoPublishMinStars", value: 4 }, update: { value: 4 } });
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { key: "reviews.requestDelayDays" }, create: { key: "reviews.requestDelayDays", value: 9 }, update: { value: 9 } });
  });
});

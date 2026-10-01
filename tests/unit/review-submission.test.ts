import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { signRatingToken } from "@/lib/reviews/rating-token";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), initialItem: vi.fn(), lockedItem: vi.fn(), create: vi.fn(), lock: vi.fn(),
  getSetting: vi.fn(), prepare: vi.fn(), save: vi.fn(), remove: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "review-unit-secret" }) }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.getSetting }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ db: {
  orderItem: { findUnique: mocks.initialItem },
  $transaction: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: mocks.lock, orderItem: { findUnique: mocks.lockedItem }, review: { create: mocks.create } }),
} }));
vi.mock("@/lib/reviews/photo-storage", () => ({
  InvalidReviewPhoto: class extends Error {}, prepareReviewPhoto: mocks.prepare, saveReviewPhotos: mocks.save, removeReviewPhotos: mocks.remove,
}));
import { submitReviewAction } from "@/app/(storefront)/actions/reviews";
import { InvalidReviewPhoto } from "@/lib/reviews/photo-storage";

const photo = `/uploads/reviews/${"a".repeat(24)}.webp`;
function item() { return { id: "item-1", orderId: "order-1", order: { status: "DELIVERED", userId: "owner" }, variant: { productId: "product", product: { slug: "product" } }, review: null }; }
function form(options: { token?: string; photo?: boolean; rating?: number } = {}) {
  const data = new FormData();
  data.set("orderItemId", "item-1"); data.set("rating", String(options.rating ?? 5)); data.set("text", "My review");
  if (options.token) data.set("ratingToken", options.token);
  if (options.photo) data.set("photos", new File(["image"], "photo.png", { type: "image/png" }));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner", role: "CUSTOMER" } });
  mocks.initialItem.mockResolvedValue(item()); mocks.lockedItem.mockResolvedValue(item());
  mocks.create.mockResolvedValue({ id: "review" }); mocks.getSetting.mockResolvedValue(0);
  mocks.prepare.mockResolvedValue({ large: Buffer.from("image"), small: Buffer.from("thumb") });
  mocks.save.mockImplementation(async (photos: unknown[]) => photos.length ? [photo] : []);
  mocks.remove.mockResolvedValue(undefined);
});
describe("verified review submission", () => {
  it("authorizes the owning session and snapshots purchase linkage", async () => {
    expect(await submitReviewAction(form())).toEqual({ ok: true, autoPublished: false });
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderItemId: "item-1", userId: "owner", productId: "product", status: "PENDING" }) });
  });
  it("accepts guest email capability for the exact purchased item", async () => {
    mocks.auth.mockResolvedValue(null);
    const token = signRatingToken({ orderItemId: "item-1", rating: 5 }, "review-unit-secret");
    expect((await submitReviewAction(form({ token }))).ok).toBe(true);
  });
  it.each(["CUSTOMER", "OWNER"])("denies a non-owning %s even with a token for a different item", async (role) => {
    mocks.auth.mockResolvedValue({ user: { id: "other", role } });
    const token = signRatingToken({ orderItemId: "other-item", rating: 5 }, "review-unit-secret");
    expect((await submitReviewAction(form({ token, photo: true }))).ok).toBe(false);
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["PENDING", "PAID", "SHIPPED", "REFUNDED", "CANCELLED"])("rejects an undelivered %s purchase", async (status) => {
    mocks.initialItem.mockResolvedValue({ ...item(), order: { status, userId: "owner" } });
    expect((await submitReviewAction(form())).ok).toBe(false); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rechecks delivery after locking, cleaning prepared files when eligibility changed", async () => {
    mocks.lockedItem.mockResolvedValue({ ...item(), order: { status: "REFUNDED", userId: "owner" } });
    expect((await submitReviewAction(form({ photo: true }))).ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalledWith([photo]);
  });
  it("returns a friendly duplicate for a competing submission and removes unused uploads", async () => {
    mocks.lockedItem.mockResolvedValue({ ...item(), review: { id: "existing" } });
    expect((await submitReviewAction(form({ photo: true }))).error).toContain("že oddali");
    expect(mocks.remove).toHaveBeenCalledWith([photo]);
  });
  it("cleans saved images if the unique item constraint catches a duplicate", async () => {
    mocks.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test", meta: { target: ["orderItemId"] } }));
    expect((await submitReviewAction(form({ photo: true }))).error).toContain("že oddali");
    expect(mocks.remove).toHaveBeenCalledWith([photo]);
  });
  it("reports persistence failure without leaking files or claiming publication", async () => {
    mocks.create.mockRejectedValueOnce(new Error("database offline"));
    expect((await submitReviewAction(form({ photo: true }))).ok).toBe(false);
    expect(mocks.remove).toHaveBeenCalledWith([photo]); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("retains persisted photos on success", async () => {
    expect((await submitReviewAction(form({ photo: true }))).ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ photos: [photo] }) });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects counterfeit image content before storing anything", async () => {
    mocks.prepare.mockRejectedValueOnce(new InvalidReviewPhoto());
    expect((await submitReviewAction(form({ photo: true }))).error).toContain("Fotografije ni mogoče");
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([
    ["an unnamed 0-byte File", new File([], "")],
    ["a 0-byte File the action encoder named \"blob\"", new File([], "blob", { type: "application/octet-stream" })],
    ["an empty string part", ""],
  ])("accepts a review without a photo when the untouched input arrives as %s (QA M1)", async (_label, part) => {
    const data = form(); data.set("photos", part);
    expect(await submitReviewAction(data)).toEqual({ ok: true, autoPublished: false });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ photos: [] }) });
  });
  it("rejects more than four photos and forged string photo fields", async () => {
    const data = form(); for (let i = 0; i < 5; i++) data.append("photos", new File(["x"], `${i}.png`, { type: "image/png" }));
    expect((await submitReviewAction(data)).ok).toBe(false);
    data.delete("photos"); data.set("photos", "/uploads/other.png");
    expect((await submitReviewAction(data)).ok).toBe(false); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3, 6, "4", null, {}])("does not auto-publish with unsupported setting %j", async (setting) => {
    mocks.getSetting.mockResolvedValue(setting);
    expect((await submitReviewAction(form())).autoPublished).toBe(false);
  });
  it.each([[4, 4, true], [4, 3, false], [5, 4, false], [5, 5, true]])("threshold %i rating %i publishes %s", async (setting, rating, expected) => {
    mocks.getSetting.mockResolvedValue(setting);
    expect((await submitReviewAction(form({ rating: Number(rating) }))).autoPublished).toBe(expected);
  });
});

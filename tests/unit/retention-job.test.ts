import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tokenDelete: vi.fn(), tokenUpdate: vi.fn(), checkoutFind: vi.fn(), checkoutDelete: vi.fn(), orderFind: vi.fn(),
  reviewFind: vi.fn(), reviewUpdate: vi.fn(), remove: vi.fn(), attachmentFind: vi.fn(), agedFiles: vi.fn(), removeSupport: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {
  authToken: { deleteMany: mocks.tokenDelete, updateMany: mocks.tokenUpdate },
  abandonedCheckout: { findMany: mocks.checkoutFind, deleteMany: mocks.checkoutDelete },
  order: { findMany: mocks.orderFind },
  review: { findMany: mocks.reviewFind, updateMany: mocks.reviewUpdate },
  ticketAttachment: { findMany: mocks.attachmentFind },
} }));
vi.mock("@/lib/reviews/photo-storage", () => ({ removeReviewPhotos: mocks.remove }));
vi.mock("@/lib/support/photos", () => ({ agedSupportPhotoFiles: mocks.agedFiles, removeSupportPhotos: mocks.removeSupport }));

import { ABANDONED_CHECKOUT_RETENTION_DAYS, AUTH_TOKEN_RETENTION_DAYS, SUPPORT_PHOTO_GRACE_DAYS, runRetention } from "@/lib/jobs/retention";

const now = new Date("2026-09-13T03:00:00Z");
const daysBefore = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const photo = `/uploads/reviews/${"c".repeat(24)}.webp`;
const baseCounts = {
  authTokensDeleted: 2, activationDataCleared: 1, abandonedCheckoutsDeleted: 4,
  rejectedReviewPhotosRemoved: 1, unownedSupportPhotosRemoved: 0, failed: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tokenDelete.mockResolvedValue({ count: 2 });
  mocks.tokenUpdate.mockResolvedValue({ count: 1 });
  mocks.checkoutFind.mockResolvedValue([{ recoveryToken: "key-paid" }, { recoveryToken: "key-open" }]);
  mocks.orderFind.mockResolvedValue([{ checkoutKey: "key-paid" }]);
  mocks.checkoutDelete.mockImplementation(async ({ where }) => ({ count: where.recoveryToken ? 1 : 3 }));
  mocks.reviewFind.mockResolvedValue([{ id: "r1", photos: [photo, "https://evil.example/x.jpg"] }, { id: "r2", photos: [photo] }]);
  mocks.reviewUpdate.mockImplementation(async ({ where }) => ({ count: where.id === "r1" ? 1 : 0 }));
  mocks.remove.mockResolvedValue(undefined);
  mocks.agedFiles.mockResolvedValue([]);
  mocks.attachmentFind.mockResolvedValue([]);
  mocks.removeSupport.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("daily retention", () => {
  it("keeps the placeholder periods explicit", () => {
    expect(AUTH_TOKEN_RETENTION_DAYS).toBe(30);
    expect(ABANDONED_CHECKOUT_RETENTION_DAYS).toBe(30);
  });

  it("deletes stale sign-in tokens and clears the credentials snapshot of unusable ones", async () => {
    const counts = await runRetention(now);
    expect(mocks.tokenDelete).toHaveBeenCalledWith({ where: { OR: [{ usedAt: { lt: daysBefore(30) } }, { expiresAt: { lt: daysBefore(30) } }] } });
    expect(mocks.tokenUpdate).toHaveBeenCalledWith({
      where: { activationData: { not: Prisma.DbNull }, OR: [{ usedAt: { not: null } }, { expiresAt: { lte: now } }] },
      data: { activationData: Prisma.DbNull },
    });
    expect(counts).toMatchObject({ authTokensDeleted: 2, activationDataCleared: 1 });
  });

  it("deletes captures that became paid orders at any age and unconverted ones after the window", async () => {
    const counts = await runRetention(now);
    expect(mocks.checkoutFind.mock.calls[0][0].where).toEqual({ updatedAt: { gte: daysBefore(30) } });
    expect(mocks.orderFind).toHaveBeenCalledWith({ where: { checkoutKey: { in: ["key-paid", "key-open"] }, paidAt: { not: null } }, select: { checkoutKey: true } });
    expect(mocks.checkoutDelete).toHaveBeenCalledWith({ where: { recoveryToken: { in: ["key-paid"] } } });
    expect(mocks.checkoutDelete).toHaveBeenCalledWith({ where: { updatedAt: { lt: daysBefore(30) } } });
    expect(counts.abandonedCheckoutsDeleted).toBe(4);
  });

  it("skips the order lookup when no recent capture exists", async () => {
    mocks.checkoutFind.mockResolvedValue([]);
    await runRetention(now);
    expect(mocks.orderFind).not.toHaveBeenCalled();
    expect(mocks.checkoutDelete).toHaveBeenCalledOnce();
  });

  it("removes photos of rejected reviews after the DB write, never for a review re-approved meanwhile", async () => {
    const counts = await runRetention(now);
    expect(mocks.reviewFind.mock.calls[0][0].where).toEqual({ status: "REJECTED", AND: [{ photos: { not: Prisma.DbNull } }, { NOT: { photos: { equals: [] } } }] });
    expect(mocks.reviewUpdate).toHaveBeenCalledWith({ where: { id: "r1", status: "REJECTED" }, data: { photos: [] } });
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith([photo]);
    expect(mocks.reviewUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
    expect(counts).toEqual(baseCounts);
  });

  it("counts a failed photo removal without logging paths or aborting the run, and puts the reference back so the next run retries", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.reviewUpdate.mockResolvedValue({ count: 1 });
    mocks.remove.mockRejectedValueOnce(new Error(`EACCES ${photo}`));
    const counts = await runRetention(now);
    expect(counts).toMatchObject({ rejectedReviewPhotosRemoved: 1, failed: 1 });
    // Without the restore the file would stay on disk for ever with no row naming it.
    expect(mocks.reviewUpdate).toHaveBeenCalledWith({ where: { id: "r1", status: "REJECTED" }, data: { photos: [photo] } });
    expect(log).toHaveBeenCalledWith("Retention could not remove 1 photo set(s)");
    expect(String(log.mock.calls[0][0])).not.toContain("uploads");
  });

  it("sweeps aged support photos that no ticket attachment names any more", async () => {
    const orphan = `${"d".repeat(24)}.webp`;
    const kept = `${"e".repeat(24)}.webp`;
    mocks.agedFiles.mockResolvedValue([orphan, kept]);
    mocks.attachmentFind.mockResolvedValue([{ filename: kept }]);
    const counts = await runRetention(now);
    expect(mocks.agedFiles).toHaveBeenCalledWith(daysBefore(SUPPORT_PHOTO_GRACE_DAYS), 200);
    expect(mocks.attachmentFind).toHaveBeenCalledWith({ where: { filename: { in: [orphan, kept] } }, select: { filename: true } });
    // Only the file whose row is gone; the one still owned by a ticket stays.
    expect(mocks.removeSupport).toHaveBeenCalledWith([{ filename: orphan }]);
    expect(counts).toEqual({ ...baseCounts, unownedSupportPhotosRemoved: 1 });
  });

  it("leaves the directory alone when every aged file is still owned, and counts a failed sweep", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const owned = `${"f".repeat(24)}.webp`;
    mocks.agedFiles.mockResolvedValue([owned]);
    mocks.attachmentFind.mockResolvedValue([{ filename: owned }]);
    expect(await runRetention(now)).toEqual(baseCounts);
    expect(mocks.removeSupport).not.toHaveBeenCalled();

    mocks.agedFiles.mockRejectedValue(new Error("EACCES /support-uploads"));
    const counts = await runRetention(now);
    expect(counts).toMatchObject({ unownedSupportPhotosRemoved: 0, failed: 1 });
    expect(String(log.mock.calls.at(-1)?.[0])).not.toContain("support-uploads");
  });
});

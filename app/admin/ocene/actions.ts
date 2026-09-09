"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reviewPhotoPaths } from "@/lib/reviews/photos";
import { removeReviewPhotos } from "@/lib/reviews/photo-storage";
import { reviewSettingsSchema, type ReviewSettings } from "@/lib/reviews/settings";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("forbidden");
}

function refreshReviews(slug: string) {
  revalidatePath("/admin/ocene");
  revalidatePath(`/izdelek/${slug}`);
  revalidatePath("/trgovina");
  revalidatePath("/");
}

/** Every moderation mutation rechecks the admin session independently. */
export async function moderateReviewAction(input: {
  reviewId: string;
  decision: "approve" | "reject" | "reply";
  merchantReply?: string;
}): Promise<{ ok: boolean }> {
  await requireAdmin();
  const parsed = z.object({
    reviewId: z.string().min(1).max(128),
    decision: z.enum(["approve", "reject", "reply"]),
    merchantReply: z.string().trim().max(1000).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const review = await db.review.findUnique({ where: { id: parsed.data.reviewId }, select: { product: { select: { slug: true } } } });
  if (!review) return { ok: false };
  await db.review.update({
    where: { id: parsed.data.reviewId },
    data: {
      ...(parsed.data.decision === "reply" ? {} : { status: parsed.data.decision === "approve" ? "PUBLISHED" : "REJECTED" }),
      ...(parsed.data.merchantReply !== undefined ? { merchantReply: parsed.data.merchantReply || null } : {}),
    },
  });
  refreshReviews(review.product.slug);
  return { ok: true };
}

export async function deleteReviewPhotoAction(input: { reviewId: string; photoUrl: string }): Promise<{ ok: boolean }> {
  await requireAdmin();
  const parsed = z.object({ reviewId: z.string().min(1).max(128), photoUrl: z.string().max(200) }).safeParse(input);
  if (!parsed.success || !reviewPhotoPaths([parsed.data.photoUrl]).length) return { ok: false };
  const { reviewId, photoUrl } = parsed.data;
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Review" WHERE id = ${reviewId} FOR UPDATE`;
    const review = await tx.review.findUnique({ where: { id: reviewId }, select: { photos: true, product: { select: { slug: true } } } });
    if (!review || !reviewPhotoPaths(review.photos).includes(photoUrl)) return null;
    await tx.review.update({ where: { id: reviewId }, data: { photos: reviewPhotoPaths(review.photos).filter((url) => url !== photoUrl) } });
    return review.product.slug;
  });
  if (!result) return { ok: false };
  // Access is revoked by the DB commit even if disk deletion needs a later retry.
  await removeReviewPhotos([photoUrl]);
  refreshReviews(result);
  return { ok: true };
}

/** Persist only the two explicitly supported review settings, atomically. */
export async function saveReviewSettingsAction(input: ReviewSettings): Promise<{ ok: boolean }> {
  await requireAdmin();
  const parsed = reviewSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  await db.$transaction(async tx => {
    for (const [key, value] of [
      ["reviews.autoPublishMinStars", parsed.data.autoPublishMinStars],
      ["reviews.requestDelayDays", parsed.data.requestDelayDays],
    ] as const) {
      await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
  });
  revalidatePath("/admin/ocene");
  return { ok: true };
}

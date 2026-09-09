"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { canReviewItem } from "@/lib/reviews/access";
import { validatePhotoBatch } from "@/lib/reviews/photos";
import { InvalidReviewPhoto, prepareReviewPhoto, saveReviewPhotos, removeReviewPhotos } from "@/lib/reviews/photo-storage";
import { reviews as copy } from "@/lib/copy";

const formSchema = z.object({
  orderItemId: z.string().min(1).max(128),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).default(""),
  text: z.string().trim().max(2000).default(""),
  sensitivity: z.enum(["Nizka", "Srednja", "Visoka"]).optional(),
  recommend: z.boolean().default(false),
  ratingToken: z.string().max(1024).default(""),
});

export interface ReviewSubmitResult {
  ok: boolean;
  error?: string;
  autoPublished?: boolean;
}

/** Purchaser-only submission. File writes are compensated if the atomic DB
 * eligibility/unique-item check loses a race or persistence fails. */
export async function submitReviewAction(formData: FormData): Promise<ReviewSubmitResult> {
  const parsed = formSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
    rating: formData.get("rating"),
    title: formData.get("title") ?? "",
    text: formData.get("text") ?? "",
    sensitivity: formData.get("sensitivity") || undefined,
    recommend: formData.get("recommend") === "on" || formData.get("recommend") === "true",
    ratingToken: formData.get("ratingToken") ?? "",
  });
  if (!parsed.success) return { ok: false, error: copy.form.invalid };
  const input = parsed.data;
  const session = await auth();
  const secret = getEnv().AUTH_SECRET;
  const include = { order: true, variant: { include: { product: true } }, review: true } as const;
  const item = await db.orderItem.findUnique({ where: { id: input.orderItemId }, include });
  const eligible = (row: typeof item) => row?.order.status === "DELIVERED" && !!row.variant && canReviewItem({
    orderItemId: input.orderItemId, orderUserId: row.order.userId,
    sessionUserId: session?.user?.id, token: input.ratingToken, secret,
  });
  if (!item || !eligible(item)) return { ok: false, error: copy.form.notEligible };
  if (item.review) return { ok: false, error: copy.form.duplicate };

  const rawFiles = formData.getAll("photos");
  if (rawFiles.some((value) => typeof value === "string")) return { ok: false, error: copy.form.photoErrors.mime };
  // Browsers submit one empty, unnamed File when no upload is selected.
  const files = rawFiles.filter((value): value is File => value instanceof File && !(value.size === 0 && value.name === ""));
  const batch = validatePhotoBatch(files);
  if (!batch.ok) return { ok: false, error: copy.form.photoErrors[batch.reason] };

  let photoPaths: string[] = [];
  let persisted = false;
  try {
    const prepared = [];
    for (const file of files) prepared.push(await prepareReviewPhoto(Buffer.from(await file.arrayBuffer()), file.type));
    photoPaths = await saveReviewPhotos(prepared);
    const setting = await getSetting<unknown>("reviews.autoPublishMinStars");
    // The launch option is specifically verified 4–5 stars; malformed values fail closed.
    const autoPublish = (setting === 4 || setting === 5) && input.rating >= setting;
    const outcome = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${item.orderId} FOR UPDATE`;
      const current = await tx.orderItem.findUnique({ where: { id: input.orderItemId }, include });
      if (!current || !eligible(current)) return { ok: false, error: copy.form.notEligible };
      if (current.review) return { ok: false, error: copy.form.duplicate };
      await tx.review.create({ data: {
        productId: current.variant!.productId, orderItemId: input.orderItemId,
        userId: current.order.userId, rating: input.rating, title: input.title || null, text: input.text,
        photos: photoPaths,
        attributes: { ...(input.sensitivity ? { sensitivity: input.sensitivity } : {}), recommend: input.recommend },
        status: autoPublish ? "PUBLISHED" : "PENDING",
      } });
      return { ok: true, autoPublished: autoPublish };
    });
    persisted = outcome.ok;
    if (outcome.ok) {
      revalidatePath(`/izdelek/${item.variant!.product.slug}`);
      revalidatePath("/admin/ocene");
    }
    return outcome;
  } catch (error) {
    if (error instanceof InvalidReviewPhoto) return { ok: false, error: copy.form.photoErrors.content };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" &&
      Array.isArray(error.meta?.target) && error.meta.target.includes("orderItemId")) {
      return { ok: false, error: copy.form.duplicate };
    }
    return { ok: false, error: copy.form.genericError };
  } finally {
    if (!persisted && photoPaths.length) await removeReviewPhotos(photoPaths);
  }
}

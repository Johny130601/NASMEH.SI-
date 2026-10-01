"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { mediaReferenceMap } from "@/lib/admin/cms";
import { mediaAltSchema } from "@/lib/admin/cms-schemas";
import { InvalidMediaFile, MEDIA_LIBRARY_OWNER_ID, MEDIA_VIDEO_MIME, prepareMediaImage, prepareMediaVideo, removeMediaImage, saveMediaFile } from "@/lib/admin/media";

export type MediaActionResult = { ok: true; urls?: string[] } | { ok: false; error: "invalid" | "not_found" | "media" | "referenced" };

const idSchema = z.string().min(1).max(64);

/**
 * Up to eight files per upload into the library; alt text applies to all of them. Images are
 * re-encoded to WebP; an MP4/WebM hero video is checked and stored as uploaded (QA M13). The
 * library screen sends one file per request so a batch never meets the 10 MB request limit (QA T7-F6).
 */
export async function uploadMediaAssetsAction(formData: FormData): Promise<MediaActionResult> {
  await requirePermission("content:manage");
  const parsed = mediaAltSchema.safeParse({ alt: formData.get("alt") ?? "" });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0).slice(0, 8);
  if (files.length === 0) return { ok: false, error: "media" };
  const prepared: Array<{ buffer: Buffer; extension: "webp" | "mp4" | "webm" }> = [];
  try {
    for (const file of files) {
      prepared.push(MEDIA_VIDEO_MIME[file.type] ? await prepareMediaVideo(file) : { buffer: await prepareMediaImage(file, 2400), extension: "webp" });
    }
  } catch (error) {
    if (error instanceof InvalidMediaFile) return { ok: false, error: "media" };
    throw error;
  }
  const urls: string[] = [];
  try {
    for (const { buffer, extension } of prepared) {
      const url = await saveMediaFile("media", MEDIA_LIBRARY_OWNER_ID, buffer, extension);
      urls.push(url);
      // A video has no decoder on the host: its dimensions are unknown (0 × 0) and the library says "video".
      const meta = extension === "webp" ? await sharp(buffer).metadata() : { width: 0, height: 0 };
      await db.mediaAsset.create({ data: { url, alt: parsed.data.alt, width: meta.width ?? 0, height: meta.height ?? 0, bytes: buffer.byteLength } });
    }
  } catch (error) {
    await Promise.all(urls.map((url) => removeMediaImage(url)));
    await db.mediaAsset.deleteMany({ where: { url: { in: urls } } });
    throw error;
  }
  revalidatePath("/admin/mediji");
  return { ok: true, urls };
}

export async function updateMediaAltAction(input: { assetId: string; alt: string }): Promise<MediaActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ assetId: idSchema, alt: mediaAltSchema.shape.alt }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await db.mediaAsset.updateMany({ where: { id: parsed.data.assetId }, data: { alt: parsed.data.alt } });
  if (result.count === 0) return { ok: false, error: "not_found" };
  revalidatePath("/admin/mediji");
  return { ok: true };
}

/** A file still used by a setting, page, banner, product (media or HTML fields) or mail template stays; the caller replaces the reference first. */
export async function deleteMediaAssetAction(input: { assetId: string }): Promise<MediaActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ assetId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const asset = await db.mediaAsset.findUnique({ where: { id: parsed.data.assetId } });
  if (!asset) return { ok: false, error: "not_found" };
  const references = await mediaReferenceMap([asset.url]);
  if ((references.get(asset.url) ?? 0) > 0) return { ok: false, error: "referenced" };
  await db.mediaAsset.delete({ where: { id: asset.id } });
  await removeMediaImage(asset.url);
  revalidatePath("/admin/mediji");
  return { ok: true };
}

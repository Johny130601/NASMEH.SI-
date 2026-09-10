import { isStaffRole } from "@/lib/admin/permissions";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { REVIEW_UPLOAD_DIR } from "@/lib/reviews/photo-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const filenameSchema = z.string().regex(/^[a-f0-9]{24}(?:-320)?\.(?:webp|jpg|png)$/);
const noCache = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Runtime uploads are served only while attached to an accessible review.
 * This also prevents deleted/rejected originals remaining publicly accessible. */
export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const parsed = filenameSchema.safeParse((await params).filename);
  if (!parsed.success) return new Response(null, { status: 404, headers: noCache });
  const filename = parsed.data;
  const url = `/uploads/reviews/${filename.replace(/-320(?=\.webp$)/, "")}`;
  const review = await db.review.findFirst({
    where: { photos: { array_contains: [url] } },
    select: { status: true, userId: true, orderItem: { select: { order: { select: { userId: true } } } } },
  });
  if (!review) return new Response(null, { status: 404, headers: noCache });
  if (review.status !== "PUBLISHED") {
    const user = (await auth())?.user;
    if (!user || (!isStaffRole(user.role) && user.id !== (review.orderItem?.order.userId ?? review.userId))) {
      return new Response(null, { status: 404, headers: noCache });
    }
  }
  try {
    const bytes = await readFile(path.join(REVIEW_UPLOAD_DIR, filename));
    const type = filename.endsWith(".webp") ? "image/webp" : filename.endsWith(".png") ? "image/png" : "image/jpeg";
    return new Response(new Uint8Array(bytes), { headers: { ...noCache, "Content-Type": type } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response(null, { status: 404, headers: noCache });
    throw error;
  }
}

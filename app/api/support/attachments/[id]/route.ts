import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SUPPORT_UPLOAD_DIR, SUPPORT_PHOTO_FILENAME } from "@/lib/support/photos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9-]+$/);
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response(null, { status: 404, headers: privateHeaders });

/** Uploaded evidence belongs to the reporter, independently of any order owner.
 * Guests have no download capability; authenticated staff can inspect their files. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return missing();
  const user = (await auth())?.user;
  if (!user) return missing();
  const attachment = await db.ticketAttachment.findUnique({
    where: { id: id.data },
    include: { ticket: { select: { userId: true, reference: true } } },
  });
  if (!attachment || !SUPPORT_PHOTO_FILENAME.test(attachment.filename)) return missing();
  const isReporter = Boolean(user.id) && attachment.ticket.userId === user.id;
  if (user.role !== "ADMIN" && !isReporter) return missing();
  try {
    const bytes = await readFile(path.join(SUPPORT_UPLOAD_DIR, attachment.filename));
    return new Response(new Uint8Array(bytes), { headers: {
      ...privateHeaders,
      "Content-Type": "image/webp",
      "Content-Disposition": `inline; filename="${attachment.filename}"`,
    } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return missing();
    throw error;
  }
}

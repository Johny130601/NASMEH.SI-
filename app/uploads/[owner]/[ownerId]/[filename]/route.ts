import { readFile } from "node:fs/promises";
import { mediaFilePath } from "@/lib/admin/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFoundHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * Public catalog media (§14.2, §14.3) from the persistent upload directory.
 * Names are random and never reused, so the response is immutable; a deleted
 * file simply stops resolving.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ owner: string; ownerId: string; filename: string }> }) {
  const { owner, ownerId, filename } = await params;
  const file = mediaFilePath(owner, ownerId, filename);
  if (!file) return new Response(null, { status: 404, headers: notFoundHeaders });
  try {
    const bytes = await readFile(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response(null, { status: 404, headers: notFoundHeaders });
    throw error;
  }
}

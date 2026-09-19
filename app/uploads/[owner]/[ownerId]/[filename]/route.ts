import { readFile } from "node:fs/promises";
import { cookies } from "next/headers";
import { mediaFilePath } from "@/lib/admin/media";
import { getEnv } from "@/lib/env";
import { MAINTENANCE_COOKIE, isValidMaintenanceCookie } from "@/lib/maintenance";
import { getMaintenance } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFoundHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Locked for everyone but a visitor who passed the gate (the same check as the middleware). */
async function isLocked(): Promise<boolean> {
  if (!(await getMaintenance().catch(() => ({ enabled: false }))).enabled) return false;
  const token = (await cookies()).get(MAINTENANCE_COOKIE)?.value;
  return !isValidMaintenanceCookie(token, getEnv().AUTH_SECRET);
}

/**
 * Public catalog media (§14.2, §14.3) from the persistent upload directory.
 * Names are random and never reused, so the response is immutable; a deleted
 * file simply stops resolving.
 *
 * The middleware matcher skips file-like paths, so the maintenance gate (§3.6)
 * is applied here too: packshots and campaign art were fetchable by direct URL
 * on a "locked" staging, which is exactly the artwork a pre-launch store hides.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ owner: string; ownerId: string; filename: string }> }) {
  const { owner, ownerId, filename } = await params;
  const file = mediaFilePath(owner, ownerId, filename);
  if (!file || (await isLocked())) return new Response(null, { status: 404, headers: notFoundHeaders });
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

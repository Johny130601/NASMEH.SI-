import { readFile } from "node:fs/promises";
import { cookies } from "next/headers";
import { mediaFilePath, mediaFileResponse } from "@/lib/admin/media";
import { getEnv } from "@/lib/env";
import { MAINTENANCE_COOKIE, isValidMaintenanceCookie } from "@/lib/maintenance";
import { getMaintenance } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFoundHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Locked for everyone but a visitor who passed the gate (the same check as the middleware). */
async function isLocked(): Promise<boolean> {
  const setting = await getMaintenance().catch(() => ({ enabled: false as const, passwordHash: null }));
  if (!setting.enabled) return false;
  const token = (await cookies()).get(MAINTENANCE_COOKIE)?.value;
  return !isValidMaintenanceCookie(token, getEnv().AUTH_SECRET, setting.passwordHash);
}

/**
 * Public catalog media (§14.2, §14.3) from the persistent upload directory.
 * Names are random and never reused, so the response is immutable; a deleted
 * file simply stops resolving.
 *
 * The middleware matcher skips file-like paths, so the maintenance gate (§3.6)
 * is applied here too: packshots and campaign art were fetchable by direct URL
 * on a "locked" staging, which is exactly the artwork a pre-launch store hides.
 *
 * Each file answers with its own content type (WebP images; MP4/WebM library
 * videos for the hero) and honours byte ranges — iOS Safari plays video only
 * through 206 responses (QA M13/T7-F13).
 */
export async function GET(request: Request, { params }: { params: Promise<{ owner: string; ownerId: string; filename: string }> }) {
  const { owner, ownerId, filename } = await params;
  const file = mediaFilePath(owner, ownerId, filename);
  if (!file || (await isLocked())) return new Response(null, { status: 404, headers: notFoundHeaders });
  try {
    const bytes = await readFile(file);
    return mediaFileResponse(new Uint8Array(bytes), filename, request.headers.get("range"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response(null, { status: 404, headers: notFoundHeaders });
    throw error;
  }
}

import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import {
  MAINTENANCE_COOKIE,
  isValidMaintenanceCookie,
} from "@/lib/maintenance";
import {
  SETTING_KEYS,
  type MaintenanceSetting,
} from "@/lib/settings";

const authMiddleware = NextAuth(authConfig).auth;

/** Always reachable — even while the store is locked. */
const ALLOWED_WHEN_LOCKED = ["/vzdrzevanje", "/prijava", "/admin"];

/**
 * Maintenance gate (spec §3.6): when the Setting is enabled and the request
 * carries no valid unlock cookie, REWRITE to /vzdrzevanje. The gated page
 * never executes — nothing from the catalog reaches the RSC payload.
 * Runs on the Node.js runtime (Prisma lookup per matched page request).
 */
export default async function middleware(request: NextRequest) {
  await drainRequestBody(request);
  if (await isMaintenanceLocked(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/vzdrzevanje";
    return NextResponse.rewrite(url);
  }
  const response = (await authMiddleware(request as never)) as unknown as Response | undefined;
  // Auth.js re-issues the session cookie on every request it inspects
  // (sliding expiry). A refresh racing a sign-out resurrects the session:
  // link prefetches still in flight while the user logs out answered with a
  // fresh cookie after the sign-out had cleared it (Phase 7 step 1 finding).
  // Sessions are issued at sign-in and validated per request, so the
  // middleware never sets cookies; a JWT simply expires at its maxAge.
  response?.headers.delete("set-cookie");
  return response;
}

/**
 * Next.js 15.5's Node.js middleware runtime clones every request body for the
 * middleware and swaps the buffered copy back in with `finalize()`, but does
 * not await that call (vercel/next.js#85416, fixed upstream in 16.x by
 * PR #85418). A Server Action can therefore attach to a still-streaming body
 * and miss the chunks already buffered for it: multipart uploads (review and
 * support photos) lose their leading parts. Reading a tee of the body to the
 * end guarantees the whole upload has arrived, so the swap has completed
 * before any route handler reads it. The original `request.body` stays
 * undisturbed because Next's adapter re-wraps the request afterwards. Bodies
 * are tiny except photo uploads, which Next buffers in full anyway.
 */
async function drainRequestBody(request: NextRequest): Promise<void> {
  if (request.method === "GET" || request.method === "HEAD" || !request.body) return;
  const tee = request.clone().body;
  if (!tee) return;
  const reader = tee.getReader();
  try {
    while (!(await reader.read()).done) {
      // Discard: the route handler reads Next's buffered copy, not this tee.
    }
  } catch {
    // An aborted upload fails in the route handler exactly as before.
  } finally {
    reader.releaseLock();
  }
}

async function isMaintenanceLocked(request: NextRequest): Promise<boolean> {
  const { pathname } = request.nextUrl;
  if (
    ALLOWED_WHEN_LOCKED.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return false;
  }

  const row = await db.setting.findUnique({
    where: { key: SETTING_KEYS.maintenance },
  });
  const setting = row?.value as MaintenanceSetting | undefined;
  if (!setting?.enabled) return false;

  const token = request.cookies.get(MAINTENANCE_COOKIE)?.value;
  return !isValidMaintenanceCookie(token, getEnv().AUTH_SECRET);
}

export const config = {
  runtime: "nodejs",
  // page routes only: skip /api, Next internals, and anything file-like
  // (fonts, uploads, og-default.svg, favicon…)
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};

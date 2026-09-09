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
  if (await isMaintenanceLocked(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/vzdrzevanje";
    return NextResponse.rewrite(url);
  }
  return authMiddleware(request as never);
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

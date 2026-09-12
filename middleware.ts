import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import {
  MAINTENANCE_COOKIE,
  isValidMaintenanceCookie,
} from "@/lib/maintenance";
import { applySecurityHeaders, buildCsp, cspHeaderName, generateNonce } from "@/lib/security/headers";
import {
  SETTING_KEYS,
  type MaintenanceSetting,
} from "@/lib/settings";

const withAuth = NextAuth(authConfig).auth;

/** Always reachable — even while the store is locked. */
const ALLOWED_WHEN_LOCKED = ["/vzdrzevanje", "/prijava", "/admin"];

/**
 * Per page request (Node.js runtime, Prisma lookup):
 * 1. drain the body tee (Next 15.5 body race, see below);
 * 2. maintenance gate (spec §3.6): when the Setting is enabled and the request
 *    carries no valid unlock cookie, REWRITE to /vzdrzevanje — the gated page
 *    never executes and nothing from the catalog reaches the RSC payload;
 * 3. Auth.js authorization (staff for /admin, a session for /racun). With a
 *    custom handler Auth.js only evaluates `callbacks.authorized` and ignores
 *    its boolean, so the handler applies the same callback itself and
 *    redirects to the sign-in page with a relative callback path (the pages
 *    re-check the session as well — the middleware is the first line, not the
 *    only one);
 * 4. security headers with a per-request CSP nonce (Phase 9 step 1). The
 *    nonce travels to the render as the `x-nonce` request header together
 *    with the policy itself, which Next.js reads to nonce its own scripts.
 */
export default async function middleware(request: NextRequest) {
  await drainRequestBody(request);
  const nonce = generateNonce();
  const enforce = getEnv().CSP_ENFORCE === "true";
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(cspHeaderName(enforce), csp);

  let response: Response;
  if (await isMaintenanceLocked(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/vzdrzevanje";
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    const handled = await withAuth((req) => {
      if (!authConfig.callbacks.authorized({ auth: req.auth, request: req })) {
        return signInRedirect(request);
      }
      return NextResponse.next({ request: { headers: requestHeaders } });
    })(request as never, {} as never);
    response = (handled as Response | undefined) ?? NextResponse.next({ request: { headers: requestHeaders } });
    // Auth.js re-issues the session cookie on every request it inspects
    // (sliding expiry). A refresh racing a sign-out resurrects the session:
    // link prefetches still in flight while the user logs out answered with a
    // fresh cookie after the sign-out had cleared it (Phase 7 step 1 finding).
    // Sessions are issued at sign-in and validated per request, so the
    // middleware never sets cookies; a JWT simply expires at its maxAge.
    response.headers.delete("set-cookie");
  }
  applySecurityHeaders(response.headers, csp, enforce);
  return response;
}

/**
 * The sign-in redirect stays on the request's own origin, the way Next.js
 * expects middleware redirects: a Location on the server's internal origin is
 * relativized before it leaves the server, so the browser resolves it against
 * whatever origin it used (the reverse proxy's public host included). A
 * Location built from any other origin would be sent as is — behind a proxy
 * that is only right when the forwarded headers are, and on a server bound to
 * a loopback IP Next.js rewrites it to `localhost` (its URL class normalizes
 * loopback addresses) while the router keeps the literal bind address, so the
 * redirect ends up cross-origin and an RSC prefetch that follows it trips
 * `connect-src 'self'` (Phase 9 step 1 finding F7). The callback is a relative
 * path for the same reason; the RSC cache-buster is not part of the address.
 */
function signInRedirect(request: NextRequest): NextResponse {
  const query = new URLSearchParams(request.nextUrl.search);
  query.delete("_rsc");
  const search = query.toString();
  const signInUrl = request.nextUrl.clone();
  signInUrl.pathname = authConfig.pages.signIn;
  signInUrl.search = "";
  signInUrl.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${search ? `?${search}` : ""}`);
  return NextResponse.redirect(signInUrl);
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

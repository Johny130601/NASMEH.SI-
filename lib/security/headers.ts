import { randomBytes } from "node:crypto";

/**
 * Security headers (Phase 9 step 1). TLS and HSTS are the reverse proxy's
 * job (AGENTS §6); the app sends everything that depends on its own markup.
 * The Content-Security-Policy is nonce-based: the middleware mints a nonce per
 * page request, Next.js applies it to its own scripts, and the two inline
 * scripts the app authors (consent defaults, JSON-LD) read it from the
 * `x-nonce` request header. `'strict-dynamic'` lets the trusted bundles load
 * what they need at runtime (Stripe.js, the PayPal SDK, Turnstile, GTM after
 * consent) without listing every host in script-src.
 */

/** Static headers for every response, pages and API alike (next.config.ts). */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\" \"https://www.paypal.com\")" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

export const CSP_REPORT_PATH = "/api/csp-report";

export function generateNonce(): string {
  return randomBytes(16).toString("base64");
}

/** The policy string for one request; `dev` = `next dev`, which evaluates code and uses a websocket for HMR. */
export function buildCsp(nonce: string, dev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      "https://api.stripe.com", "https://r.stripe.com", "https://m.stripe.network", "https://q.stripe.com",
      "https://www.paypal.com", "https://www.sandbox.paypal.com", "https://api-m.paypal.com", "https://api-m.sandbox.paypal.com",
      "https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.analytics.google.com",
      "https://challenges.cloudflare.com",
      ...(dev ? ["ws:", "wss:"] : []),
    ],
    "frame-src": [
      "https://js.stripe.com", "https://hooks.stripe.com", "https://m.stripe.network",
      "https://www.paypal.com", "https://www.sandbox.paypal.com",
      "https://challenges.cloudflare.com",
    ],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
  return policy;
}

export function cspHeaderName(enforce: boolean): string {
  return enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

/** Applies the static headers plus the CSP to a response the middleware returns. */
export function applySecurityHeaders(headers: Headers, csp: string, enforce: boolean): void {
  for (const { key, value } of STATIC_SECURITY_HEADERS) headers.set(key, value);
  headers.set(cspHeaderName(enforce), csp);
}

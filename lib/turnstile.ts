import { z } from "zod";

/**
 * Cloudflare Turnstile — reusable server-verified form guard (spec §3.6).
 *
 * Modes:
 * - keys configured (TURNSTILE_SECRET_KEY): verify against siteverify API.
 * - TEST BYPASS: when the process runs in test mode — NODE_ENV === "test"
 *   (unit tests) OR NASMEH_E2E === "1" (e2e harness; needed because Next.js
 *   inlines NODE_ENV as "production" into the standalone build) — a token
 *   equal to TURNSTILE_TEST_TOKEN verifies. Never set NASMEH_E2E in production.
 * - no secret key: FAIL-CLOSED in production, allowed in development so local
 *   work isn't blocked (documented in .env.example).
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTestMode(): boolean {
  return (
    process.env.NODE_ENV === "test" || process.env.NASMEH_E2E === "1"
  );
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<boolean> {
  const testToken = process.env.TURNSTILE_TEST_TOKEN;
  if (isTestMode() && testToken && token === testToken) {
    return true;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return true; // development without keys — documented convenience
  }

  if (!token || token.length > 2048) return false;

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    if (!response.ok) return false;
    const data = z.object({ success: z.boolean() }).safeParse(await response.json());
    return data.success && data.data.success;
  } catch {
    return false;
  }
}

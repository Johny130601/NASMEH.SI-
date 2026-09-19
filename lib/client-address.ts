import { headers as requestHeaders } from "next/headers";

/**
 * The per-client key every rate limit is bucketed on (lib/rate-limit.ts).
 *
 * `x-real-ip` first: the reverse proxy sets it from the real remote address and
 * overwrites whatever the client sent, so it is the only value the client
 * cannot choose. The runbook's nginx and Traefik blocks set it — a proxy that
 * does not is a misconfiguration, because `x-forwarded-for` alone is not
 * trustworthy: `$proxy_add_x_forwarded_for` APPENDS the real address to the
 * client's own header, so every element but the LAST one is attacker-supplied.
 * Taking the first element handed a request with a random `x-forwarded-for` a
 * fresh bucket every time, which defeated the limit entirely (Phase 9 finding).
 */
const UNKNOWN = "unknown";

export function clientAddress(headers: { get(name: string): string | null }): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  // The proxy's own append is last; without a proxy the header is absent.
  const appended = forwarded?.split(",").at(-1)?.trim();
  return appended || UNKNOWN;
}

/**
 * The same key for a caller that has no Request in hand (server actions,
 * lib/auth-credentials). Direct calls from tests and scripts run outside a
 * request scope, where `headers()` throws; the one fixed key only makes the
 * limit stricter, never looser.
 */
export async function requestClientAddress(): Promise<string> {
  try {
    return clientAddress(await requestHeaders());
  } catch {
    return UNKNOWN;
  }
}

"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  consentIdFromCookie,
  encodeConsentCookie,
  serializeConsent,
  storedCategoriesFromCookie,
  withdrawalCookiePatterns,
  withdrawsConsent,
} from "@/lib/consent";
import { clientAddress } from "@/lib/client-address";
import { lastLoggedCookieChoice, recordConsent } from "@/lib/consent-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { getConsentConfig } from "@/lib/settings";

const inputSchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
});

/**
 * Generous on purpose: one save per visitor is normal, but carrier-grade NAT
 * (and the e2e suite, one address for every spec) puts many visitors behind
 * one address. It bounds anonymous ConsentLog inserts per client.
 * (Not exported: a "use server" module may only export async functions.)
 */
const CONSENT_SAVE_LIMIT = { limit: 120, windowMs: 10 * 60_000 } as const;

export type SaveConsentResult =
  /** `clearCookies`: names and prefix patterns the browser expires for the denied categories (static list + live cookie table). */
  | { ok: true; clearCookies: string[] }
  | { ok: false };

/**
 * Persists the CMP choice (spec §3.4): ConsentLog row FIRST (version, choices,
 * timestamp, the random consent id as `visitorId`, the user when signed in),
 * then the consent cookie carrying the same id and timestamp.
 * - A grant is only stored in the browser once its proof is stored on the server.
 * - A withdrawal (a category the browser's stored choice granted is now denied)
 *   is never stored without its row either, so the log never ends on a grant the
 *   visitor took back: a failed write answers ok:false and the banner asks for a
 *   retry. It is exempt from the rate limit when the log confirms the grant it
 *   withdraws (a forged cookie cannot buy unlimited rows that way).
 * - A plain refusal (nothing granted before) is never blocked: when the log
 *   write fails or the client is over the rate limit, the all-denied cookie is
 *   still set, without a row.
 */
export async function saveConsentAction(input: {
  analytics: boolean;
  marketing: boolean;
}): Promise<SaveConsentResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const choices = parsed.data;
  const grants = choices.analytics || choices.marketing;

  const client = clientAddress(await headers());
  const jar = await cookies();
  const stored = jar.get(CONSENT_COOKIE)?.value;
  const withdrawal = withdrawsConsent(storedCategoriesFromCookie(stored), choices);
  const id = consentIdFromCookie(stored) ?? randomUUID();

  let writeRow = checkRateLimit(`consent:${client}`, CONSENT_SAVE_LIMIT.limit, CONSENT_SAVE_LIMIT.windowMs).allowed;
  if (!writeRow && withdrawal) {
    try {
      writeRow = withdrawsConsent(await lastLoggedCookieChoice(db, id), choices);
    } catch (error) {
      console.error("consent log read failed", error instanceof Error ? error.name : "unknown");
      return { ok: false };
    }
  }
  if (!writeRow && grants) return { ok: false };

  const { version, cookies: cookieTable } = await getConsentConfig();
  const now = Date.now();

  if (writeRow) {
    try {
      const session = await auth().catch(() => null);
      await recordConsent(db, {
        kind: "cookie",
        version: String(version),
        choices: { ...choices, ts: now },
        visitorId: id,
        userId: session?.user?.id ?? null,
      });
    } catch (error) {
      console.error("consent log write failed", error instanceof Error ? error.name : "unknown");
      if (grants || withdrawal) return { ok: false };
    }
  }

  jar.set(CONSENT_COOKIE, encodeConsentCookie(serializeConsent({ v: version, necessary: true, ...choices, id }, now)), {
    maxAge: CONSENT_MAX_AGE_S,
    path: "/",
    sameSite: "lax",
    httpOnly: true, // the provider receives the parsed choice from the server; no script reads the cookie
    secure: process.env.NODE_ENV === "production",
  });

  return { ok: true, clearCookies: withdrawalCookiePatterns(choices, cookieTable) };
}

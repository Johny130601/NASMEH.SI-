"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  encodeConsentCookie,
  serializeConsent,
} from "@/lib/consent";
import { getConsentConfig } from "@/lib/settings";

const inputSchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
});

/**
 * Persists the CMP choice: consent cookie + server-side ConsentLog row
 * (timestamp, version, choices — spec §3.4).
 */
export async function saveConsentAction(input: { analytics: boolean; marketing: boolean }) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };

  const { version } = await getConsentConfig();
  const value = serializeConsent({ v: version, necessary: true, ...parsed.data }, Date.now());
  const jar = await cookies();
  jar.set(CONSENT_COOKIE, encodeConsentCookie(value), {
    maxAge: CONSENT_MAX_AGE_S,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  await db.consentLog.create({
    data: { kind: "cookie", version: String(version), choices: parsed.data },
  });

  return { ok: true as const };
}

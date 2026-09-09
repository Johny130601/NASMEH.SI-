"use server";

import { z } from "zod";
import { applyKodaCode, clearKodaCode } from "@/lib/koda";

/** Checkout discount field: validate + store code (§8.2). */
export async function applyKodaAction(input: unknown): Promise<{
  ok: boolean;
  code?: string;
}> {
  const parsed = z.object({ code: z.string().min(1).max(24) }).safeParse(input);
  if (!parsed.success) return { ok: false };
  return applyKodaCode(parsed.data.code);
}

/** Removes the active code — totals recompute server-side on next read. */
export async function clearKodaAction(): Promise<{ ok: true }> {
  await clearKodaCode();
  return { ok: true };
}

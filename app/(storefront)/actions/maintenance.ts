"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { clientAddress } from "@/lib/client-address";
import { getEnv } from "@/lib/env";
import {
  MAINTENANCE_COOKIE,
  MAINTENANCE_MAX_AGE_S,
  maintenanceCookieValue,
} from "@/lib/maintenance";
import { checkRateLimit } from "@/lib/rate-limit";
import { getMaintenance } from "@/lib/settings";
import { maintenance as copy } from "@/lib/copy";

export interface MaintenanceResult {
  ok: boolean;
  message?: string;
}

const inputSchema = z.object({ password: z.string().max(80) });

/**
 * Password gate for maintenance mode (spec §3.6). The password is stored as a
 * bcrypt hash (Phase 9 step 1, backlog B15); guesses are bounded per client.
 */
export async function unlockMaintenanceAction(input: {
  password: string;
}): Promise<MaintenanceResult> {
  const setting = await getMaintenance();
  if (!setting.enabled) return { ok: true };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: copy.wrongPassword };
  const client = clientAddress(await headers());
  if (!checkRateLimit(`maintenance-unlock:${client}`, 10, 10 * 60_000).allowed) {
    return { ok: false, message: copy.wrongPassword };
  }

  if (setting.passwordHash && await bcrypt.compare(parsed.data.password, setting.passwordHash)) {
    const jar = await cookies();
    jar.set(
      MAINTENANCE_COOKIE,
      maintenanceCookieValue(getEnv().AUTH_SECRET),
      {
        maxAge: MAINTENANCE_MAX_AGE_S,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
    );
    return { ok: true };
  }

  return { ok: false, message: copy.wrongPassword };
}

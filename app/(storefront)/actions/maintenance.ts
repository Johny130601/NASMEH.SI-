"use server";

import { cookies } from "next/headers";
import { getSetting, SETTING_KEYS, type MaintenanceSetting } from "@/lib/settings";
import { getEnv } from "@/lib/env";
import {
  MAINTENANCE_COOKIE,
  MAINTENANCE_MAX_AGE_S,
  maintenanceCookieValue,
} from "@/lib/maintenance";
import { maintenance as copy } from "@/lib/copy";

export interface MaintenanceResult {
  ok: boolean;
  message?: string;
}

/** Password gate for maintenance mode (spec §3.6). */
export async function unlockMaintenanceAction(input: {
  password: string;
}): Promise<MaintenanceResult> {
  const setting = await getSetting<MaintenanceSetting>(SETTING_KEYS.maintenance);
  if (!setting?.enabled) return { ok: true };

  if (setting.password && input.password === setting.password) {
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

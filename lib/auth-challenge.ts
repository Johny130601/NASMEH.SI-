import { getEnv } from "@/lib/env";
import { isTestMode } from "@/lib/turnstile";

/** Only public configuration reaches auth forms. */
export function getAuthChallengeProps() {
  const env = getEnv();
  return {
    testToken: isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null,
    siteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
  };
}

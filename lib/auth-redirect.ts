import { headers } from "next/headers";
import { REQUEST_PATH_HEADER, signInPath } from "@/lib/auth-callback";

/**
 * The sign-in page that returns to the page this request asked for: layouts and
 * the admin access gate do not know their own path, the middleware passes it
 * (`REQUEST_PATH_HEADER`, always overwritten there). Server-only.
 */
export async function signInForThisRequest(): Promise<string> {
  return signInPath((await headers()).get(REQUEST_PATH_HEADER));
}

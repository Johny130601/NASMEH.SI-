"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { PRE_AUTH_COOKIE } from "@/lib/admin/pre-auth";
import { LOGIN_EMAIL_COOKIE, LOGIN_EMAIL_COOKIE_PATH, safeCallbackPath, staffLanding } from "@/lib/auth-callback";

const LOGIN_EMAIL_MAX_AGE_S = 5 * 60;

/** `path` with the validated callback appended, when there is one. */
function withCallbackFor(callback: string | null) {
  return (path: string) => (callback ? `${path}${path.includes("?") ? "&" : "?"}callbackUrl=${encodeURIComponent(callback)}` : path);
}

export async function loginAction(formData: FormData) {
  // Only a validated relative path survives; anything else signs in to the default landing (QA T3-F1).
  const callback = safeCallbackPath(formData.get("callbackUrl"));
  const withCallback = withCallbackFor(callback);
  const email = formData.get("email");
  const jar = await cookies();
  jar.delete({ name: LOGIN_EMAIL_COOKIE, path: LOGIN_EMAIL_COOKIE_PATH });
  const keepEmail = () => {
    if (typeof email !== "string" || !email.trim()) return;
    jar.set(LOGIN_EMAIL_COOKIE, email.trim().slice(0, 254), {
      httpOnly: true, sameSite: "lax", path: LOGIN_EMAIL_COOKIE_PATH, maxAge: LOGIN_EMAIL_MAX_AGE_S,
      secure: process.env.NODE_ENV === "production",
    });
  };
  try {
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      turnstileToken: formData.get("turnstileToken"),
      // Staff continue to /admin, customers to the requested page or /racun (decided after sign-in).
      redirectTo: withCallback("/prijava/naprej"),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error instanceof CredentialsSignin) {
        // the requested page travels through the second factor too (QA 2026-10-03 w1)
        if (error.code === "mfa_required") redirect(withCallback("/prijava/2fa"));
        if (["unverified", "bot_check", "rate_limited"].includes(error.code)) {
          keepEmail();
          redirect(withCallback(`/prijava?error=${error.code}`));
        }
      }
      keepEmail();
      redirect(withCallback("/prijava?error=credentials"));
    }
    throw error; // NEXT_REDIRECT from a successful signIn
  }
}

/** Second login step for staff (§14.15): pre-auth cookie + TOTP or recovery code. */
export async function verifyTotpLoginAction(formData: FormData) {
  const callback = safeCallbackPath(formData.get("callbackUrl"));
  const withCallback = withCallbackFor(callback);
  const preAuthToken = (await cookies()).get(PRE_AUTH_COOKIE)?.value;
  if (!preAuthToken) redirect(withCallback("/prijava?error=mfa_expired"));
  try {
    await signIn("credentials", {
      preAuthToken,
      totpCode: formData.get("totpCode"),
      // the admin page asked for before signing in, else /admin (staffLanding admits admin paths only)
      redirectTo: staffLanding(callback),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error instanceof CredentialsSignin && error.code === "mfa_invalid") redirect(withCallback("/prijava/2fa?error=invalid"));
      if (error instanceof CredentialsSignin && error.code === "mfa_rate_limited") redirect(withCallback("/prijava/2fa?error=rate_limited"));
      redirect(withCallback("/prijava?error=mfa_expired"));
    }
    throw error;
  }
}

export async function logoutAction() {
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/" });
}

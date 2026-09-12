"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { PRE_AUTH_COOKIE } from "@/lib/admin/pre-auth";

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      turnstileToken: formData.get("turnstileToken"),
      // Staff continue to /admin, customers to /racun (decided after sign-in).
      redirectTo: "/prijava/naprej",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error instanceof CredentialsSignin) {
        if (error.code === "mfa_required") redirect("/prijava/2fa");
        if (["unverified", "bot_check", "rate_limited"].includes(error.code)) redirect(`/prijava?error=${error.code}`);
      }
      redirect("/prijava?error=credentials");
    }
    throw error; // NEXT_REDIRECT from a successful signIn
  }
}

/** Second login step for staff (§14.15): pre-auth cookie + TOTP or recovery code. */
export async function verifyTotpLoginAction(formData: FormData) {
  const preAuthToken = (await cookies()).get(PRE_AUTH_COOKIE)?.value;
  if (!preAuthToken) redirect("/prijava?error=mfa_expired");
  try {
    await signIn("credentials", {
      preAuthToken,
      totpCode: formData.get("totpCode"),
      redirectTo: "/admin",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error instanceof CredentialsSignin && error.code === "mfa_invalid") redirect("/prijava/2fa?error=invalid");
      redirect("/prijava?error=mfa_expired");
    }
    throw error;
  }
}

export async function logoutAction() {
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/" });
}

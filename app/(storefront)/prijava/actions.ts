"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      turnstileToken: formData.get("turnstileToken"),
      redirectTo: "/racun",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error instanceof CredentialsSignin && ["unverified", "bot_check"].includes(error.code)) {
        redirect(`/prijava?error=${error.code}`);
      }
      redirect("/prijava?error=credentials");
    }
    throw error; // NEXT_REDIRECT from a successful signIn
  }
}

export async function logoutAction() {
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/" });
}

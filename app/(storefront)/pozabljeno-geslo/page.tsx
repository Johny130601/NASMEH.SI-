import type { Metadata } from "next";
import Link from "next/link";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { auth as copy } from "@/lib/copy";
import { AuthShell } from "@/components/storefront/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/storefront/auth/PasswordForms";

export const metadata: Metadata = { title: copy.forgot.title, robots: { index: false, follow: false } };

export default async function ForgotPasswordPage() {

  return (
    <AuthShell title={copy.forgot.title} subtitle={copy.forgot.body}>
      <ForgotPasswordForm {...getAuthChallengeProps()} />
      <p className="mt-4 text-center text-sm">
        <Link href="/prijava" className="text-mid-1 underline underline-offset-2">
          {copy.forgot.backToLogin}
        </Link>
      </p>
    </AuthShell>
  );
}

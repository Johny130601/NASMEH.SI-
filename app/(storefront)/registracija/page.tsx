import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { getLegalLinks } from "@/lib/settings";
import { auth as copy } from "@/lib/copy";
import { AuthShell } from "@/components/storefront/auth/AuthShell";
import { RegisterForm } from "@/components/storefront/auth/RegisterForm";

export const metadata: Metadata = { title: copy.register.title, robots: { index: false, follow: false } };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/racun");


  return (
    <AuthShell title={copy.register.title} subtitle={copy.register.subtitle}>
      <RegisterForm {...getAuthChallengeProps()} privacyHref={(await getLegalLinks()).privacy} />
      <p className="mt-4 text-center text-sm">
        <Link href="/prijava" className="text-mid-1 underline underline-offset-2">
          {copy.register.loginLink}
        </Link>
      </p>
    </AuthShell>
  );
}

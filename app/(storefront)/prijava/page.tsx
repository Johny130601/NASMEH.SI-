import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { auth as copy } from "@/lib/copy";
import { AuthShell } from "@/components/storefront/auth/AuthShell";
import { LoginForm } from "@/components/storefront/auth/LoginForm";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { customerLanding, LOGIN_EMAIL_COOKIE, safeCallbackPath, staffLanding } from "@/lib/auth-callback";
import { isStaffRole } from "@/lib/admin/permissions";

export const metadata: Metadata = buildMetadata({
  title: copy.login.title,
  path: "/prijava",
  noindex: true,
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verificirano?: string; reset?: string; geslo?: string; callbackUrl?: string }>;
}) {
  const { error, verificirano, reset, geslo, callbackUrl } = await searchParams;
  // The page the shopper asked for (mail links, the checkout hint), validated as a relative path (QA T3-F1).
  const callback = safeCallbackPath(callbackUrl);
  const session = await auth();
  if (session?.user) redirect(isStaffRole(session.user.role) ? staffLanding(callback) : customerLanding(callback));
  // A failed attempt keeps the typed address (QA T3-F2).
  const defaultEmail = error ? (await cookies()).get(LOGIN_EMAIL_COOKIE)?.value ?? "" : "";

  return (
    <AuthShell title={copy.login.title} subtitle={copy.login.subtitle}>
      {error === "unverified" ? (
        <p role="alert" className="mb-4 rounded-card border border-error bg-white p-4 text-sm text-error">
          {copy.login.unverified}
        </p>
      ) : error ? (
        <p role="alert" className="mb-4 rounded-card border border-error bg-white p-4 text-sm text-error">
          {error === "bot_check" ? copy.botCheck : error === "mfa_expired" ? copy.login.mfaExpired : error === "rate_limited" ? copy.login.rateLimited : copy.login.invalidCredentials}
        </p>
      ) : null}
      {verificirano ? (
        <p role="status" className="mb-4 rounded-card border border-success bg-white p-4 text-sm text-success">
          {copy.login.verifiedOk}
        </p>
      ) : null}
      {geslo ? (
        <p role="status" className="mb-4 rounded-card border border-success bg-white p-4 text-sm text-success" data-password-changed>
          {copy.login.passwordChanged}
        </p>
      ) : null}
      {reset ? (
        <p role="status" className="mb-4 rounded-card border border-success bg-white p-4 text-sm text-success">
          {copy.login.resetOk}
        </p>
      ) : null}

      <LoginForm {...getAuthChallengeProps()} callbackUrl={callback} defaultEmail={defaultEmail} />

      <p className="mt-4 text-center text-sm">
        <Link href="/pozabljeno-geslo" className="text-mid-1 underline underline-offset-2">
          {copy.login.forgotLink}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm">
        <Link href="/registracija" className="text-mid-1 underline underline-offset-2">
          {copy.login.registerLink}
        </Link>
      </p>
    </AuthShell>
  );
}

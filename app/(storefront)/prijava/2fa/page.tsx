import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStaffRole } from "@/lib/admin/permissions";
import { PRE_AUTH_COOKIE } from "@/lib/admin/pre-auth";
import { buildMetadata } from "@/lib/seo";
import { customerLanding, safeCallbackPath, staffLanding } from "@/lib/auth-callback";
import { auth as copy } from "@/lib/copy";
import { UiInput } from "@/components/storefront/ui/UiInput";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { verifyTotpLoginAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.mfa.title,
  path: "/prijava/2fa",
  noindex: true,
});

/** Staff second factor: only reachable with the pre-auth cookie from step one. */
export default async function SecondFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  // the page asked for before signing in, carried through this step (QA 2026-10-03 w1)
  const callback = safeCallbackPath(callbackUrl);
  const session = await auth();
  if (session?.user) redirect(isStaffRole(session.user.role) ? staffLanding(callback) : customerLanding(callback));
  if (!(await cookies()).get(PRE_AUTH_COOKIE)?.value) redirect("/prijava?error=mfa_expired");

  return (
    <section className="mx-auto max-w-md px-(--padding) py-16 md:py-24">
      <h1 className="text-[2rem]">{copy.mfa.title}</h1>
      <p className="mt-2 text-sm text-mid-1">{copy.mfa.subtitle}</p>
      {error ? (
        <p role="alert" data-mfa-error={error === "rate_limited" ? "rate_limited" : "invalid"} className="mt-4 rounded-card border border-error bg-white p-4 text-sm text-error">
          {error === "rate_limited" ? copy.mfa.rateLimited : copy.mfa.invalid}
        </p>
      ) : null}
      <form action={verifyTotpLoginAction} className="mt-8 flex flex-col gap-5" data-mfa-form>
        {callback ? <input type="hidden" name="callbackUrl" value={callback} /> : null}
        <UiInput
          label={copy.mfa.codeLabel}
          name="totpCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          minLength={6}
          maxLength={32}
          autoFocus
        />
        <UiButton type="submit" variant="primary" fullWidth>{copy.mfa.submit}</UiButton>
      </form>
      <p className="mt-4 text-sm text-mid-1">{copy.mfa.recoveryHint}</p>
      <p className="mt-2 text-center text-sm">
        <Link href="/prijava" className="text-mid-1 underline underline-offset-2">{copy.mfa.backToLogin}</Link>
      </p>
    </section>
  );
}

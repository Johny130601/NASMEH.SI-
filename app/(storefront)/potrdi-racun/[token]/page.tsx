import type { Metadata } from "next";
import { isVerifiedAccountToken } from "@/lib/auth-tokens";
import { activationPreview } from "@/lib/auth-activation";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { auth as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { VerifyAccountForm } from "@/components/storefront/auth/VerifyAccountForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: copy.verify.title, robots: { index: false, follow: false } };

/**
 * Link access is read-only; activation needs an explicit protected form
 * submission with the password chosen with the account (QA 2026-10-03 T3-02).
 * The page says beforehand when the click also confirms the newsletter opt-in.
 */
export default async function VerifyAccountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await activationPreview(token);
  // A used link of an account that is already active leads to sign-in (QA T3-F5).
  const alreadyActive = !preview && await isVerifiedAccountToken(token);
  return <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
    {preview ? <VerifyAccountForm token={token} newsletter={preview.newsletter} {...getAuthChallengeProps()} /> : alreadyActive ? <div data-verify-already-active>
      <h1 className="text-[2rem]">{copy.verify.titleAlreadyActive}</h1>
      <p className="my-4 text-sm text-mid-1">{copy.verify.bodyAlreadyActive}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <UiButton href="/prijava" variant="primary">{copy.verify.cta}</UiButton>
        <UiButton href="/pozabljeno-geslo" variant="outline">{copy.verify.forgotCta}</UiButton>
      </div>
    </div> : <>
      <h1 className="text-[2rem]">{copy.verify.titleInvalid}</h1>
      <p className="my-4 text-sm text-mid-1">{copy.verify.bodyInvalid}</p>
      <UiButton href="/registracija" variant="primary">{copy.verify.requestNew}</UiButton>
    </>}
  </section>;
}

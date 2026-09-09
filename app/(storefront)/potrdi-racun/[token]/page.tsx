import type { Metadata } from "next";
import { isAuthTokenValid } from "@/lib/auth-tokens";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { auth as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { VerifyAccountForm } from "@/components/storefront/auth/VerifyAccountForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: copy.verify.title, robots: { index: false, follow: false } };

/** Link access is read-only; activation needs an explicit protected form submission. */
export default async function VerifyAccountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isAuthTokenValid(token, "VERIFY_EMAIL");
  return <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
    {valid ? <VerifyAccountForm token={token} {...getAuthChallengeProps()} /> : <>
      <h1 className="text-[2rem]">{copy.verify.titleInvalid}</h1>
      <p className="my-4 text-sm text-mid-1">{copy.verify.bodyInvalid}</p>
      <UiButton href="/registracija" variant="primary">{copy.verify.requestNew}</UiButton>
    </>}
  </section>;
}

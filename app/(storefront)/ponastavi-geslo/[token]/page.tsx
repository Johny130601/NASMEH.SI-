import type { Metadata } from "next";
import { auth as copy } from "@/lib/copy";
import { isAuthTokenValid } from "@/lib/auth-tokens";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { AuthShell } from "@/components/storefront/auth/AuthShell";
import { ResetPasswordForm } from "@/components/storefront/auth/PasswordForms";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: copy.reset.title, robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isAuthTokenValid(token, "RESET_PASSWORD");
  return <AuthShell title={valid ? copy.reset.title : copy.reset.invalidTitle}>
    {valid ? <ResetPasswordForm token={token} {...getAuthChallengeProps()} /> : <>
      <p role="alert" className="mb-4 text-sm text-mid-1">{copy.reset.invalidBody}</p>
      <UiButton href="/pozabljeno-geslo" variant="primary">{copy.verify.requestNew}</UiButton>
    </>}
  </AuthShell>;
}

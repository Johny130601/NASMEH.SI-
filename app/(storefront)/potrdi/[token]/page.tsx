import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { newsletterUnsubscribePath } from "@/lib/newsletter/unsubscribe-token";
import { newsletter as copy } from "@/lib/copy";
import { confirmNewsletterAction } from "@/app/(storefront)/actions/newsletter";
import { TokenActionForm } from "@/components/storefront/TokenActionForm";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { MarkWelcomeSeen } from "@/components/storefront/MarkWelcomeSeen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.confirm.title,
  path: "/potrdi",
  noindex: true,
});

/**
 * Double opt-in confirmation (spec §13.1). The link is read-only: it checks
 * the token and renders a confirm button; confirmNewsletterAction flips the
 * status and writes the ConsentLog row. The success state links the signed
 * withdrawal route.
 */
export default async function ConfirmSubscriptionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const subscriber = token.length <= 128
    ? await db.subscriber.findUnique({ where: { confirmToken: token }, select: { id: true, status: true } })
    : null;
  const valid = subscriber !== null && subscriber.status !== "UNSUBSCRIBED";
  const home = (
    <div className="mt-8 flex justify-center">
      <UiButton href="/" variant="primary">{copy.confirm.cta}</UiButton>
    </div>
  );

  if (!valid) {
    return (
      <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
        <h1 className="text-[2rem]">{copy.confirm.titleInvalid}</h1>
        <p className="mt-4 text-sm text-mid-1">{copy.confirm.bodyInvalid}</p>
        {home}
      </section>
    );
  }

  // The confirmation may open in a browser session that never saw the popup's flag (a mail read on
  // another day, or in another browser): the welcome popup must not ask for the address just confirmed (QA T7-F14).
  const success = (
    <>
      <MarkWelcomeSeen />
      <h1 className="text-[2rem]">{copy.confirm.titleOk}</h1>
      <p className="mt-4 text-sm text-mid-1">{copy.confirm.bodyOk}</p>
      <p className="mt-4 text-xs text-mid-2">
        {copy.confirm.unsubscribeLead}{" "}
        <Link
          href={newsletterUnsubscribePath(subscriber.id, getEnv().AUTH_SECRET)}
          className="underline underline-offset-2 hover:text-dark-1"
          data-newsletter-unsubscribe-link
        >
          {copy.confirm.unsubscribeLink}
        </Link>
      </p>
      {home}
    </>
  );

  return (
    <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
      {subscriber.status === "CONFIRMED" ? (
        <div data-token-success>{success}</div>
      ) : (
        <TokenActionForm
          action={confirmNewsletterAction}
          token={token}
          challenge={getAuthChallengeProps()}
          title={copy.confirm.title}
          body={copy.confirm.body}
          submit={copy.confirm.submit}
          genericError={copy.confirm.genericError}
          success={success}
        />
      )}
    </section>
  );
}

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { verifyNewsletterUnsubscribeToken } from "@/lib/newsletter/unsubscribe-token";
import { unsubscribeLinkState } from "@/lib/newsletter/subscriber-consent";
import { newsletter as copy } from "@/lib/copy";
import { unsubscribeNewsletterAction } from "@/app/(storefront)/actions/newsletter";
import { TokenActionForm } from "@/components/storefront/TokenActionForm";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.unsubscribe.title,
  path: "/odjava-novice",
  noindex: true,
});

/**
 * Newsletter withdrawal (GDPR Art. 7(3)) from the signed link in the
 * verification mail and on the confirmation page. The GET only verifies the
 * signature and renders a confirm button (no bot check, so withdrawing stays
 * as easy as subscribing); unsubscribeNewsletterAction is idempotent and logs
 * the change once. The done state shows straight away only when the address
 * is fully withdrawn: an UNSUBSCRIBED subscriber whose verified account still
 * has the e-novice opt-in gets the button, which clears the account too.
 */
export default async function UnsubscribeNewsletterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const id = verifyNewsletterUnsubscribeToken(token, getEnv().AUTH_SECRET);
  const state = await unsubscribeLinkState(db, id);
  const home = (
    <div className="mt-8 flex justify-center">
      <UiButton href="/" variant="primary">{copy.unsubscribe.cta}</UiButton>
    </div>
  );

  if (state === "invalid") {
    return (
      <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
        <h1 className="text-[2rem]">{copy.unsubscribe.titleInvalid}</h1>
        <p className="mt-4 text-sm text-mid-1">{copy.unsubscribe.bodyInvalid}</p>
        {home}
      </section>
    );
  }

  const success = (
    <>
      <h1 className="text-[2rem]">{copy.unsubscribe.titleOk}</h1>
      <p className="mt-4 text-sm text-mid-1">{copy.unsubscribe.bodyOk}</p>
      {home}
    </>
  );

  return (
    <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
      {state === "done" ? (
        <div data-token-success>{success}</div>
      ) : (
        <TokenActionForm
          action={unsubscribeNewsletterAction}
          token={token}
          title={copy.unsubscribe.title}
          body={copy.unsubscribe.body}
          submit={copy.unsubscribe.submit}
          genericError={copy.unsubscribe.genericError}
          success={success}
        />
      )}
    </section>
  );
}

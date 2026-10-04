import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { signUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";
import { backInStock as copy } from "@/lib/copy";
import { confirmBackInStockAction } from "@/app/(storefront)/actions/backInStock";
import { TokenActionForm } from "@/components/storefront/TokenActionForm";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.confirm.title,
  path: "/potrdi-zalogo",
  noindex: true,
});

/**
 * Back-in-stock double opt-in confirmation (spec §5/§6). The link is
 * read-only: it checks the token and renders a confirm button;
 * confirmBackInStockAction flips the status and writes the ConsentLog row.
 * The active state links the signed one-click unsubscribe page, so the alert
 * can be withdrawn before it fires — not only from the restock mail (legal
 * checklist MK-7, QA 2026-10-03 BIS-UNSUB). That page is read-only too: it
 * withdraws nothing until its own button is pressed.
 */
export default async function ConfirmBackInStockPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const subscription = token.length <= 128
    ? await db.backInStockSubscription.findUnique({
        where: { confirmToken: token },
        select: { id: true, status: true, product: { select: { title: true } } },
      })
    : null;
  const home = (
    <div className="mt-8 flex justify-center">
      <UiButton href="/" variant="primary">{copy.confirm.cta}</UiButton>
    </div>
  );

  if (!subscription || subscription.status === "UNSUBSCRIBED") {
    return (
      <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
        <h1 className="text-[2rem]">{copy.confirm.titleInvalid}</h1>
        <p className="mt-4 text-sm text-mid-1">{copy.confirm.bodyInvalid}</p>
        {home}
      </section>
    );
  }

  const product = subscription.product.title;
  const unsubscribeHref = `/odjava-zaloga/${signUnsubscribeToken(subscription.id, getEnv().AUTH_SECRET)}`;
  const success = (
    <>
      <h1 className="text-[2rem]">{copy.confirm.titleOk}</h1>
      <p className="mt-4 text-sm text-mid-1">{`${copy.confirm.bodyOk} (${product})`}</p>
      {home}
      <p className="mt-6 text-sm">
        <Link
          href={unsubscribeHref}
          prefetch={false}
          className="text-mid-1 underline underline-offset-4 transition-colors hover:text-dark-1"
          data-bis-unsubscribe
        >
          {copy.unsubscribe.title}
        </Link>
      </p>
    </>
  );

  return (
    <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
      {subscription.status === "CONFIRMED" ? (
        <div data-token-success>{success}</div>
      ) : (
        <TokenActionForm
          action={confirmBackInStockAction}
          token={token}
          challenge={getAuthChallengeProps()}
          title={copy.confirm.title}
          body={<p>{`${copy.confirm.body} (${product})`}</p>}
          submit={copy.confirm.submit}
          genericError={copy.confirm.genericError}
          success={success}
        />
      )}
    </section>
  );
}

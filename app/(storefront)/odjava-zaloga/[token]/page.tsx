import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { verifyUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";
import { backInStock as copy } from "@/lib/copy";
import { unsubscribeBackInStockAction } from "@/app/(storefront)/actions/backInStock";
import { TokenActionForm } from "@/components/storefront/TokenActionForm";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.unsubscribe.title,
  path: "/odjava-zaloga",
  noindex: true,
});

/**
 * Restock-alert unsubscribe (§13.1) from the signed link in the alert mail.
 * The GET only verifies the signature and renders a confirm button, so mail
 * scanners never unsubscribe anyone; unsubscribeBackInStockAction is
 * idempotent and logs the change once. An already unsubscribed row shows the
 * done state straight away.
 */
export default async function UnsubscribeBackInStockPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const id = verifyUnsubscribeToken(token, getEnv().AUTH_SECRET);
  const subscription = id
    ? await db.backInStockSubscription.findUnique({
        where: { id },
        select: { status: true, product: { select: { title: true } } },
      })
    : null;
  const home = (
    <div className="mt-8 flex justify-center">
      <UiButton href="/" variant="primary">{copy.unsubscribe.cta}</UiButton>
    </div>
  );

  if (!subscription) {
    return (
      <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
        <h1 className="text-[2rem]">{copy.unsubscribe.titleInvalid}</h1>
        <p className="mt-4 text-sm text-mid-1">{copy.unsubscribe.bodyInvalid}</p>
        {home}
      </section>
    );
  }

  const product = subscription.product.title;
  const success = (
    <>
      <h1 className="text-[2rem]">{copy.unsubscribe.titleOk}</h1>
      <p className="mt-4 text-sm text-mid-1">{`${copy.unsubscribe.bodyOk} (${product})`}</p>
      {home}
    </>
  );

  return (
    <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
      {subscription.status === "UNSUBSCRIBED" ? (
        <div data-token-success>{success}</div>
      ) : (
        <TokenActionForm
          action={unsubscribeBackInStockAction}
          token={token}
          title={copy.unsubscribe.title}
          body={<p>{`${copy.unsubscribe.body} (${product})`}</p>}
          submit={copy.unsubscribe.submit}
          genericError={copy.unsubscribe.genericError}
          success={success}
        />
      )}
    </section>
  );
}

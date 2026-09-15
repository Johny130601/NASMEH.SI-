import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
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
        select: { status: true, product: { select: { title: true } } },
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
  const success = (
    <>
      <h1 className="text-[2rem]">{copy.confirm.titleOk}</h1>
      <p className="mt-4 text-sm text-mid-1">{`${copy.confirm.bodyOk} (${product})`}</p>
      {home}
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

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { verifyUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";
import { backInStock as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.unsubscribe.titleOk,
  path: "/odjava-zaloga",
  noindex: true,
});

/**
 * One-click restock-alert unsubscribe (§13.1): signed id, idempotent, logged
 * to ConsentLog like the opt-in. Same GET contract as the two confirm routes.
 */
export default async function UnsubscribeBackInStockPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const id = verifyUnsubscribeToken(token, getEnv().AUTH_SECRET);
  const subscription = id
    ? await db.backInStockSubscription.findUnique({ where: { id }, include: { product: true } })
    : null;

  if (subscription && subscription.status !== "UNSUBSCRIBED") {
    await db.$transaction([
      db.backInStockSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "UNSUBSCRIBED", alertPendingSince: null, alertLeaseUntil: null, alertLeaseToken: null,
        },
      }),
      db.consentLog.create({
        data: {
          kind: "back-in-stock",
          version: "1",
          choices: { unsubscribed: true, productSlug: subscription.product.slug },
        },
      }),
    ]);
  }
  const ok = subscription !== null;

  return (
    <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
      <h1 className="text-[2rem]">{ok ? copy.unsubscribe.titleOk : copy.unsubscribe.titleInvalid}</h1>
      <p className="mt-4 text-sm text-mid-1">
        {ok ? `${copy.unsubscribe.bodyOk} (${subscription?.product.title})` : copy.unsubscribe.bodyInvalid}
      </p>
      <div className="mt-8 flex justify-center">
        <UiButton href="/" variant="primary">{copy.unsubscribe.cta}</UiButton>
      </div>
    </section>
  );
}

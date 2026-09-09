import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { backInStock as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.confirm.titleOk,
  path: "/potrdi-zalogo",
  noindex: true,
});

/** Back-in-stock double opt-in confirmation (spec §5/§6). */
export default async function ConfirmBackInStockPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const subscription = await db.backInStockSubscription.findUnique({
    where: { confirmToken: token },
    include: { product: true },
  });

  let confirmed = false;
  if (subscription && subscription.status !== "CONFIRMED") {
    await db.$transaction([
      db.backInStockSubscription.update({
        where: { id: subscription.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      }),
      db.consentLog.create({
        data: {
          kind: "back-in-stock",
          version: "1",
          choices: {
            // transactional alert only — no marketing opt-in was requested
            // (see copy near the submit button)
            marketing: false,
            productSlug: subscription.product.slug,
          },
        },
      }),
    ]);
    confirmed = true;
  } else if (subscription?.status === "CONFIRMED") {
    confirmed = true;
  }

  return (
    <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
      <h1 className="text-[2rem]">
        {confirmed ? copy.confirm.titleOk : copy.confirm.titleInvalid}
      </h1>
      <p className="mt-4 text-sm text-mid-1">
        {confirmed
          ? `${copy.confirm.bodyOk} (${subscription?.product.title})`
          : copy.confirm.bodyInvalid}
      </p>
      <div className="mt-8 flex justify-center">
        <UiButton href="/" variant="primary">
          {copy.confirm.cta}
        </UiButton>
      </div>
    </section>
  );
}

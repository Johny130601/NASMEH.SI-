import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { newsletter as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.confirm.titleOk,
  path: "/potrdi",
  noindex: true,
});

/** Double opt-in confirmation (spec §13.1): token → CONFIRMED + ConsentLog. */
export default async function ConfirmSubscriptionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const subscriber = await db.subscriber.findUnique({
    where: { confirmToken: token },
  });

  let confirmed = false;
  if (subscriber && subscriber.status !== "CONFIRMED") {
    await db.$transaction([
      db.subscriber.update({
        where: { id: subscriber.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      }),
      db.consentLog.create({
        data: {
          kind: "marketing-email",
          version: "1",
          choices: { marketing: true, source: subscriber.source },
        },
      }),
    ]);
    confirmed = true;
  } else if (subscriber?.status === "CONFIRMED") {
    confirmed = true;
  }

  return (
    <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
      <h1 className="text-[2rem]">
        {confirmed ? copy.confirm.titleOk : copy.confirm.titleInvalid}
      </h1>
      <p className="mt-4 text-sm text-mid-1">
        {confirmed ? copy.confirm.bodyOk : copy.confirm.bodyInvalid}
      </p>
      <div className="mt-8 flex justify-center">
        <UiButton href="/" variant="primary">
          {copy.confirm.cta}
        </UiButton>
      </div>
    </section>
  );
}

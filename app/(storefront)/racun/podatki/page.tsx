import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { account as copy } from "@/lib/copy";
import { AddressBook } from "@/components/storefront/account/AddressBook";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.addresses.title,
  path: "/racun/podatki",
  noindex: true,
});

export default async function AccountDetailsPage() {
  const session = await auth();
  if (!session?.user) redirect("/prijava");

  const [addresses, user] = await Promise.all([
    db.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    db.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { marketingOptIn: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-(--container-narrow) px-(--padding) py-12">
      <h1 className="text-[2rem]">{copy.addresses.title}</h1>
      <div className="mt-8">
        <AddressBook addresses={addresses} marketingOptIn={user.marketingOptIn} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { account as copy } from "@/lib/copy";
import { AddressBook } from "@/components/storefront/account/AddressBook";
import { ProfileForms } from "@/components/storefront/account/ProfileForms";

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
      select: { marketingOptIn: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-(--container-narrow) px-(--padding) py-12">
      <Link href="/racun" className="text-sm text-mid-1 underline underline-offset-2" data-back-to-account>
        {copy.addresses.backToAccount}
      </Link>
      <h1 className="mt-4 text-[2rem]">{copy.addresses.title}</h1>
      <div className="mt-8 flex flex-col gap-6">
        {/* Name and password (QA T3-A1); the address book and e-novice follow. */}
        <ProfileForms name={user.name ?? ""} />
        <AddressBook addresses={addresses} marketingOptIn={user.marketingOptIn} />
      </div>
    </div>
  );
}

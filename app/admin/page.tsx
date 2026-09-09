import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { admin as copy } from "@/lib/copy";
import { auth as authCopy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiPill } from "@/components/storefront/ui/UiPill";
import { logoutAction } from "../(storefront)/prijava/actions";

export const metadata: Metadata = { title: copy.title };

export default async function AdminPage() {
  const session = await auth();

  return (
    <section className="mx-auto max-w-(--container-narrow) px-(--padding) py-16">
      <h1 className="text-[2rem]">{copy.title}</h1>
      <p className="mt-4 max-w-lg text-mid-1">{copy.placeholder}</p>
      <div className="mt-8 flex flex-wrap items-center gap-4 rounded-card border border-light-2 bg-white p-6">
        <p className="text-sm text-mid-1">
          {copy.signedInAs}{" "}
          <span className="font-medium text-dark-1">{session?.user?.email}</span>
        </p>
        <UiPill variant="brand">
          {copy.roleLabel}: {session?.user?.role}
        </UiPill>
        <form action={logoutAction} className="ml-auto">
          <UiButton type="submit" variant="outline">
            {authCopy.logout}
          </UiButton>
        </form>
      </div>
    </section>
  );
}

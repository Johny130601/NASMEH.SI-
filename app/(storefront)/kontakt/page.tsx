import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { ContactForm } from "@/components/storefront/support/ContactForm";
import { auth } from "@/lib/auth";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { contact } from "@/lib/copy/contact";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getContactSettings } from "@/lib/support/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: contact.eyebrow,
  description: contact.description,
  path: "/kontakt",
  noindex: true,
});

export default async function ContactPage() {
  const [session, settings] = await Promise.all([auth(), getContactSettings()]);
  const orders = session?.user?.id ? await db.order.findMany({
    where: { userId: session.user.id },
    select: { number: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  }) : [];

  return (
    <div className="mx-auto w-full max-w-(--container-narrow) px-[var(--padding)] py-10 md:py-16">
      <header className="max-w-2xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-brand">{contact.eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{contact.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-mid-1 md:text-lg">{contact.intro}</p>
      </header>
      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
        <ContactForm
          settings={settings}
          challenge={getAuthChallengeProps()}
          requestKey={randomUUID()}
          isSignedIn={!!session?.user?.id}
          accountOrders={orders.map(order => ({ ...order, createdAt: order.createdAt.toISOString() }))}
          defaults={{ name: session?.user?.name ?? "", email: session?.user?.email ?? "" }}
        />
        <aside className="rounded-card bg-light-3 p-6" aria-labelledby="contact-channels-title">
          <h2 id="contact-channels-title" className="text-lg font-semibold">{contact.channels.title}</h2>
          <dl className="mt-5 space-y-5 text-sm">
            <div>
              <dt className="font-medium">{contact.channels.email}</dt>
              <dd className="mt-1 break-words text-mid-1"><a className="underline underline-offset-4" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></dd>
            </div>
            <div>
              <dt className="font-medium">{contact.channels.compliance}</dt>
              <dd className="mt-1 break-words text-mid-1"><a className="underline underline-offset-4" href={`mailto:${settings.complianceEmail}`}>{settings.complianceEmail}</a></dd>
            </div>
            <div><dt className="font-medium">{contact.channels.hours}</dt><dd className="mt-1 leading-relaxed text-mid-1">{settings.hours}</dd></div>
            <div><dt className="font-medium">{contact.channels.response}</dt><dd className="mt-1 leading-relaxed text-mid-1">{settings.responseTime}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

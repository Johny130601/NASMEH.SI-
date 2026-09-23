import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { admin as copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.content.title, robots: { index: false, follow: false } };

const CARDS = [
  { href: "/admin/vsebina/domov", card: "home" },
  { href: "/admin/vsebina/oglasna-vrstica", card: "marquee" },
  { href: "/admin/vsebina/popup", card: "popup" },
  { href: "/admin/vsebina/paket", card: "bundle" },
  { href: "/admin/strani", card: "pages" },
  { href: "/admin/navigacija", card: "menus" },
  { href: "/admin/mediji", card: "media" },
  { href: "/admin/e-posta", card: "email" },
] as const;

/** /admin/vsebina — CMS hub (§14.10, §14.11). */
export default async function AdminContentPage() {
  await requirePagePermission("content:manage");
  const c = copy.content;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-content>
      <h1 className="text-[2rem]">{c.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-mid-1">{c.intro}</p>
      <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CARDS.map(({ href, card }) => (
          <li key={href}>
            <Link href={href} className="block h-full rounded-card border border-light-2 bg-white p-5 transition-colors hover:border-brand" data-content-card={card}>
              <span className="block text-base font-medium">{c.cards[card].title}</span>
              <span className="mt-1 block text-sm text-mid-1">{c.cards[card].body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

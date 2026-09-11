import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { loadMarquee } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";
import { MarqueeForm } from "@/components/admin/CmsForms";

export const metadata: Metadata = { title: copy.content.marquee.title, robots: { index: false, follow: false } };

/** /admin/vsebina/oglasna-vrstica — marquee text, link and switch (§14.10). */
export default async function AdminMarqueePage() {
  await requirePagePermission("content:manage");
  const marquee = await loadMarquee();
  return (
    <section className="mx-auto max-w-3xl" data-admin-marquee>
      <Link href="/admin/vsebina" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{copy.content.marquee.title}</h1>
      <div className="mt-6"><MarqueeForm initial={marquee} /></div>
    </section>
  );
}

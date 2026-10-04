import type { Metadata } from "next";
import { connection } from "next/server";
import { admin as copy } from "@/lib/copy/admin";
import { AdminNotFound } from "@/components/admin/AdminNotFound";

export const metadata: Metadata = { title: copy.notFound.title, robots: { index: false, follow: false } };

/**
 * A person the customers section cannot find — an e-mail with no stored rows
 * typed into "Odpri osebo", an anonymised guest's old address, an unknown
 * account id — answered inside the admin with the way back to the list (QA
 * 2026-10-03 T4-09). Rendered per request (AGENTS §8.18).
 */
export default async function CustomerNotFound() {
  await connection();
  return <AdminNotFound body={copy.notFound.customers} back={{ href: "/admin/stranke", label: copy.customers.detail.back }} />;
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { admin as copy } from "@/lib/copy/admin";
import { AdminNotFound } from "@/components/admin/AdminNotFound";

export const metadata: Metadata = { title: copy.notFound.title, robots: { index: false, follow: false } };

/**
 * An order number that matches no order, answered inside the admin with the
 * way back to the order list (QA 2026-10-03 T4-09). Rendered per request
 * (AGENTS §8.18).
 */
export default async function OrderNotFound() {
  await connection();
  return <AdminNotFound body={copy.notFound.orders} back={{ href: "/admin/narocila", label: copy.orders.detail.back }} />;
}

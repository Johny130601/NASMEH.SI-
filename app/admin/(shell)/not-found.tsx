import type { Metadata } from "next";
import { connection } from "next/server";
import { admin as copy } from "@/lib/copy/admin";
import { AdminNotFound } from "@/components/admin/AdminNotFound";

export const metadata: Metadata = { title: copy.notFound.title, robots: { index: false, follow: false } };

/**
 * Every admin 404 without a section of its own (an unknown product, coupon or
 * page id, a mistyped /admin address through the catch-all): rendered inside
 * the shell instead of the storefront 404 and its redirect countdown (QA
 * 2026-10-03 T4-09). Rendered per request (AGENTS §8.18): its scripts carry
 * the request's nonce.
 */
export default async function AdminShellNotFound() {
  await connection();
  return <AdminNotFound body={copy.notFound.body} />;
}

import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";

/**
 * Any /admin address no route matches (QA 2026-10-03 T4-09): Next.js answers
 * unmatched URLs with the root 404 — the storefront page whose countdown sent
 * staff to the shop home — so this catch-all turns them into the admin's own
 * 404 inside the shell (app/admin/(shell)/not-found.tsx). Every specific
 * route, page or route handler, still wins over it. Every staff role holds
 * dashboard:view; the shell layout has already checked staff and 2FA.
 */
export default async function AdminUnknownPage() {
  await requirePagePermission("dashboard:view");
  notFound();
}

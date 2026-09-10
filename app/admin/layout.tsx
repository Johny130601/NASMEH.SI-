import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStaffRole } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

/**
 * Staff-only root of /admin (AGENTS §8.7): middleware gates too, this is the
 * server-side re-check. The 2FA enrolment gate and the shell live one level
 * down in the (shell) group so /admin/2fa itself stays reachable.
 */
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/prijava");
  if (!isStaffRole(session.user.role)) redirect("/racun");
  return <div className="min-h-screen bg-light-4 text-dark-1">{children}</div>;
}

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStaffRole, permissionsOf } from "@/lib/admin/permissions";
import { AdminShell } from "@/components/admin/AdminShell";
import { signInForThisRequest } from "@/lib/auth-redirect";

export const dynamic = "force-dynamic";

/** Every admin screen: staff with completed 2FA enrolment, inside the shell. */
export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id || !isStaffRole(session.user.role)) redirect(await signInForThisRequest());
  if (session.user.mfaEnrolled !== true) redirect("/admin/2fa");
  return (
    <AdminShell
      user={{ name: session.user.name ?? null, email: session.user.email ?? "", role: session.user.role }}
      permissions={permissionsOf(session.user.role)}
    >
      {children}
    </AdminShell>
  );
}

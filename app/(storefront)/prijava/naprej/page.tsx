import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStaffRole } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

/** Post-login router: staff land in the admin, customers in their account. */
export default async function AfterLoginPage() {
  const session = await auth();
  if (!session?.user) redirect("/prijava");
  redirect(isStaffRole(session.user.role) ? "/admin" : "/racun");
}

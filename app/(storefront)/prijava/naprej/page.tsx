import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStaffRole } from "@/lib/admin/permissions";
import { customerLanding, safeCallbackPath, staffLanding } from "@/lib/auth-callback";

export const dynamic = "force-dynamic";

/**
 * Post-login router: staff land in the admin, customers in their account — or
 * on the page they asked for before signing in, when it is a validated relative
 * path (QA T3-F1).
 */
export default async function AfterLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/prijava");
  const callback = safeCallbackPath((await searchParams).callbackUrl);
  redirect(isStaffRole(session.user.role) ? staffLanding(callback) : customerLanding(callback));
}

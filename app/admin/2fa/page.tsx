import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { beginTotpEnrolment } from "@/lib/admin/mfa";
import { admin as copy } from "@/lib/copy";
import { TotpEnrolment } from "@/components/admin/TotpEnrolment";
import { logoutAction } from "@/app/(storefront)/prijava/actions";

export const metadata: Metadata = { title: copy.mfa.title, robots: { index: false, follow: false } };

/** Mandatory 2FA enrolment (§14.15); every other admin screen redirects here until done. */
export default async function EnrolTotpPage() {
  const staff = await requirePagePermission("dashboard:view", { allowUnenrolled: true });
  if (staff.mfaEnrolled) redirect("/admin");
  const start = await beginTotpEnrolment(staff.id);
  if (!start) redirect("/admin");

  return (
    <section className="mx-auto max-w-lg px-(--padding) py-12">
      <h1 className="text-[2rem]">{copy.mfa.title}</h1>
      <p className="mt-3 text-sm text-mid-1">{copy.mfa.intro}</p>
      <TotpEnrolment secret={start.secret} otpauth={start.otpauth} qrSvg={start.qrSvg} />
      <form action={logoutAction} className="mt-8">
        <button type="submit" className="text-sm text-mid-1 underline underline-offset-4">{copy.shell.logout}</button>
      </form>
    </section>
  );
}

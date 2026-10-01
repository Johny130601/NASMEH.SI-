import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/lib/admin/access";
import { admin as copy } from "@/lib/copy";
import { StaffAccount } from "@/components/admin/StaffAccount";
import { signOutEverywhereAction } from "./actions";

export const metadata: Metadata = { title: copy.account.title, robots: { index: false, follow: false } };

/** /admin/racun — own 2FA state, recovery codes, sign out everywhere. */
export default async function StaffAccountPage() {
  const staff = await requirePagePermission("dashboard:view");
  const user = await db.user.findUnique({ where: { id: staff.id }, select: { totpEnabledAt: true } });
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-[2rem]">{copy.account.title}</h1>
      <dl className="mt-6 grid gap-3 rounded-card border border-light-2 bg-white p-5 text-sm md:grid-cols-[10rem_1fr]">
        <dt className="text-mid-1">{copy.team.columns.email}</dt><dd className="font-medium">{staff.email}</dd>
        <dt className="text-mid-1">{copy.shell.roleLabel}</dt><dd className="font-medium">{copy.roles[staff.role]}</dd>
        <dt className="text-mid-1">{copy.account.mfaStatus}</dt>
        <dd className="font-medium" data-mfa-status>
          {user?.totpEnabledAt ? copy.account.mfaSince.replace("{date}", user.totpEnabledAt.toLocaleDateString("sl-SI")) : copy.team.mfaOff}
        </dd>
      </dl>
      <StaffAccount />
      <form action={signOutEverywhereAction} className="mt-6 rounded-card border border-light-2 bg-white p-5">
        <p className="text-sm text-mid-1">{copy.account.signOutEverywhereHint}</p>
        <p className="mt-1 text-xs text-mid-2">{copy.account.sessionNote}</p>
        <button type="submit" className="mt-4 rounded-btn border border-error px-5 py-2.5 text-sm text-error" data-sign-out-everywhere>
          {copy.account.signOutEverywhere}
        </button>
      </form>
    </section>
  );
}

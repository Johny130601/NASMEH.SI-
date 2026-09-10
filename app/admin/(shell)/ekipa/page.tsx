import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/lib/admin/access";
import { STAFF_ROLES } from "@/lib/admin/permissions";
import { admin as copy } from "@/lib/copy";
import { TeamManager } from "@/components/admin/TeamManager";

export const metadata: Metadata = { title: copy.team.title, robots: { index: false, follow: false } };

/** /admin/ekipa — staff members, roles, 2FA state and session control (§14.15). */
export default async function TeamPage() {
  const actor = await requirePagePermission("staff:manage");
  const members = await db.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, role: true, totpEnabledAt: true, sessionVersion: true },
  });
  return (
    <section className="mx-auto max-w-(--container-wide)">
      <h1 className="text-[2rem]">{copy.team.title}</h1>
      <p className="mt-3 max-w-2xl text-sm text-mid-1">{copy.team.intro}</p>
      <TeamManager
        actorId={actor.id}
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role as (typeof STAFF_ROLES)[number],
          mfaEnabled: member.totpEnabledAt !== null,
          sessionVersion: member.sessionVersion,
        }))}
      />
    </section>
  );
}

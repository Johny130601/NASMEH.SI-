"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  changeStaffRoleAction,
  createStaffMemberAction,
  resetStaffTotpAction,
  revokeStaffSessionsAction,
} from "@/app/admin/(shell)/ekipa/actions";
import { STAFF_ROLES, type StaffRole } from "@/lib/admin/permissions";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput, UiFormField } from "@/components/storefront/ui/UiInput";

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: StaffRole;
  mfaEnabled: boolean;
  sessionVersion: number;
}

const selectClass = "min-h-[2.75rem] rounded-input border border-light-1 bg-white px-3 text-sm outline-none focus:border-brand";

export function TeamManager({ actorId, members }: { actorId: string; members: TeamMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const run = (task: () => Promise<{ ok: boolean }>) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? copy.common.done : copy.common.error);
        router.refresh();
      } catch {
        setMessage(copy.common.error);
      }
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      <form
        className="grid gap-4 rounded-card border border-light-2 bg-white p-5 md:grid-cols-[1fr_1fr_12rem_auto] md:items-end"
        data-team-create
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          setCreated(null);
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await createStaffMemberAction({
                name: String(data.get("name") ?? ""),
                email: String(data.get("email") ?? ""),
                role: String(data.get("role") ?? "SUPPORT") as StaffRole,
              });
              if (!result.ok) {
                setMessage(result.error === "invalid" ? copy.team.invalidEmail : copy.common.error);
                return;
              }
              setCreated(
                result.created && result.temporaryPassword
                  ? copy.team.createdBody.replace("{password}", result.temporaryPassword)
                  : copy.team.promotedBody.replace("{role}", copy.roles[result.role]),
              );
              form.reset();
              router.refresh();
            } catch {
              setMessage(copy.common.error);
            }
          });
        }}
      >
        <h2 className="text-base font-medium md:col-span-4">{copy.team.createTitle}</h2>
        <UiInput label={copy.team.nameLabel} name="name" required maxLength={120} />
        <UiInput label={copy.team.emailLabel} name="email" type="email" required maxLength={254} />
        <UiFormField label={copy.team.roleLabel} htmlFor="team-role">
          <select id="team-role" name="role" defaultValue="SUPPORT" className={selectClass}>
            {STAFF_ROLES.map((role) => <option key={role} value={role}>{copy.roles[role]}</option>)}
          </select>
        </UiFormField>
        <UiButton type="submit" variant="primary" disabled={pending}>{copy.team.create}</UiButton>
        {created ? (
          <p role="status" className="rounded-card border border-success bg-white p-4 text-sm text-dark-1 md:col-span-4" data-team-created>
            <strong>{copy.team.createdTitle}.</strong> {created}
          </p>
        ) : null}
      </form>

      {message ? <p role="status" className="text-sm text-mid-1" data-team-message>{message}</p> : null}

      <div className="overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr>
              <th className="px-4 py-3">{copy.team.columns.name}</th>
              <th className="px-4 py-3">{copy.team.columns.email}</th>
              <th className="px-4 py-3">{copy.team.columns.role}</th>
              <th className="px-4 py-3">{copy.team.columns.mfa}</th>
              <th className="px-4 py-3">{copy.team.columns.sessions}</th>
              <th className="px-4 py-3">{copy.team.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-4 text-mid-2">{copy.team.empty}</td></tr>
            ) : members.map((member) => {
              const self = member.id === actorId;
              return (
                <tr key={member.id} className="border-t border-light-2 align-top" data-team-member={member.email}>
                  <td className="px-4 py-3 font-medium">{member.name ?? copy.common.none}</td>
                  <td className="px-4 py-3 text-mid-1">{member.email}</td>
                  <td className="px-4 py-3">
                    {self ? (
                      <span>{copy.roles[member.role]}</span>
                    ) : (
                      <select
                        aria-label={copy.team.changeRole}
                        className={selectClass}
                        value={member.role}
                        disabled={pending}
                        onChange={(event) => run(() => changeStaffRoleAction({ userId: member.id, role: event.target.value as StaffRole }))}
                      >
                        {STAFF_ROLES.map((role) => <option key={role} value={role}>{copy.roles[role]}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">{member.mfaEnabled ? copy.team.mfaOn : copy.team.mfaOff}</td>
                  <td className="px-4 py-3 text-mid-1">{copy.team.sessionsVersion.replace("{version}", String(member.sessionVersion))}</td>
                  <td className="px-4 py-3">
                    {self ? (
                      <span className="text-xs text-mid-2">{copy.team.selfNote}</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-btn border border-light-1 px-3 py-1.5 text-xs" disabled={pending} onClick={() => run(() => revokeStaffSessionsAction({ userId: member.id }))}>
                          {copy.team.revokeSessions}
                        </button>
                        <button type="button" className="rounded-btn border border-light-1 px-3 py-1.5 text-xs" disabled={pending} onClick={() => { if (window.confirm(copy.team.confirmReset)) run(() => resetStaffTotpAction({ userId: member.id })); }}>
                          {copy.team.resetMfa}
                        </button>
                        <button type="button" className="rounded-btn border border-error px-3 py-1.5 text-xs text-error" disabled={pending} onClick={() => { if (window.confirm(copy.team.confirmDemote)) run(() => changeStaffRoleAction({ userId: member.id, role: "CUSTOMER" })); }}>
                          {copy.team.demote}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTicketAction } from "@/app/admin/(shell)/podpora/[id]/actions";
import { admin as copy } from "@/lib/copy/admin";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField } from "@/components/storefront/ui/UiInput";

const selectClass = "min-h-[3.25rem] w-full rounded-input border border-light-1 bg-white px-4 text-base outline-none focus:border-brand";
const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";

export function TicketActions({
  ticketId,
  status,
  assigneeId,
  internalNote,
  assignees,
}: {
  ticketId: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  assigneeId: string | null;
  internalNote: string | null;
  assignees: Array<{ id: string; name: string | null; email: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="rounded-card border border-light-2 bg-white p-5"
      data-ticket-actions
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await updateTicketAction({
              ticketId, status: String(data.get("status") ?? "OPEN"),
              assigneeId: String(data.get("assigneeId") ?? ""), internalNote: String(data.get("internalNote") ?? ""),
            });
            setMessage(result.ok ? copy.common.done : copy.common.error);
            router.refresh();
          } catch {
            setMessage(copy.common.error);
          }
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <UiFormField label={copy.tickets.detail.status} htmlFor="ticket-status">
          <select id="ticket-status" name="status" defaultValue={status} className={selectClass}>
            {(["OPEN", "IN_PROGRESS", "CLOSED"] as const).map((value) => <option key={value} value={value}>{copy.tickets.statuses[value]}</option>)}
          </select>
        </UiFormField>
        <UiFormField label={copy.tickets.detail.assignee} htmlFor="ticket-assignee">
          <select id="ticket-assignee" name="assigneeId" defaultValue={assigneeId ?? ""} className={selectClass}>
            <option value="">{copy.tickets.detail.unassigned}</option>
            {assignees.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.email}</option>)}
          </select>
        </UiFormField>
      </div>
      <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
        {copy.tickets.detail.internalNote}
        <textarea name="internalNote" rows={3} maxLength={4000} defaultValue={internalNote ?? ""} className={textareaClass} />
      </label>
      <div className="mt-4 flex items-center gap-3">
        <UiButton type="submit" variant="primary" disabled={pending} data-ticket-save>{copy.common.save}</UiButton>
        {message ? <p role="status" className="text-sm text-mid-1" data-ticket-message>{message}</p> : null}
      </div>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anonymiseCustomerAction, saveCustomerNotesAction, type CustomerActionResult } from "@/app/admin/(shell)/stranke/[id]/actions";
import { admin as copy } from "@/lib/copy/admin";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";

const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";

/**
 * Where to go after a successful anonymisation, or null to stay and refresh.
 * A guest page finds the person by the e-mail that erasure has just removed,
 * so reloading it would 404: the list opens with a success notice instead.
 * An account page keeps working (the row stays, anonymised).
 */
export function anonymiseDestination(target: { userId: string } | { email: string }, result: { ok: boolean }): string | null {
  return result.ok && !("userId" in target) ? "/admin/stranke?anonimizirano=1" : null;
}

/** A refusal the operator can act on says why; anything else is the generic failure. */
export function anonymiseMessage(result: CustomerActionResult): string {
  if (result.ok) return copy.common.done;
  const refusals: Record<string, string> = copy.customers.detail.anonymiseRefused;
  return refusals[result.error] ?? copy.common.error;
}

export function CustomerActions({
  target,
  tags,
  adminNotes,
  anonymized,
  permissions,
}: {
  target: { userId: string } | { email: string };
  tags: string[];
  adminNotes: string | null;
  anonymized: boolean;
  permissions: { gdpr: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Each control answers next to itself: an erasure refusal never appears under the notes button (QA T5-10).
  const [notesMessage, setNotesMessage] = useState<string | null>(null);
  const [gdprMessage, setGdprMessage] = useState<string | null>(null);
  const exportHref = "userId" in target
    ? `/admin/stranke/${target.userId}/izvoz.json`
    : `/admin/stranke/gost/izvoz.json?email=${encodeURIComponent(target.email)}`;

  return (
    <div className="flex flex-col gap-4">
      {"userId" in target && !anonymized ? (
        <form
          className="rounded-card border border-light-2 bg-white p-5"
          data-customer-notes
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setNotesMessage(null);
            startTransition(async () => {
              try {
                const result = await saveCustomerNotesAction({ userId: target.userId, tags: String(data.get("tags") ?? ""), adminNotes: String(data.get("adminNotes") ?? "") });
                setNotesMessage(result.ok ? copy.common.done : copy.common.error);
                router.refresh();
              } catch {
                setNotesMessage(copy.common.error);
              }
            });
          }}
        >
          <h2 className="text-base font-medium">{copy.customers.detail.notes}</h2>
          <div className="mt-3 flex flex-col gap-4">
            <UiInput label={copy.customers.detail.tags} name="tags" defaultValue={tags.join(", ")} maxLength={500} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {copy.customers.detail.adminNotes}
              <textarea name="adminNotes" rows={3} maxLength={4000} defaultValue={adminNotes ?? ""} className={textareaClass} />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <UiButton type="submit" variant="outline" disabled={pending}>{copy.common.save}</UiButton>
            {notesMessage ? <p role="status" className="text-sm text-mid-1" data-customer-notes-message>{notesMessage}</p> : null}
          </div>
        </form>
      ) : null}

      {permissions.gdpr ? (
        <section className="rounded-card border border-light-2 bg-white p-5" data-customer-gdpr>
          <div className="flex flex-wrap items-center gap-3">
            <a href={exportHref} className="rounded-btn border border-light-1 px-4 py-2 text-sm" data-customer-export>{copy.customers.detail.export}</a>
            {!anonymized ? (
              <button
                type="button"
                className="rounded-btn border border-error px-4 py-2 text-sm text-error"
                disabled={pending}
                data-customer-anonymise
                onClick={() => {
                  if (!window.confirm(copy.customers.detail.confirmAnonymise)) return;
                  setGdprMessage(null);
                  startTransition(async () => {
                    try {
                      const result = await anonymiseCustomerAction(target);
                      const destination = anonymiseDestination(target, result);
                      if (destination) {
                        router.push(destination);
                        return;
                      }
                      setGdprMessage(anonymiseMessage(result));
                      router.refresh();
                    } catch {
                      setGdprMessage(copy.common.error);
                    }
                  });
                }}
              >
                {copy.customers.detail.anonymise}
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-mid-2">{copy.customers.detail.anonymiseHint}</p>
          {gdprMessage ? <p role="status" className="mt-2 text-sm text-mid-1" data-customer-gdpr-message>{gdprMessage}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

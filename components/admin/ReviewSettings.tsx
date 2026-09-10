"use client";
import { useState, useTransition } from "react";
import { saveReviewSettingsAction } from "@/app/admin/(shell)/ocene/actions";
import { reviews as copy } from "@/lib/copy";
import type { ReviewSettings as Settings } from "@/lib/reviews/settings";
import { UiButton } from "@/components/storefront/ui/UiButton";

/** Only Phase 5 review collection/moderation controls; broader settings are Phase 7. */
export function ReviewSettings({ initial }: { initial: Settings }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="mt-6 flex flex-wrap items-end gap-4 rounded-card border border-light-2 p-5" data-review-settings onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await saveReviewSettingsAction({ autoPublishMinStars: Number(data.get("autoPublishMinStars")) as Settings["autoPublishMinStars"], requestDelayDays: Number(data.get("requestDelayDays")) });
        setMessage(result.ok ? copy.admin.done : copy.admin.error);
      } catch { setMessage(copy.admin.error); }
    });
  }}>
    <label className="flex max-w-full flex-col gap-2 text-sm">{copy.admin.autoPublishLabel}
      <select name="autoPublishMinStars" defaultValue={initial.autoPublishMinStars} className="max-w-full rounded-input border border-light-1 p-3">
        <option value={0}>{copy.admin.autoPublishOff}</option>
        <option value={4}>{copy.admin.autoPublishFour}</option>
        <option value={5}>{copy.admin.autoPublishFive}</option>
      </select>
    </label>
    <label className="flex max-w-full flex-col gap-2 text-sm">{copy.admin.delayLabel}
      <select name="requestDelayDays" defaultValue={initial.requestDelayDays} className="max-w-full rounded-input border border-light-1 p-3">
        {[7, 8, 9, 10].map(days => <option key={days} value={days}>{days}</option>)}
      </select>
    </label>
    <UiButton type="submit" variant="outline" disabled={pending}>{copy.admin.saveSettings}</UiButton>
    {message ? <p role="status" className="w-full text-sm">{message}</p> : null}
  </form>;
}

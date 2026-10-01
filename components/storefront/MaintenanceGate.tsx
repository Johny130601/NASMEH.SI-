"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { unlockMaintenanceAction } from "@/app/(storefront)/actions/maintenance";
import { maintenance as copy } from "@/lib/copy/maintenance";
import { UiButton } from "./ui/UiButton";
import { UiInput } from "./ui/UiInput";

/** Password gate shown while maintenance mode is enabled (§3.6). */
export function MaintenanceGate({ message }: { message?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await unlockMaintenanceAction({ password });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message ?? copy.wrongPassword);
      }
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-(--padding)">
      <section className="w-full max-w-md rounded-card border border-light-2 bg-white p-8 text-center">
        <h1 className="text-[2rem]">{copy.title}</h1>
        {/* An empty or blank operator message means "none": the default text is shown (QA T7-F9). */}
        <p className="mt-3 text-sm text-mid-1">{message?.trim() || copy.body}</p>
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4 text-left">
          <UiInput
            label={copy.passwordLabel}
            name="password"
            type="password"
            autoComplete="off"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error ?? undefined}
          />
          <UiButton type="submit" variant="primary" fullWidth disabled={pending}>
            {copy.submit}
          </UiButton>
        </form>
      </section>
    </main>
  );
}

import type { ReactNode } from "react";
import { auth as copy } from "@/lib/copy/auth";

/** Social-first auth layout (§11.1): the configured OAuth providers' buttons
 *  + "Ali" divider above the credentials form. OAuth is Phase 8 and no provider
 *  is configured yet, so the sign-in and registration pages pass none and the
 *  row renders nothing — no disabled "coming soon" buttons (QA 2026-10-03 t3
 *  N4); a provider slots in here without a redesign. Password recovery shows
 *  the form alone (QA T3). */
export function AuthShell({
  title,
  subtitle,
  social,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Buttons of the configured OAuth providers; nothing renders without them. */
  social?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-md px-(--padding) py-16 md:py-24">
      <h1 className="text-[2rem]">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-mid-1">{subtitle}</p> : null}

      {social ? (
        <>
          <div className="mt-8 flex flex-col gap-3">{social}</div>

          <div className="my-6 flex items-center gap-4" aria-hidden="true">
            <span className="h-px flex-1 bg-light-2" />
            <span className="text-xs uppercase tracking-[0.1em] text-mid-2">
              {copy.social.divider}
            </span>
            <span className="h-px flex-1 bg-light-2" />
          </div>
        </>
      ) : (
        <div className="mt-8" />
      )}

      {children}
    </section>
  );
}

import type { ReactNode } from "react";
import { auth as copy } from "@/lib/copy/auth";
import { UiButton } from "../ui/UiButton";

/** Social-first auth layout (§11.1): OAuth buttons (disabled until Phase 8)
 *  + "Ali" divider above the credentials form. The social row belongs to the
 *  sign-in and registration pages only; password recovery shows the form alone (QA T3). */
export function AuthShell({
  title,
  subtitle,
  social = false,
  children,
}: {
  title: string;
  subtitle?: string;
  social?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-md px-(--padding) py-16 md:py-24">
      <h1 className="text-[2rem]">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-mid-1">{subtitle}</p> : null}

      {social ? (
        <>
          <div className="mt-8 flex flex-col gap-3">
            <UiButton variant="outline" fullWidth disabled title={copy.social.note}>
              Google · {copy.social.note}
            </UiButton>
            <UiButton variant="outline" fullWidth disabled title={copy.social.note}>
              Facebook · {copy.social.note}
            </UiButton>
          </div>

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

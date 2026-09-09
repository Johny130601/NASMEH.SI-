import type { ReactNode } from "react";
import { auth as copy } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";

/** Social-first auth layout (§11.1): OAuth buttons (disabled until Phase 8)
 *  + "Ali" divider above the credentials form. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-md px-(--padding) py-16 md:py-24">
      <h1 className="text-[2rem]">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-mid-1">{subtitle}</p> : null}

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

      {children}
    </section>
  );
}

import type { HTMLAttributes, ReactNode } from "react";

export type UiPillVariant = "neutral" | "brand" | "success" | "error" | "warning";

const variantClasses: Record<UiPillVariant, string> = {
  neutral: "bg-light-3 text-dark-2",
  brand: "bg-brand text-white",
  success: "bg-success text-white",
  error: "bg-error text-white",
  warning: "bg-warning text-dark-1",
};

export interface UiPillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: UiPillVariant;
  children: ReactNode;
}

/** Chip/badge (research 06 §7.1): .5rem radius, .75rem/500. */
export function UiPill({
  variant = "neutral",
  className = "",
  children,
  ...rest
}: UiPillProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-card px-3 py-1.5 text-xs font-medium leading-none",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </span>
  );
}

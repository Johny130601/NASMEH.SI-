import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type UiButtonVariant = "primary" | "sale" | "outline" | "ghost" | "success";

const baseClasses =
  "inline-flex h-[3.25rem] select-none items-center justify-center gap-2 whitespace-nowrap rounded-btn px-8 text-base font-medium leading-none transition-[background-color,color,border-color,transform,opacity] duration-200 ease-out-quart active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<UiButtonVariant, string> = {
  primary: "bg-dark-1 text-white hover:bg-dark-2",
  sale: "bg-brand text-white hover:opacity-90",
  outline: "border border-light-1 bg-white text-dark-1 hover:border-mid-3",
  ghost: "bg-transparent text-dark-1 hover:bg-light-3",
  // the "added" flash (research 06 §6: ATC turns success green)
  success: "bg-success text-white",
};

/** The button look for a link or a control rendered elsewhere (the cart confirmation card). */
export function uiButtonClasses(variant: UiButtonVariant = "primary", fullWidth = false, className = ""): string {
  return [baseClasses, variantClasses[variant], fullWidth ? "w-full" : "", className].filter(Boolean).join(" ");
}

export interface UiButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UiButtonVariant;
  href?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

/** Pill button (research 06 §6): 3rem radius, 52px height, 500 weight, press feedback. */
export function UiButton({
  variant = "primary",
  href,
  fullWidth,
  className = "",
  children,
  ...rest
}: UiButtonProps) {
  const classes = uiButtonClasses(variant, fullWidth, className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

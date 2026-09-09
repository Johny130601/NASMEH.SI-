import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type UiButtonVariant = "primary" | "sale" | "outline" | "ghost";

const baseClasses =
  "inline-flex h-[3.25rem] select-none items-center justify-center gap-2 whitespace-nowrap rounded-btn px-8 text-base font-medium leading-none transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<UiButtonVariant, string> = {
  primary: "bg-dark-1 text-white hover:bg-dark-2",
  sale: "bg-brand text-white hover:opacity-90",
  outline: "border border-light-1 bg-white text-dark-1 hover:border-mid-3",
  ghost: "bg-transparent text-dark-1 hover:bg-light-3",
};

export interface UiButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UiButtonVariant;
  href?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

/** Pill button (research 06 §6): 3rem radius, 52px height, 500 weight. */
export function UiButton({
  variant = "primary",
  href,
  fullWidth,
  className = "",
  children,
  ...rest
}: UiButtonProps) {
  const classes = [
    baseClasses,
    variantClasses[variant],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

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

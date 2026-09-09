import type { Badge } from "@/lib/catalog";
import { UiPill, type UiPillVariant } from "../ui/UiPill";

const STYLE_VARIANTS: Record<Badge["style"], { variant: UiPillVariant; outline: boolean }> = {
  outline: { variant: "neutral", outline: true },
  solid: { variant: "neutral", outline: false },
  grey: { variant: "neutral", outline: false },
  warning: { variant: "warning", outline: false },
  promo: { variant: "brand", outline: false },
};

/** Admin-data-driven badge pill (§5): NOVO outline, Uspešnica, Hitro se
 *  prodaja, Razprodano grey, promo pill. */
export function BadgePill({ badge }: { badge: Badge }) {
  const { variant, outline } = STYLE_VARIANTS[badge.style];
  return (
    <UiPill
      variant={variant}
      className={
        outline
          ? "border border-dark-1 bg-transparent text-dark-1"
          : badge.style === "grey"
            ? "bg-light-1 text-mid-1"
            : badge.style === "solid"
              ? "bg-dark-1 text-white"
              : ""
      }
    >
      {badge.label}
    </UiPill>
  );
}

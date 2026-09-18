import type { Badge } from "@/lib/catalog";
import { UiPill, type UiPillVariant } from "../ui/UiPill";

/**
 * Each admin badge style is its own pill variant. Overriding the neutral
 * variant's background through `className` does not work: two `bg-*`
 * utilities on one element resolve by stylesheet order, and the solid
 * "USPEŠNICA" badge came out white on the light tile (found 2026-09-16).
 */
const STYLE_VARIANTS: Record<Badge["style"], UiPillVariant> = {
  outline: "outline",
  solid: "dark",
  grey: "grey",
  warning: "warning",
  promo: "brand",
};

/** Admin-data-driven badge pill (§5): NOVO outline, Uspešnica, Hitro se
 *  prodaja, Razprodano grey, promo pill. */
export function BadgePill({ badge }: { badge: Badge }) {
  return <UiPill variant={STYLE_VARIANTS[badge.style]}>{badge.label}</UiPill>;
}

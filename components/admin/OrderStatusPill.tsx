import type { OrderStatus } from "@prisma/client";
import { admin as copy } from "@/lib/copy/admin";
import { UiPill } from "@/components/storefront/ui/UiPill";

const variants = {
  PENDING: "warning", PAID: "brand", PROCESSING: "brand", SHIPPED: "brand",
  DELIVERED: "success", CANCELLED: "error", REFUNDED: "neutral",
} as const;

/**
 * The admin's own status pill: the same words as the admin status filter and
 * the dashboard (QA M10), so an unpaid order reads "Čaka na plačilo" on every
 * staff screen whatever the storefront calls it.
 */
export function AdminOrderStatusPill({ status }: { status: OrderStatus }) {
  return <UiPill variant={variants[status]} data-order-status={status}>{copy.dashboard.statuses[status]}</UiPill>;
}

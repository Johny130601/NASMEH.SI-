import type { OrderStatus } from "@prisma/client";
import { account } from "@/lib/copy";
import { UiPill } from "../ui/UiPill";

const variants = {
  PENDING: "warning", PAID: "brand", PROCESSING: "brand", SHIPPED: "brand",
  DELIVERED: "success", CANCELLED: "error", REFUNDED: "neutral",
} as const;

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return <UiPill variant={variants[status]}>{account.statuses[status]}</UiPill>;
}

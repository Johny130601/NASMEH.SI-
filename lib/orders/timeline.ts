import type { Order, Prisma } from "@prisma/client";

/**
 * The order activity log (`Order.timeline`) is a JSON array of
 * `{ at, event, detail? }` entries. Every write appends to what is stored:
 * Prisma's `{ push }` operator does not exist for a Json column (it stores the
 * literal object and the log is gone), so callers build the whole array here.
 * Pure — no database, so the anonymisation and the transitions share it.
 */
export interface TimelineEvent { at: string; event: string; detail?: string }

export function timelinePush(order: Pick<Order, "timeline">, event: string, detail?: string, at = new Date()): Prisma.InputJsonValue {
  const timeline = Array.isArray(order.timeline) ? order.timeline as unknown as TimelineEvent[] : [];
  return [...timeline, { at: at.toISOString(), event, ...(detail ? { detail } : {}) }] as unknown as Prisma.InputJsonValue;
}

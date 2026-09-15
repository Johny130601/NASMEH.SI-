import type { Prisma } from "@prisma/client";
import { STORE_TIME_ZONE } from "@/lib/admin/coupons-schema";

/** Order/invoice numbering: NS-{year}-{seq:05} — Counter row, atomic in tx. */
export function formatOrderNumber(sequence: number, year: number): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new RangeError(`Invalid sequence: ${sequence}`);
  }
  return `NS-${year}-${String(sequence).padStart(5, "0")}`;
}

/** Calendar year in the store's zone: containers run in UTC, so 00:30 on 1 January in Ljubljana is still December there. */
export function storeYear(now: Date): number {
  const year = new Intl.DateTimeFormat("en-US", { timeZone: STORE_TIME_ZONE, year: "numeric" }).formatToParts(now)
    .find((part) => part.type === "year")?.value;
  return Number(year);
}

export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  now = new Date(),
): Promise<string> {
  const row = await tx.counter.upsert({
    where: { key: "order" },
    update: { value: { increment: 1 } },
    create: { key: "order", value: 1 },
  });
  return formatOrderNumber(row.value, storeYear(now));
}

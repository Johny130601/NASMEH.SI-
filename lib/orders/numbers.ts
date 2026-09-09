import type { Prisma } from "@prisma/client";

/** Order/invoice numbering: NS-{year}-{seq:05} — Counter row, atomic in tx. */
export function formatOrderNumber(sequence: number, year: number): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new RangeError(`Invalid sequence: ${sequence}`);
  }
  return `NS-${year}-${String(sequence).padStart(5, "0")}`;
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
  return formatOrderNumber(row.value, now.getFullYear());
}

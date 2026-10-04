import type { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { refundedQuantities } from "@/lib/orders/refunds";
import { likeEscaped } from "./like";
import { isAnonymisedEmail } from "./customers";
import { admin as adminCopy } from "@/lib/copy/admin";

/** Order list, filters, detail and CSV export for /admin/narocila (§14.7). */

export const ORDER_STATUSES: OrderStatus[] = ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];
export const ORDER_PAGE_SIZE = 50;

export interface OrderFilters {
  q: string;
  status: OrderStatus | null;
  from: Date | null;
  to: Date | null;
  provider: string | null;
  country: string | null;
  page: number;
}

type Query = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

function parseDate(value: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Search params of the order list and its CSV export; anything malformed falls back to "no filter". */
export const orderFiltersSchema = z.object({
  q: z.string().trim().transform((value) => value.slice(0, 120)).catch(""),
  status: z.string().trim().toUpperCase().pipe(z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]])).nullable().catch(null),
  od: z.string().trim().regex(DATE).transform((value) => parseDate(value, false)).nullable().catch(null),
  do: z.string().trim().regex(DATE).transform((value) => parseDate(value, true)).nullable().catch(null),
  provider: z.string().trim().toLowerCase().pipe(z.enum(["stripe", "paypal", "test"])).nullable().catch(null),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().catch(null),
  stran: z.coerce.number().int().min(1).max(100_000).catch(1),
});

export function parseOrderFilters(query: Query): OrderFilters {
  const parsed = orderFiltersSchema.parse({
    q: single(query.q), status: single(query.status), od: single(query.od), do: single(query.do), provider: single(query.provider), country: single(query.country),
    stran: single(query.stran) || "1",
  });
  return { q: parsed.q, status: parsed.status, from: parsed.od, to: parsed.do, provider: parsed.provider, country: parsed.country, page: parsed.stran };
}

/** Re-exported for the query tests: the same escaping feeds the raw ILIKE and every `contains` (a bare "%" listed every order, QA T5-06). */
export { likeEscaped };
const NAME_MATCH_LIMIT = 5000;

/**
 * Order ids whose buyer name matches, case-insensitively. The name lives in the
 * shippingAddress JSON and Prisma's JSON filter takes no `mode`, so
 * `string_contains` renders a case-sensitive LIKE that no capitalised name ever
 * matches — staff typing "Novak" found nothing. One bounded ILIKE statement
 * feeds the ids back into the ordinary filter (the same repair as the customer
 * list in lib/admin/customers.ts).
 */
export async function orderNameMatchIds(q: string): Promise<string[]> {
  if (!q) return [];
  const pattern = `%${likeEscaped(q)}%`;
  const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order"
WHERE ("shippingAddress"->>'fullName') ILIKE ${pattern} ORDER BY "createdAt" DESC LIMIT ${NAME_MATCH_LIMIT}`;
  return rows.map((row) => row.id);
}

export function orderWhere(filters: OrderFilters, nameMatchIds: string[] = []): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (filters.q) {
    const q = likeEscaped(filters.q);
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { trackingNumber: { contains: likeEscaped(filters.q.replace(/\s+/g, "").toUpperCase()) } },
      ...(nameMatchIds.length > 0 ? [{ id: { in: nameMatchIds } }] : []),
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) where.createdAt = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  if (filters.provider) where.paymentProvider = filters.provider;
  if (filters.country) where.shippingAddress = { path: ["country"], equals: filters.country };
  return where;
}

export interface OrderListRow {
  id: string;
  number: string;
  createdAt: Date;
  status: OrderStatus;
  email: string;
  customerName: string;
  totalCents: number;
  refundedCents: number;
  paymentProvider: string | null;
  country: string;
  trackingNumber: string | null;
  refundRequired: boolean;
  itemCount: number;
}

function addressField(value: unknown, key: string): string {
  return value && typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "string"
    ? (value as Record<string, string>)[key] : "";
}

export async function listOrders(filters: OrderFilters): Promise<{ rows: OrderListRow[]; total: number; page: number; pages: number }> {
  const where = orderWhere(filters, await orderNameMatchIds(filters.q));
  const total = await db.order.count({ where });
  const pages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const orders = await db.order.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (page - 1) * ORDER_PAGE_SIZE, take: ORDER_PAGE_SIZE,
    select: {
      id: true, number: true, createdAt: true, status: true, email: true, totalCents: true, refundedCents: true,
      paymentProvider: true, shippingAddress: true, trackingNumber: true, refundRequired: true,
      items: { select: { quantity: true } },
    },
  });
  return {
    rows: orders.map((order) => ({
      id: order.id, number: order.number, createdAt: order.createdAt, status: order.status, email: order.email,
      customerName: addressField(order.shippingAddress, "fullName"), totalCents: order.totalCents,
      refundedCents: order.refundedCents, paymentProvider: order.paymentProvider,
      country: addressField(order.shippingAddress, "country"), trackingNumber: order.trackingNumber,
      refundRequired: order.refundRequired, itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    })),
    total, page, pages,
  };
}

/** Awaiting-refund queue (§14.7): captured payments that could not be fulfilled. */
export async function countRefundRequired(): Promise<number> {
  return db.order.count({ where: { refundRequired: true } });
}

export async function loadOrderDetail(number: string) {
  const order = await db.order.findUnique({
    where: { number },
    include: {
      items: true,
      notes: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
      user: { select: { id: true, name: true, email: true, anonymizedAt: true } },
      supportTickets: { select: { id: true, reference: true, topic: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) return null;
  const refunded = refundedQuantities(order.refunds);
  return {
    ...order,
    refundable: order.items.map((item) => ({ orderItemId: item.id, remaining: item.quantity - (refunded.get(item.id) ?? 0) })),
    shippingRefunded: order.refunds.some((refund) => refund.status !== "FAILED" && refund.shippingRefunded),
  };
}

const CSV_HEADER = ["number", "createdAt", "status", "email", "name", "country", "items", "totalEur", "refundedEur", "provider", "trackingNumber", "carrier"];

/** A leading formula trigger (=, +, -, @, tab, CR) would run in a spreadsheet; the cell is prefixed so it stays text. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * One CSV cell. Text cells that a spreadsheet would evaluate as a formula
 * (a buyer named "=HYPERLINK(...)") are neutralised with a leading apostrophe;
 * numbers are written as is. Cells with separators, quotes or line breaks are
 * quoted, quotes doubled. Exported for the unit test only.
 */
export function csvCell(value: string | number): string {
  const text = typeof value === "number" ? String(value) : FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return /[",\r\n;']/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

/** Amounts as plain numbers with a decimal comma (spreadsheets read them as numbers); no currency sign or NBSP. */
export function csvEur(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

const LJUBLJANA_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** `YYYY-MM-DD HH:mm:ss` in the store's time zone (Europe/Ljubljana), not UTC. */
export function csvDateTime(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => LJUBLJANA_PARTS.formatToParts(date).find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

/** UTF-8 with BOM so spreadsheet tools read Slovenian characters; one row per order. */
export async function ordersCsv(filters: OrderFilters): Promise<string> {
  const orders = await db.order.findMany({
    where: orderWhere(filters, await orderNameMatchIds(filters.q)), orderBy: { createdAt: "desc" }, take: 5000,
    select: {
      number: true, createdAt: true, status: true, email: true, shippingAddress: true, totalCents: true,
      refundedCents: true, paymentProvider: true, trackingNumber: true, carrier: true, items: { select: { quantity: true } },
    },
  });
  const rows = orders.map((order) => [
    // an erasure placeholder reads as the label the list shows (QA 2026-10-03 V4-03)
    order.number, csvDateTime(order.createdAt), order.status, isAnonymisedEmail(order.email) ? adminCopy.common.anonymised : order.email, addressField(order.shippingAddress, "fullName"),
    addressField(order.shippingAddress, "country"), order.items.reduce((sum, item) => sum + item.quantity, 0),
    csvEur(order.totalCents), csvEur(order.refundedCents), order.paymentProvider ?? "", order.trackingNumber ?? "", order.carrier ?? "",
  ].map(csvCell).join(";"));
  return `﻿${[CSV_HEADER.join(";"), ...rows].join("\r\n")}\r\n`;
}

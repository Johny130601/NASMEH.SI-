import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatEUR } from "@/lib/pricing";
import { refundedQuantities } from "@/lib/orders/refunds";

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

export function parseOrderFilters(query: Query): OrderFilters {
  const status = single(query.status).toUpperCase();
  const provider = single(query.provider).toLowerCase();
  const country = single(query.country).toUpperCase();
  const page = Number.parseInt(single(query.stran) || "1", 10);
  return {
    q: single(query.q).slice(0, 120),
    status: (ORDER_STATUSES as string[]).includes(status) ? status as OrderStatus : null,
    from: parseDate(single(query.od), false),
    to: parseDate(query.do === undefined ? "" : single(query.do), true),
    provider: ["stripe", "paypal", "test"].includes(provider) ? provider : null,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function orderWhere(filters: OrderFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { trackingNumber: { contains: filters.q.replace(/\s+/g, "").toUpperCase() } },
      { shippingAddress: { path: ["fullName"], string_contains: filters.q } },
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
  const where = orderWhere(filters);
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

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

/** UTF-8 with BOM so spreadsheet tools read Slovenian characters; one row per order. */
export async function ordersCsv(filters: OrderFilters): Promise<string> {
  const orders = await db.order.findMany({
    where: orderWhere(filters), orderBy: { createdAt: "desc" }, take: 5000,
    select: {
      number: true, createdAt: true, status: true, email: true, shippingAddress: true, totalCents: true,
      refundedCents: true, paymentProvider: true, trackingNumber: true, carrier: true, items: { select: { quantity: true } },
    },
  });
  const rows = orders.map((order) => [
    order.number, order.createdAt.toISOString(), order.status, order.email, addressField(order.shippingAddress, "fullName"),
    addressField(order.shippingAddress, "country"), order.items.reduce((sum, item) => sum + item.quantity, 0),
    formatEUR(order.totalCents), formatEUR(order.refundedCents), order.paymentProvider ?? "", order.trackingNumber ?? "", order.carrier ?? "",
  ].map(csvCell).join(";"));
  return `﻿${[CSV_HEADER.join(";"), ...rows].join("\r\n")}\r\n`;
}

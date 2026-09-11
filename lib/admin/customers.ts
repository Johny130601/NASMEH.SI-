import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { removeSupportPhotos } from "@/lib/support/photos";

/** Customers (§14.8): registered accounts and guest purchasers, GDPR export and anonymisation. */

export const CUSTOMER_PAGE_SIZE = 50;
const PAID_STATUSES: ReadonlySet<string> = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED"]);

export interface CustomerFilters { q: string; hasOrders: boolean | null; marketing: boolean | null; page: number }

type Query = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value ?? "").trim();
const tri = (value: string): boolean | null => (value === "da" ? true : value === "ne" ? false : null);

export function parseCustomerFilters(query: Query): CustomerFilters {
  const page = Number.parseInt(single(query.stran) || "1", 10);
  return {
    q: single(query.q).slice(0, 120).toLowerCase(),
    hasOrders: tri(single(query.narocila)),
    marketing: tri(single(query.enovice)),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export interface CustomerRow {
  key: string;
  href: string;
  type: "account" | "guest";
  name: string | null;
  email: string;
  orders: number;
  ltvCents: number;
  marketingOptIn: boolean | null;
  since: Date | null;
  anonymized: boolean;
}

function addressName(value: unknown): string | null {
  return value && typeof value === "object" && typeof (value as { fullName?: unknown }).fullName === "string"
    ? (value as { fullName: string }).fullName : null;
}

/** Accounts and guest orders are merged in memory; both scans are capped and the page says so when a cap is hit. */
export const CUSTOMER_SCAN_LIMIT = 2000;
const GUEST_ORDER_SCAN_LIMIT = 5000;

export async function listCustomers(filters: CustomerFilters): Promise<{ rows: CustomerRow[]; total: number; page: number; pages: number; truncated: boolean }> {
  const [users, guestOrders] = await Promise.all([
    db.user.findMany({
      where: {
        role: "CUSTOMER",
        ...(filters.q ? { OR: [{ email: { contains: filters.q, mode: "insensitive" } }, { name: { contains: filters.q, mode: "insensitive" } }] } : {}),
        ...(filters.marketing !== null ? { marketingOptIn: filters.marketing } : {}),
      },
      select: {
        id: true, email: true, name: true, marketingOptIn: true, createdAt: true, anonymizedAt: true,
        orders: { select: { status: true, totalCents: true, refundedCents: true } },
      },
      orderBy: { createdAt: "desc" },
      take: CUSTOMER_SCAN_LIMIT,
    }),
    db.order.findMany({
      where: { userId: null, ...(filters.q ? { OR: [{ email: { contains: filters.q, mode: "insensitive" } }, { shippingAddress: { path: ["fullName"], string_contains: filters.q } }] } : {}) },
      select: { email: true, status: true, totalCents: true, refundedCents: true, createdAt: true, shippingAddress: true, marketingOptIn: true, anonymizedAt: true },
      orderBy: { createdAt: "desc" },
      take: GUEST_ORDER_SCAN_LIMIT,
    }),
  ]);
  const truncated = users.length >= CUSTOMER_SCAN_LIMIT || guestOrders.length >= GUEST_ORDER_SCAN_LIMIT;

  const rows: CustomerRow[] = users.map((user) => ({
    key: `u:${user.id}`, href: `/admin/stranke/${user.id}`, type: "account", name: user.name, email: user.email,
    orders: user.orders.length,
    ltvCents: user.orders.filter((order) => PAID_STATUSES.has(order.status)).reduce((sum, order) => sum + order.totalCents - order.refundedCents, 0),
    marketingOptIn: user.marketingOptIn, since: user.createdAt, anonymized: user.anonymizedAt !== null,
  }));
  const guests = new Map<string, CustomerRow>();
  for (const order of guestOrders) {
    const existing = guests.get(order.email);
    const paid = PAID_STATUSES.has(order.status) ? order.totalCents - order.refundedCents : 0;
    if (existing) {
      existing.orders += 1;
      existing.ltvCents += paid;
      existing.since = order.createdAt < (existing.since ?? order.createdAt) ? order.createdAt : existing.since;
      existing.name = existing.name ?? addressName(order.shippingAddress);
    } else {
      guests.set(order.email, {
        key: `g:${order.email}`, href: `/admin/stranke/gost?email=${encodeURIComponent(order.email)}`, type: "guest",
        name: addressName(order.shippingAddress), email: order.email, orders: 1, ltvCents: paid,
        marketingOptIn: order.marketingOptIn, since: order.createdAt, anonymized: order.anonymizedAt !== null,
      });
    }
  }
  let merged = [...rows, ...guests.values()];
  if (filters.hasOrders !== null) merged = merged.filter((row) => (row.orders > 0) === filters.hasOrders);
  if (filters.marketing !== null) merged = merged.filter((row) => row.marketingOptIn === filters.marketing);
  merged.sort((a, b) => (b.since?.getTime() ?? 0) - (a.since?.getTime() ?? 0));
  const total = merged.length;
  const pages = Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  return { rows: merged.slice((page - 1) * CUSTOMER_PAGE_SIZE, page * CUSTOMER_PAGE_SIZE), total, page, pages, truncated };
}

const orderSelect = {
  id: true, number: true, status: true, totalCents: true, refundedCents: true, createdAt: true, paidAt: true,
} satisfies Prisma.OrderSelect;

export async function loadCustomer(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, role: true, marketingOptIn: true, emailVerified: true, createdAt: true,
      adminNotes: true, tags: true, anonymizedAt: true,
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      orders: { select: orderSelect, orderBy: { createdAt: "desc" }, take: 200 },
      marketingOptIns: { select: { id: true, kind: true, version: true, choices: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 },
      supportTickets: { select: { id: true, reference: true, topic: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 },
      _count: { select: { reviews: true } },
    },
  });
  if (!user) return null;
  return {
    ...user,
    ltvCents: user.orders.filter((order) => PAID_STATUSES.has(order.status)).reduce((sum, order) => sum + order.totalCents - order.refundedCents, 0),
    subscriber: await db.subscriber.findUnique({ where: { email: user.email }, select: { status: true } }),
  };
}

export async function loadGuest(email: string) {
  const normalised = email.trim().toLowerCase();
  const orders = await db.order.findMany({
    where: { userId: null, email: normalised }, select: { ...orderSelect, shippingAddress: true, anonymizedAt: true }, orderBy: { createdAt: "desc" }, take: 200,
  });
  if (orders.length === 0) return null;
  const tickets = await db.ticket.findMany({
    where: { userId: null, email: normalised }, select: { id: true, reference: true, topic: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100,
  });
  return {
    email: normalised,
    name: orders.map((order) => addressName(order.shippingAddress)).find(Boolean) ?? null,
    orders, tickets,
    anonymizedAt: orders.every((order) => order.anonymizedAt) ? orders[0].anonymizedAt : null,
    ltvCents: orders.filter((order) => PAID_STATUSES.has(order.status)).reduce((sum, order) => sum + order.totalCents - order.refundedCents, 0),
    subscriber: await db.subscriber.findUnique({ where: { email: normalised }, select: { status: true } }),
  };
}

export type CustomerTarget = { userId: string } | { email: string };

/** GDPR data export: every row the store holds about the person, as one JSON document. */
export async function exportCustomerData(target: CustomerTarget): Promise<Record<string, unknown> | null> {
  if ("userId" in target) {
    const user = await db.user.findUnique({
      where: { id: target.userId },
      include: {
        addresses: true,
        orders: { include: { items: true, notes: { where: { visibleToCustomer: true } }, refunds: true } },
        reviews: true,
        marketingOptIns: true,
        supportTickets: { include: { attachments: { select: { id: true, size: true, createdAt: true } } } },
      },
    });
    if (!user) return null;
    const { passwordHash: _hash, totpSecret: _secret, totpRecoveryCodes: _codes, totpLastStep: _step, sessionVersion: _version, ...profile } = user;
    void _hash; void _secret; void _codes; void _step; void _version;
    return {
      exportedAt: new Date().toISOString(),
      profile: { ...profile, addresses: undefined, orders: undefined, reviews: undefined, marketingOptIns: undefined, supportTickets: undefined },
      addresses: user.addresses, orders: user.orders, reviews: user.reviews, consents: user.marketingOptIns, tickets: user.supportTickets,
      subscriptions: await db.subscriber.findMany({ where: { email: user.email } }),
      backInStock: await db.backInStockSubscription.findMany({ where: { email: user.email } }),
    };
  }
  const email = target.email.trim().toLowerCase();
  const orders = await db.order.findMany({ where: { userId: null, email }, include: { items: true, notes: { where: { visibleToCustomer: true } }, refunds: true } });
  if (orders.length === 0) return null;
  return {
    exportedAt: new Date().toISOString(),
    profile: { email, guest: true },
    orders,
    tickets: await db.ticket.findMany({ where: { userId: null, email }, include: { attachments: { select: { id: true, size: true, createdAt: true } } } }),
    subscriptions: await db.subscriber.findMany({ where: { email } }),
    backInStock: await db.backInStockSubscription.findMany({ where: { email } }),
  };
}

function scrubbedAddress(value: unknown): Prisma.InputJsonValue {
  const country = value && typeof value === "object" && typeof (value as { country?: unknown }).country === "string"
    ? (value as { country: string }).country : "";
  return { country, anonymized: true };
}

/**
 * Anonymisation (§14.8): PII is replaced or deleted, order financials, refunds,
 * consent records and review content stay. Irreversible; sessions are revoked.
 */
export async function anonymiseCustomer(target: CustomerTarget, actorName: string): Promise<{ ok: true; orders: number; tickets: number } | { ok: false; reason: "not_found" | "staff" }> {
  const now = new Date();
  const attachmentsToRemove: Array<{ filename: string }> = [];
  const result = await db.$transaction(async (tx) => {
    let email: string;
    let userId: string | null = null;
    if ("userId" in target) {
      const user = await tx.user.findUnique({ where: { id: target.userId }, select: { id: true, email: true, role: true } });
      if (!user) return { ok: false as const, reason: "not_found" as const };
      if (user.role !== "CUSTOMER") return { ok: false as const, reason: "staff" as const };
      userId = user.id;
      email = user.email;
      const anonymisedEmail = `anonymised-${user.id}@invalid`;
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: anonymisedEmail, name: null, image: null, passwordHash: null, emailVerified: null, marketingOptIn: false,
          adminNotes: null, tags: [], anonymizedAt: now, sessionVersion: { increment: 1 },
        },
      });
      await tx.address.deleteMany({ where: { userId: user.id } });
      await tx.authToken.deleteMany({ where: { userId: user.id } });
      await tx.cart.deleteMany({ where: { userId: user.id } });
      await tx.review.updateMany({ where: { userId: user.id }, data: { userId: null } });
    } else {
      email = target.email.trim().toLowerCase();
      const exists = await tx.order.count({ where: { userId: null, email } });
      if (exists === 0) return { ok: false as const, reason: "not_found" as const };
    }
    const orderWhere: Prisma.OrderWhereInput = userId ? { OR: [{ userId }, { email }] } : { userId: null, email };
    const orders = await tx.order.findMany({ where: orderWhere, select: { id: true, shippingAddress: true, billingAddress: true } });
    for (const order of orders) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          email: userId ? `anonymised-${userId}@invalid` : `anonymised-${order.id}@invalid`, phone: null,
          shippingAddress: scrubbedAddress(order.shippingAddress),
          billingAddress: order.billingAddress ? scrubbedAddress(order.billingAddress) : Prisma.DbNull,
          anonymizedAt: now,
          timeline: { push: { at: now.toISOString(), event: "anonymised", detail: actorName } },
        },
      });
    }
    const tickets = await tx.ticket.findMany({ where: userId ? { OR: [{ userId }, { email }] } : { userId: null, email }, select: { id: true, attachments: { select: { filename: true } } } });
    for (const ticket of tickets) {
      attachmentsToRemove.push(...ticket.attachments);
      await tx.ticketAttachment.deleteMany({ where: { ticketId: ticket.id } });
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { name: "—", email: `anonymised-${ticket.id}@invalid`, message: "[anonimizirano]", details: Prisma.DbNull, internalNote: null },
      });
    }
    await tx.couponRedemption.updateMany({ where: { email }, data: { email: `anonymised@invalid` } });
    await tx.abandonedCheckout.deleteMany({ where: { email } });
    await tx.subscriber.deleteMany({ where: { email } });
    await tx.backInStockSubscription.deleteMany({ where: { email } });
    return { ok: true as const, orders: orders.length, tickets: tickets.length };
  }, { maxWait: 10_000, timeout: 30_000 });
  if (result.ok && attachmentsToRemove.length) await removeSupportPhotos(attachmentsToRemove);
  return result;
}

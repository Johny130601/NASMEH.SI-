import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { marketingVersion, recordConsent } from "@/lib/consent-log";
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
      select: { email: true, status: true, totalCents: true, refundedCents: true, createdAt: true, shippingAddress: true, anonymizedAt: true },
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
        marketingOptIn: false, since: order.createdAt, anonymized: order.anonymizedAt !== null,
      });
    }
  }
  // A guest's consent is a confirmed newsletter double opt-in; Order.marketingOptIn only records the request.
  if (guests.size > 0) {
    const confirmed = await db.subscriber.findMany({
      where: { email: { in: [...guests.keys()] }, status: "CONFIRMED" }, select: { email: true },
    });
    for (const { email } of confirmed) {
      const guest = guests.get(email);
      if (guest) guest.marketingOptIn = true;
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

// ---------- the data subject (GDPR Arts. 15, 17, 20) ----------

export type CustomerTarget = { userId: string } | { email: string };

/**
 * The person behind an admin GDPR action. An account is found by id; a guest
 * by ANY row that carries the e-mail without an account link: a guest order or
 * ticket, a newsletter or back-in-stock subscription, or an abandoned checkout.
 * Lookup, export and anonymisation all resolve through here and match rows with
 * the same where-builders, so an export covers every row anonymisation touches.
 */
export type CustomerSubject =
  | { type: "account"; userId: string; email: string; role: Role; marketingOptIn: boolean }
  | { type: "guest"; userId: null; email: string };

type SubjectClient = Pick<Prisma.TransactionClient, "user" | "order" | "ticket" | "subscriber" | "backInStockSubscription" | "abandonedCheckout">;

export async function resolveCustomerSubject(client: SubjectClient, target: CustomerTarget): Promise<CustomerSubject | null> {
  if ("userId" in target) {
    const user = await client.user.findUnique({ where: { id: target.userId }, select: { id: true, email: true, role: true, marketingOptIn: true } });
    return user ? { type: "account", userId: user.id, email: user.email, role: user.role, marketingOptIn: user.marketingOptIn } : null;
  }
  const email = target.email.trim().toLowerCase();
  if (!email) return null;
  const select = { id: true } as const;
  const found = await client.order.findFirst({ where: { userId: null, email }, select })
    ?? await client.ticket.findFirst({ where: { userId: null, email }, select })
    ?? await client.subscriber.findFirst({ where: { email }, select })
    ?? await client.backInStockSubscription.findFirst({ where: { email }, select })
    ?? await client.abandonedCheckout.findFirst({ where: { email }, select });
  return found ? { type: "guest", userId: null, email } : null;
}

/**
 * Ownership rule: an account owns the rows linked to its id plus unlinked
 * (logged-out) rows under its e-mail; a guest owns only unlinked rows. A row
 * linked to a different account is never exported, shown or erased, even when
 * it carries this e-mail (a signed-in person can type any address at checkout
 * or in a support form).
 */
export function subjectOrderWhere(subject: CustomerSubject): Prisma.OrderWhereInput {
  return subject.userId ? { OR: [{ userId: subject.userId }, { userId: null, email: subject.email }] } : { userId: null, email: subject.email };
}

export function subjectTicketWhere(subject: CustomerSubject): Prisma.TicketWhereInput {
  return subject.userId ? { OR: [{ userId: subject.userId }, { userId: null, email: subject.email }] } : { userId: null, email: subject.email };
}

/** Reviews: the account's own, plus unlinked reviews of the subject's order items. */
export function subjectReviewWhere(subject: CustomerSubject, orderItemIds: string[]): Prisma.ReviewWhereInput {
  return { OR: [...(subject.userId ? [{ userId: subject.userId }] : []), { userId: null, orderItemId: { in: orderItemIds } }] };
}

export interface ConsentReferences { orderNumbers: string[]; subscriberIds: string[]; subscriptionIds: string[] }

export interface ConsentEntry { id: string; kind: string; version: string; choices: Prisma.JsonValue; createdAt: Date }

/**
 * Unlinked ConsentLog rows that name one of the subject's own records in
 * `choices` (order number, subscriber id, back-in-stock subscription id). Rows
 * linked to an account are read by userId instead, so another account's rows
 * never match. One statement with one array per key: the WHERE does not grow
 * with the order count, and cookie rows (the bulk of the table, never carrying
 * a reference) are excluded up front. The expressions match the partial
 * indexes requested for this lookup (`("choices"->>'<key>') WHERE "kind" <> 'cookie'`).
 */
export function consentReferenceQuery(refs: ConsentReferences, take?: number): Prisma.Sql | null {
  if (!refs.orderNumbers.length && !refs.subscriberIds.length && !refs.subscriptionIds.length) return null;
  const limit = take ? Prisma.sql` LIMIT ${take}` : Prisma.empty;
  return Prisma.sql`SELECT "id", "kind", "version", "choices", "createdAt" FROM "ConsentLog"
WHERE "kind" <> 'cookie' AND "userId" IS NULL
AND (("choices"->>'orderNumber') = ANY(${refs.orderNumbers}::text[])
  OR ("choices"->>'subscriberId') = ANY(${refs.subscriberIds}::text[])
  OR ("choices"->>'subscriptionId') = ANY(${refs.subscriptionIds}::text[]))
ORDER BY "createdAt" DESC, "id" DESC${limit}`;
}

const consentSelect = { id: true, kind: true, version: true, choices: true, createdAt: true } satisfies Prisma.ConsentLogSelect;

/**
 * ConsentLog rows of the subject: linked to the account (indexed userId), or
 * unlinked and referencing the subject's records. Rows that store no subject
 * reference (anonymous cookie choices) cannot be matched to a person. The two
 * sets are disjoint (userId = x vs userId IS NULL); newest first.
 */
async function subjectConsents(subject: CustomerSubject, refs: ConsentReferences, take?: number): Promise<ConsentEntry[]> {
  const reference = consentReferenceQuery(refs, take);
  const [linked, referenced] = await Promise.all([
    subject.userId
      ? db.consentLog.findMany({ where: { userId: subject.userId }, select: consentSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(take ? { take } : {}) })
      : Promise.resolve([]),
    reference ? db.$queryRaw<ConsentEntry[]>(reference) : Promise.resolve([]),
  ]);
  const rows = [...linked, ...referenced].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return take ? rows.slice(0, take) : rows;
}

const orderSelect = {
  id: true, number: true, status: true, totalCents: true, refundedCents: true, createdAt: true, paidAt: true,
} satisfies Prisma.OrderSelect;

const ticketListSelect = { id: true, reference: true, topic: true, status: true, createdAt: true, name: true } satisfies Prisma.TicketSelect;

/** The e-mail-keyed rows shown on both detail pages, matched exactly as export and anonymisation match them. */
async function subjectRecords(subject: CustomerSubject) {
  const [orders, tickets, subscriber, backInStock, abandonedCheckouts] = await Promise.all([
    db.order.findMany({ where: subjectOrderWhere(subject), select: { ...orderSelect, shippingAddress: true, anonymizedAt: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.ticket.findMany({ where: subjectTicketWhere(subject), select: ticketListSelect, orderBy: { createdAt: "desc" }, take: 100 }),
    db.subscriber.findUnique({ where: { email: subject.email }, select: { id: true, status: true } }),
    db.backInStockSubscription.findMany({ where: { email: subject.email }, select: { id: true, status: true, createdAt: true, product: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.abandonedCheckout.findMany({ where: { email: subject.email }, select: { id: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  const consents = await subjectConsents(subject, {
    orderNumbers: orders.map((order) => order.number), subscriberIds: subscriber ? [subscriber.id] : [], subscriptionIds: backInStock.map((row) => row.id),
  }, 50);
  return {
    orders, tickets, subscriber, backInStock, abandonedCheckouts, consents,
    ltvCents: orders.filter((order) => PAID_STATUSES.has(order.status)).reduce((sum, order) => sum + order.totalCents - order.refundedCents, 0),
  };
}

export async function loadCustomer(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, role: true, marketingOptIn: true, emailVerified: true, createdAt: true,
      adminNotes: true, tags: true, anonymizedAt: true,
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      _count: { select: { reviews: true } },
    },
  });
  if (!user) return null;
  const subject: CustomerSubject = { type: "account", userId: user.id, email: user.email, role: user.role, marketingOptIn: user.marketingOptIn };
  return { ...user, ...(await subjectRecords(subject)) };
}

/** A guest found by e-mail through any e-mail-bearing row, with or without orders. */
export async function loadGuest(email: string) {
  const subject = await resolveCustomerSubject(db, { email });
  if (!subject) return null;
  const records = await subjectRecords(subject);
  const { orders, tickets } = records;
  return {
    ...records,
    email: subject.email,
    name: orders.map((order) => addressName(order.shippingAddress)).find(Boolean) ?? tickets.map((ticket) => ticket.name).find((name) => name && name !== "—") ?? null,
    anonymizedAt: orders.length > 0 && orders.every((order) => order.anonymizedAt) ? orders[0].anonymizedAt : null,
  };
}

/** The find-by-e-mail entry forwards an address that belongs to an account to the account page. */
export async function findCustomerAccountId(email: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
  return user?.id ?? null;
}

// ---------- GDPR export (Arts. 15, 20) ----------

/** Order data the person can be given: no provider keys, checkout key, delivery leases or internal notes. */
const exportOrderSelect = {
  id: true, number: true, status: true, email: true, phone: true, currency: true,
  subtotalCents: true, discountCents: true, shippingCents: true, shippingMethod: true, totalCents: true, vatCents: true, vatRatePercent: true,
  shippingAddress: true, billingAddress: true, paymentProvider: true, trackingNumber: true, carrier: true,
  invoiceNumber: true, invoiceIssuedAt: true, invoiceSnapshot: true, legalAcceptance: true, couponCode: true, marketingOptIn: true,
  paidAt: true, shippedAt: true, deliveredAt: true, refundedCents: true, anonymizedAt: true, createdAt: true,
  items: { select: { id: true, title: true, sku: true, unitPriceCents: true, vatRatePercent: true, quantity: true, discountLabel: true, giftLabel: true } },
  notes: { where: { visibleToCustomer: true }, select: { body: true, createdAt: true }, orderBy: { createdAt: "asc" } },
  refunds: { select: { status: true, amountCents: true, vatCents: true, shippingRefunded: true, createdAt: true, completedAt: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderSelect;

/** Ticket content with attachment file names (never the bytes) and the customer receipt deliveries. */
const exportTicketSelect = {
  id: true, reference: true, topic: true, reason: true, status: true, name: true, email: true, message: true, details: true,
  orderNumber: true, privacyAcceptedAt: true, privacyVersion: true, createdAt: true, updatedAt: true,
  attachments: { select: { filename: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } },
  deliveries: { where: { kind: "CUSTOMER" }, select: { recipient: true, sentAt: true, createdAt: true } },
} satisfies Prisma.TicketSelect;

/**
 * GDPR data export: every row the store holds about the person, as one JSON
 * document, matched with the same where-builders anonymisation uses. Secrets
 * stay out (password and TOTP fields, confirmation, recovery and checkout
 * tokens). Internal order notes, ticket notes and assignees, refund reasons and
 * the order timeline are left out; the account's admin notes and tags stay in,
 * as before (whether staff text belongs in an access copy is a D4 question).
 * Photo attachments are listed by file name only.
 */
export async function exportCustomerData(target: CustomerTarget): Promise<Record<string, unknown> | null> {
  const subject = await resolveCustomerSubject(db, target);
  if (!subject) return null;
  const { email, userId } = subject;
  const [profile, addresses, cart, orders, tickets, subscriptions, backInStock, abandonedCheckouts, couponRedemptions] = await Promise.all([
    userId ? db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, emailVerified: true, image: true, marketingOptIn: true, createdAt: true, updatedAt: true, adminNotes: true, tags: true, anonymizedAt: true },
    }) : Promise.resolve({ email, guest: true }),
    userId ? db.address.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    userId ? db.cart.findUnique({
      where: { userId },
      select: { createdAt: true, updatedAt: true, items: { select: { quantity: true, variant: { select: { sku: true, title: true, product: { select: { title: true } } } } } } },
    }) : Promise.resolve(null),
    db.order.findMany({ where: subjectOrderWhere(subject), select: exportOrderSelect, orderBy: { createdAt: "asc" } }),
    db.ticket.findMany({ where: subjectTicketWhere(subject), select: exportTicketSelect, orderBy: { createdAt: "asc" } }),
    db.subscriber.findMany({ where: { email }, select: { id: true, email: true, status: true, source: true, confirmedAt: true, createdAt: true, updatedAt: true } }),
    db.backInStockSubscription.findMany({
      where: { email },
      select: { id: true, email: true, status: true, source: true, confirmedAt: true, notifiedAt: true, createdAt: true, updatedAt: true, product: { select: { slug: true, title: true } }, variant: { select: { sku: true } } },
    }),
    db.abandonedCheckout.findMany({ where: { email }, select: { id: true, email: true, cartSnapshot: true, createdAt: true, updatedAt: true } }),
    // A redemption belongs to its order, so it follows the order ownership rule.
    db.couponRedemption.findMany({ where: { order: subjectOrderWhere(subject) }, select: { email: true, createdAt: true, coupon: { select: { code: true } }, order: { select: { number: true } } } }),
  ]);
  const orderItemIds = orders.flatMap((order) => order.items.map((item) => item.id));
  const [reviews, consents] = await Promise.all([
    db.review.findMany({
      where: subjectReviewWhere(subject, orderItemIds),
      select: { id: true, orderItemId: true, rating: true, title: true, text: true, photos: true, attributes: true, status: true, merchantReply: true, createdAt: true, updatedAt: true, product: { select: { slug: true, title: true } } },
      orderBy: { createdAt: "asc" },
    }),
    subjectConsents(subject, {
      orderNumbers: orders.map((order) => order.number), subscriberIds: subscriptions.map((row) => row.id), subscriptionIds: backInStock.map((row) => row.id),
    }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile, addresses, cart, orders, reviews, tickets, subscriptions, backInStock, abandonedCheckouts, couponRedemptions, consents,
  };
}

// ---------- anonymisation (Art. 17) ----------

function scrubbedAddress(value: unknown): Prisma.InputJsonValue {
  const country = value && typeof value === "object" && typeof (value as { country?: unknown }).country === "string"
    ? (value as { country: string }).country : "";
  return { country, anonymized: true };
}

const ANONYMISED_TEXT = "[anonimizirano]";

/**
 * Anonymisation (§14.8): PII is replaced or deleted. Kept: order financials,
 * refunds, the issued invoice snapshot (tax retention), consent records (proof)
 * and review content. A withdrawal row is logged when the person had opted in
 * to marketing. Irreversible; sessions are revoked.
 */
export async function anonymiseCustomer(target: CustomerTarget, actorName: string): Promise<{ ok: true; orders: number; tickets: number } | { ok: false; reason: "not_found" | "staff" }> {
  const now = new Date();
  const attachmentsToRemove: Array<{ filename: string }> = [];
  const result = await db.$transaction(async (tx) => {
    const subject = await resolveCustomerSubject(tx, target);
    if (!subject) return { ok: false as const, reason: "not_found" as const };
    if (subject.type === "account" && subject.role !== "CUSTOMER") return { ok: false as const, reason: "staff" as const };
    const { email, userId } = subject;
    const orders = await tx.order.findMany({
      where: subjectOrderWhere(subject), select: { id: true, number: true, shippingAddress: true, billingAddress: true }, orderBy: { createdAt: "desc" },
    });
    const subscriber = await tx.subscriber.findUnique({ where: { email }, select: { id: true, status: true } });

    // Consent proof stays; the end of an active opt-in is appended like any other withdrawal.
    // Only a given consent can end: the account's own choice or a confirmed newsletter
    // subscription. Order.marketingOptIn records a double opt-in request, not a consent.
    const optedIn = subject.type === "account" && subject.marketingOptIn;
    const confirmedSubscriber = subscriber?.status === "CONFIRMED" ? subscriber : null;
    if (optedIn || confirmedSubscriber) {
      await recordConsent(tx, {
        kind: "marketing-preference", version: marketingVersion("marketing-preference"), userId,
        choices: {
          marketing: false, previous: true, reason: "anonymised",
          ...(confirmedSubscriber ? { subscriberId: confirmedSubscriber.id } : {}),
          ...(subject.type === "guest" && orders[0] ? { orderNumber: orders[0].number } : {}),
        },
      });
    }

    if (userId) {
      const anonymisedEmail = `anonymised-${userId}@invalid`;
      await tx.user.update({
        where: { id: userId },
        data: {
          email: anonymisedEmail, name: null, image: null, passwordHash: null, emailVerified: null, marketingOptIn: false,
          adminNotes: null, tags: [], anonymizedAt: now, sessionVersion: { increment: 1 },
        },
      });
      await tx.address.deleteMany({ where: { userId } });
      await tx.authToken.deleteMany({ where: { userId } });
      await tx.cart.deleteMany({ where: { userId } });
      await tx.review.updateMany({ where: { userId }, data: { userId: null } });
    }
    for (const order of orders) {
      // invoiceSnapshot and legalAcceptance are deliberately not written: the issued invoice is a tax record.
      await tx.order.update({
        where: { id: order.id },
        data: {
          email: userId ? `anonymised-${userId}@invalid` : `anonymised-${order.id}@invalid`, phone: null,
          shippingAddress: scrubbedAddress(order.shippingAddress),
          billingAddress: order.billingAddress ? scrubbedAddress(order.billingAddress) : Prisma.DbNull,
          anonymizedAt: now,
          // A queued confirmation or shipment mail has no recipient left; the retry must not pick it up.
          confirmationEmailPending: false, shippedEmailPending: false,
          timeline: { push: { at: now.toISOString(), event: "anonymised", detail: actorName } },
        },
      });
    }
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length) {
      await tx.couponRedemption.updateMany({ where: { orderId: { in: orderIds } }, data: { email: `anonymised@invalid` } });
      // Notes the customer saw, and any staff text quoting the address, are free text that may identify the person.
      await tx.orderNote.updateMany({
        where: { orderId: { in: orderIds }, OR: [{ visibleToCustomer: true }, { body: { contains: email, mode: "insensitive" } }] },
        data: { body: ANONYMISED_TEXT },
      });
      await tx.refund.updateMany({ where: { orderId: { in: orderIds }, reason: { contains: email, mode: "insensitive" } }, data: { reason: ANONYMISED_TEXT } });
    }
    const tickets = await tx.ticket.findMany({ where: subjectTicketWhere(subject), select: { id: true, attachments: { select: { filename: true } } } });
    for (const ticket of tickets) {
      attachmentsToRemove.push(...ticket.attachments);
      await tx.ticketAttachment.deleteMany({ where: { ticketId: ticket.id } });
      // Unsent mail is voided: a receipt must never go out to the old address, and a staff alert
      // would carry only the scrubbed text while its reply-to is no longer deliverable, so the daily
      // retry could never finish it. Sent receipts keep their history without the address.
      await tx.ticketEmailDelivery.deleteMany({ where: { ticketId: ticket.id, sentAt: null } });
      await tx.ticketEmailDelivery.updateMany({ where: { ticketId: ticket.id, kind: "CUSTOMER" }, data: { recipient: `anonymised-${ticket.id}@invalid`, lastError: null } });
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { name: "—", email: `anonymised-${ticket.id}@invalid`, message: ANONYMISED_TEXT, details: Prisma.DbNull, internalNote: null },
      });
    }
    await tx.abandonedCheckout.deleteMany({ where: { email } });
    await tx.subscriber.deleteMany({ where: { email } });
    await tx.backInStockSubscription.deleteMany({ where: { email } });
    return { ok: true as const, orders: orders.length, tickets: tickets.length };
  }, { maxWait: 10_000, timeout: 30_000 });
  if (result.ok && attachmentsToRemove.length) await removeSupportPhotos(attachmentsToRemove);
  return result;
}

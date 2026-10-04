import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { marketingVersion, recordConsent } from "@/lib/consent-log";
import { timelinePush } from "@/lib/orders/timeline";
import { removeSupportPhotos } from "@/lib/support/photos";
import { likeEscaped } from "./like";

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

interface GuestOrderRow {
  email: string; status: string; totalCents: number; refundedCents: number;
  createdAt: Date; shippingAddress: Prisma.JsonValue; anonymizedAt: Date | null;
}

const guestOrderSelect = {
  email: true, status: true, totalCents: true, refundedCents: true, createdAt: true, shippingAddress: true, anonymizedAt: true,
} satisfies Prisma.OrderSelect;

/**
 * Guest purchasers, newest first, capped like the account scan. The name lives
 * in the shippingAddress JSON, and Prisma's JSON filter takes no `mode`, so
 * `string_contains` renders a case-sensitive LIKE that no capitalised name ever
 * matches: the search runs as one ILIKE statement over both columns instead.
 *
 * Anonymised orders are left out (QA 2026-10-03 T4-07): erasure gives each
 * guest order its own placeholder address (`anonymised-<orderId>@invalid`), so
 * they would come back as one pseudo-customer per order. The orders stay in
 * the order list; the person is gone.
 */
function scanGuestOrders(q: string): Promise<GuestOrderRow[]> {
  if (!q) {
    return db.order.findMany({ where: { userId: null, anonymizedAt: null }, select: guestOrderSelect, orderBy: { createdAt: "desc" }, take: GUEST_ORDER_SCAN_LIMIT });
  }
  const pattern = `%${likeEscaped(q)}%`;
  return db.$queryRaw<GuestOrderRow[]>`SELECT "email", "status", "totalCents", "refundedCents", "createdAt", "shippingAddress", "anonymizedAt"
FROM "Order" WHERE "userId" IS NULL AND "anonymizedAt" IS NULL AND ("email" ILIKE ${pattern} OR ("shippingAddress"->>'fullName') ILIKE ${pattern})
ORDER BY "createdAt" DESC LIMIT ${GUEST_ORDER_SCAN_LIMIT}`;
}

/** An erasure placeholder (`anonymised-<id>@invalid`, `anonymised@invalid`): staff screens show a neutral label instead (T4-07). */
export function isAnonymisedEmail(email: string): boolean {
  return /^anonymised(-[^@\s]*)?@invalid$/.test(email);
}

export async function listCustomers(filters: CustomerFilters): Promise<{ rows: CustomerRow[]; total: number; page: number; pages: number; truncated: boolean }> {
  const [users, guestOrders] = await Promise.all([
    db.user.findMany({
      where: {
        role: "CUSTOMER",
        // An erased account keeps its row for the order history (its page says when it was
        // anonymised), but it is no longer a person to list under a placeholder address (T4-07).
        anonymizedAt: null,
        // Prisma's `contains` does not escape % and _ either: a bare "%" listed every account.
        ...(filters.q ? { OR: [{ email: { contains: likeEscaped(filters.q), mode: "insensitive" } }, { name: { contains: likeEscaped(filters.q), mode: "insensitive" } }] } : {}),
        ...(filters.marketing !== null ? { marketingOptIn: filters.marketing } : {}),
      },
      select: {
        id: true, email: true, name: true, marketingOptIn: true, createdAt: true, anonymizedAt: true,
        orders: { select: { status: true, totalCents: true, refundedCents: true } },
      },
      orderBy: { createdAt: "desc" },
      take: CUSTOMER_SCAN_LIMIT,
    }),
    scanGuestOrders(filters.q),
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
 * the same where-builders, so the export reads the same rows the erasure writes —
 * bar the secrets and internal staff text `exportCustomerData` lists as left out.
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

function addressText(value: unknown, key: "fullName" | "phone"): string | null {
  return value && typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "string"
    ? (value as Record<string, string>)[key] : null;
}

/** Compared without case or diacritics: staff may type "Kovac" for "Kovač". */
const folded = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const regExpEscaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The national part of a phone number: "+386 41 123 456", "041 123 456" and "041/123-456" share it. */
const PHONE_KEY_DIGITS = 8;

export interface PersonIdentifiers {
  /** The e-mail, every full name and each name word of 3+ letters, folded. */
  terms: string[];
  /** The last digits of every phone number, however it was typed. */
  phones: string[];
}

/**
 * What staff free text may quote about the person: the e-mail, every name and
 * phone number the store holds (account, address book, order addresses, order
 * phone). A name also counts word by word, so a note naming only the surname
 * ("ga. Novak") matches. Fragments under 3 letters are left out so a short name
 * cannot blank every note; matching is over-inclusive on purpose (it only ever
 * reads the person's own orders) — an erased note is the safe direction.
 */
export function personalIdentifiers(input: { emails: Array<string | null | undefined>; names: Array<string | null | undefined>; phones: Array<string | null | undefined> }): PersonIdentifiers {
  const terms = new Set<string>();
  const phones = new Set<string>();
  const addTerm = (value: string) => {
    const text = folded(value.trim());
    if (text.length >= 3) terms.add(text);
  };
  for (const email of input.emails) if (email) addTerm(email);
  for (const name of input.names) {
    if (!name) continue;
    addTerm(name);
    for (const word of name.split(/[^\p{L}]+/u)) addTerm(word);
  }
  for (const phone of input.phones) {
    const digits = phone?.replace(/\D/g, "") ?? "";
    if (digits.length >= 6) phones.add(digits.slice(-PHONE_KEY_DIGITS));
  }
  return { terms: [...terms], phones: [...phones] };
}

/**
 * Whether a piece of staff free text quotes the person: a term at the start of
 * a word (so an inflected surname, "Novaka", matches and "banana" does not
 * match "Ana"), or a phone number in any spacing or punctuation.
 */
export function quotesPerson(text: string, identifiers: PersonIdentifiers): boolean {
  const haystack = folded(text);
  if (identifiers.terms.some((term) => new RegExp(`(?<![\\p{L}\\p{N}])${regExpEscaped(term)}`, "u").test(haystack))) return true;
  if (!identifiers.phones.length) return false;
  return (text.match(/\d[\d\s()./-]*\d/g) ?? []).some((run) => {
    const digits = run.replace(/\D/g, "");
    return identifiers.phones.some((key) => digits.includes(key));
  });
}

/**
 * The stored order log with operator free text that quotes the person blanked.
 * Only a cancellation's reason (`<reason>:<actor>`) is typed by staff; every
 * other detail is a machine value, a configured carrier or a staff address.
 * The entry, its time and the actor stay, so the log still reads in order.
 */
export function scrubbedTimeline(timeline: Prisma.JsonValue, identifiers: PersonIdentifiers): Prisma.JsonValue {
  if (!Array.isArray(timeline)) return timeline;
  return timeline.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const { event, detail } = entry as { event?: unknown; detail?: unknown };
    if (event !== "cancelled" || typeof detail !== "string" || detail.startsWith("cents:")) return entry;
    const cut = detail.lastIndexOf(":");
    const reason = cut > 0 ? detail.slice(0, cut) : detail;
    if (!quotesPerson(reason, identifiers)) return entry;
    return { ...entry, detail: cut > 0 ? `${ANONYMISED_TEXT}${detail.slice(cut)}` : ANONYMISED_TEXT };
  });
}

/**
 * An order still waiting for a decision. Erasing its buyer would leave a late
 * payment webhook issuing an invoice for a scrubbed name and queueing a
 * confirmation with no recipient, and a paid parcel with no address to ship to.
 */
const OPEN_ORDER_STATUSES: ReadonlySet<string> = new Set(["PENDING", "PAID", "PROCESSING"]);

export type AnonymiseRefusal = "not_found" | "staff" | "account" | "open_order";

/**
 * Anonymisation (§14.8): PII is replaced or deleted. Kept: order financials,
 * refunds, the issued invoice snapshot (tax retention), consent records (proof)
 * and review content. A withdrawal row is logged when the person had opted in
 * to marketing. Irreversible; sessions are revoked.
 */
export async function anonymiseCustomer(target: CustomerTarget, actorName: string): Promise<{ ok: true; orders: number; tickets: number } | { ok: false; reason: AnonymiseRefusal }> {
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const subject = await resolveCustomerSubject(tx, target);
    if (!subject) return { ok: false as const, reason: "not_found" as const };
    if (subject.type === "account" && subject.role !== "CUSTOMER") return { ok: false as const, reason: "staff" as const };
    const { email, userId } = subject;
    // An address that has an account is one person: erasing the guest rows alone would
    // leave the account holding the name and the e-mail. The account page does both.
    if (subject.type === "guest") {
      const account = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (account) return { ok: false as const, reason: "account" as const };
    }
    const orders = await tx.order.findMany({
      where: subjectOrderWhere(subject),
      select: { id: true, number: true, status: true, phone: true, shippingAddress: true, billingAddress: true, timeline: true },
      orderBy: { createdAt: "desc" },
    });
    if (orders.some((order) => OPEN_ORDER_STATUSES.has(order.status))) return { ok: false as const, reason: "open_order" as const };
    const subscriber = await tx.subscriber.findUnique({ where: { email }, select: { id: true, status: true } });
    // Read before the account and address book are erased: staff text quoting the name or a phone number is scrubbed too.
    const profile = userId ? await tx.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    const addresses = userId ? await tx.address.findMany({ where: { userId }, select: { fullName: true, phone: true } }) : [];
    const identifiers = personalIdentifiers({
      emails: [email],
      names: [
        profile?.name, ...addresses.map((address) => address.fullName),
        ...orders.flatMap((order) => [addressText(order.shippingAddress, "fullName"), addressText(order.billingAddress, "fullName")]),
      ],
      phones: [
        ...addresses.map((address) => address.phone),
        ...orders.flatMap((order) => [order.phone, addressText(order.shippingAddress, "phone"), addressText(order.billingAddress, "phone")]),
      ],
    });

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
          // Appended to the stored log (a `{ push }` on a Json column would replace it with the object);
          // a cancellation reason quoting the person is blanked first, the entries themselves stay.
          timeline: timelinePush({ timeline: scrubbedTimeline(order.timeline, identifiers) }, "anonymised", actorName, now),
        },
      });
    }
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length) {
      await tx.couponRedemption.updateMany({ where: { orderId: { in: orderIds } }, data: { email: `anonymised@invalid` } });
      // Notes the customer saw, and any staff text quoting the address, a name or a phone number, are free text that may
      // identify the person. Matched here rather than with LIKE: a surname alone or a differently spaced number counts too.
      const notes = await tx.orderNote.findMany({ where: { orderId: { in: orderIds } }, select: { id: true, body: true, visibleToCustomer: true } });
      const noteIds = notes.filter((note) => note.visibleToCustomer || quotesPerson(note.body, identifiers)).map((note) => note.id);
      if (noteIds.length) await tx.orderNote.updateMany({ where: { id: { in: noteIds } }, data: { body: ANONYMISED_TEXT } });
      const refunds = await tx.refund.findMany({ where: { orderId: { in: orderIds } }, select: { id: true, reason: true } });
      const refundIds = refunds.filter((refund) => quotesPerson(refund.reason, identifiers)).map((refund) => refund.id);
      if (refundIds.length) await tx.refund.updateMany({ where: { id: { in: refundIds } }, data: { reason: ANONYMISED_TEXT } });
    }
    const tickets = await tx.ticket.findMany({ where: subjectTicketWhere(subject), select: { id: true, attachments: { select: { filename: true } } } });
    // The photos go before the rows that name them. Deleting the rows first and unlinking
    // after the commit loses the file names on any error, leaving health-data photos on disk
    // and in backups with nothing left to find them by; this way a failure aborts the whole
    // erasure and the retry reads the same names again (a missing file is already tolerated).
    const attachments = tickets.flatMap((ticket) => ticket.attachments);
    if (attachments.length) await removeSupportPhotos(attachments);
    for (const ticket of tickets) {
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
  return result;
}

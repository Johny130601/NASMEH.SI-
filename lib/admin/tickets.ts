import type { Prisma, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/admin/permissions";
import { TOPIC_CODES, type TopicCode } from "@/lib/support/topics";

/** Support inbox: the Ticket rows of Phase 6 with status, assignee and an internal note. */

export const TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "CLOSED"];
export const TICKET_PAGE_SIZE = 50;

export interface TicketFilters { status: TicketStatus | null; topic: TopicCode | null; page: number }

type Query = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value ?? "").trim();

export function parseTicketFilters(query: Query): TicketFilters {
  const status = single(query.status).toUpperCase();
  const topic = single(query.tema).toUpperCase();
  const page = Number.parseInt(single(query.stran) || "1", 10);
  return {
    status: (TICKET_STATUSES as string[]).includes(status) ? status as TicketStatus : null,
    topic: (TOPIC_CODES as readonly string[]).includes(topic) ? topic as TopicCode : null,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export async function listTickets(filters: TicketFilters) {
  const where: Prisma.TicketWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
  };
  const total = await db.ticket.count({ where });
  const pages = Math.max(1, Math.ceil(total / TICKET_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const tickets = await db.ticket.findMany({
    where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (page - 1) * TICKET_PAGE_SIZE, take: TICKET_PAGE_SIZE,
    select: {
      id: true, reference: true, createdAt: true, topic: true, reason: true, name: true, email: true, orderNumber: true, status: true,
      assignee: { select: { name: true, email: true } },
    },
  });
  return { tickets, total, page, pages };
}

export async function loadTicket(id: string) {
  return db.ticket.findUnique({
    where: { id },
    include: {
      attachments: { select: { id: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      deliveries: { select: { kind: true, recipient: true, sentAt: true, attempts: true, lastError: true } },
      assignee: { select: { id: true, name: true, email: true } },
      user: { select: { id: true, name: true, email: true } },
      order: { select: { id: true, number: true, status: true } },
    },
  });
}

/** Staff members an operator can assign a ticket to. */
export async function listAssignees() {
  return db.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

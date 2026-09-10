"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { isStaffRole } from "@/lib/admin/permissions";
import { TICKET_STATUSES } from "@/lib/admin/tickets";

export type TicketActionResult = { ok: true } | { ok: false; error: "invalid" | "not_found" };

/** Status, assignee and the internal note of a ticket (tickets:view covers handling). */
export async function updateTicketAction(input: { ticketId: string; status: string; assigneeId: string; internalNote: string }): Promise<TicketActionResult> {
  await requirePermission("tickets:view");
  const parsed = z.object({
    ticketId: z.string().min(1).max(64),
    status: z.enum(TICKET_STATUSES),
    assigneeId: z.string().max(64),
    internalNote: z.string().max(4000),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  let assigneeId: string | null = null;
  if (parsed.data.assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: parsed.data.assigneeId }, select: { id: true, role: true } });
    if (!assignee || !isStaffRole(assignee.role)) return { ok: false, error: "invalid" };
    assigneeId = assignee.id;
  }
  const updated = await db.ticket.updateMany({
    where: { id: parsed.data.ticketId },
    data: { status: parsed.data.status, assigneeId, internalNote: parsed.data.internalNote.trim() || null },
  });
  if (updated.count !== 1) return { ok: false, error: "not_found" };
  revalidatePath("/admin/podpora");
  revalidatePath(`/admin/podpora/${parsed.data.ticketId}`);
  return { ok: true };
}

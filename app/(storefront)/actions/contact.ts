"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { humanTokenSchema } from "@/lib/auth-validation";
import { contact as copy } from "@/lib/copy/contact";
import { contactInputSchema, contactLookupSchema } from "@/lib/support/validation";
import { createContactTicket } from "@/lib/support/tickets";
import { deliverTicketEmails } from "@/lib/support/delivery";

export async function lookupContactOrderAction(input: unknown): Promise<{
  ok: boolean; error?: string; order?: { number: string; status: string; createdAt: string };
}> {
  const parsed = contactLookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.errors.orderNotFound };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.errors.challenge };
  try {
    const order = await db.order.findFirst({
      where: { number: parsed.data.orderNumber, email: { equals: parsed.data.email, mode: "insensitive" } },
      select: { number: true, status: true, createdAt: true },
    });
    if (!order) return { ok: false, error: copy.errors.orderNotFound };
    return { ok: true, order: { number: order.number, status: order.status, createdAt: order.createdAt.toISOString() } };
  } catch {
    return { ok: false, error: copy.errors.failed };
  }
}

export async function submitContactAction(form: FormData): Promise<{ ok: boolean; error?: string; reference?: string }> {
  const parsed = contactInputSchema.safeParse({
    requestKey: form.get("requestKey"), name: form.get("name"), email: form.get("email"),
    topic: form.get("topic"), reason: form.get("reason"), message: form.get("message"),
    orderNumber: form.get("orderNumber") ?? "", orderEmail: form.get("orderEmail") ?? "",
    privacyAccepted: form.get("privacyAccepted") === "on",
  });
  if (!parsed.success) return { ok: false, error: copy.errors.invalid };
  const challenge = humanTokenSchema.safeParse(form.get("turnstileToken") ?? "");
  if (!challenge.success || !await verifyTurnstile(challenge.data)) return { ok: false, error: copy.errors.challenge };
  const rawFiles = form.getAll("photos");
  if (rawFiles.some(value => !(value instanceof File))) return { ok: false, error: copy.errors.photos };
  const files = rawFiles.filter((file): file is File => file instanceof File && !(file.size === 0 && file.name === ""));
  try {
    const result = await createContactTicket(parsed.data, files, (await auth())?.user?.id ?? null);
    if (!result.ok) return { ok: false, error: copy.errors[result.error] };
    // Persisted queued requests remain successful even when SMTP is unavailable.
    await deliverTicketEmails(result.ticketId).catch(() => console.error("Ticket emails remain queued"));
    return { ok: true, reference: result.reference };
  } catch {
    console.error("Contact request requires retry");
    return { ok: false, error: copy.errors.failed };
  }
}

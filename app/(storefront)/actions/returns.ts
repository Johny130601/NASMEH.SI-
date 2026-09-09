"use server";

import { auth } from "@/lib/auth";
import { verifyTurnstile } from "@/lib/turnstile";
import { humanTokenSchema } from "@/lib/auth-validation";
import { returns } from "@/lib/copy/returns";
import { withdrawalInputSchema, withdrawalToContactInput } from "@/lib/support/validation";
import { createContactTicket } from "@/lib/support/tickets";
import { deliverTicketEmails } from "@/lib/support/delivery";

const copy = returns.withdrawal;

/** Online model withdrawal form (§12.4) → RETURN/WITHDRAWAL ticket through the step 1 pipeline. */
export async function submitWithdrawalAction(form: FormData): Promise<{ ok: boolean; error?: string; reference?: string }> {
  const parsed = withdrawalInputSchema.safeParse({
    requestKey: form.get("requestKey"), name: form.get("name"), email: form.get("email"),
    address: form.get("address"), orderNumber: form.get("orderNumber"), receivedAt: form.get("receivedAt"),
    items: form.get("items"), note: form.get("note") ?? "",
    privacyAccepted: form.get("privacyAccepted") === "on",
  });
  if (!parsed.success) return { ok: false, error: copy.errors.invalid };
  const challenge = humanTokenSchema.safeParse(form.get("turnstileToken") ?? "");
  if (!challenge.success || !await verifyTurnstile(challenge.data)) return { ok: false, error: copy.errors.challenge };
  try {
    const result = await createContactTicket(withdrawalToContactInput(parsed.data), [], (await auth())?.user?.id ?? null);
    if (!result.ok) {
      return { ok: false, error: result.error === "photos" ? copy.errors.failed : copy.errors[result.error] };
    }
    // Persisted queued requests remain successful even when SMTP is unavailable.
    await deliverTicketEmails(result.ticketId).catch(() => console.error("Withdrawal ticket emails remain queued"));
    return { ok: true, reference: result.reference };
  } catch {
    console.error("Withdrawal request requires retry");
    return { ok: false, error: copy.errors.failed };
  }
}

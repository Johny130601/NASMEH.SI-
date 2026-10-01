"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { humanTokenSchema } from "@/lib/auth-validation";
import { adverse as copy } from "@/lib/copy/adverse";
import { adverseInputSchema, adverseToContactInput, firstInvalidField } from "@/lib/support/validation";
import { createContactTicket } from "@/lib/support/tickets";
import { deliverTicketEmails } from "@/lib/support/delivery";
import { submittedFiles } from "@/lib/form-files";

/** Structured adverse-event report (§12.6) → ADVERSE ticket routed to the compliance mailbox. */
export async function submitAdverseEventAction(form: FormData): Promise<{ ok: boolean; error?: string; reference?: string }> {
  const parsed = adverseInputSchema.safeParse({
    requestKey: form.get("requestKey"), name: form.get("name"), email: form.get("email"),
    phone: form.get("phone") ?? "", reporterType: form.get("reporterType"), reason: form.get("reason") ?? "REACTION",
    productSlug: form.get("productSlug"), batchNumber: form.get("batchNumber") ?? "",
    batchUnknown: form.get("batchUnknown") === "on",
    purchasePlace: form.get("purchasePlace"), purchaseDate: form.get("purchaseDate") ?? "",
    orderNumber: form.get("orderNumber") ?? "", description: form.get("description"),
    onsetDate: form.get("onsetDate") ?? "", ongoing: form.get("ongoing"), medicalTreatment: form.get("medicalTreatment"),
    medicalDetails: form.get("medicalDetails") ?? "",
    contactPermission: form.get("contactPermission") === "on",
    privacyAccepted: form.get("privacyAccepted") === "on",
  });
  if (!parsed.success) {
    // Name the field to correct; a malformed request without one keeps the general sentence.
    const field = firstInvalidField(parsed.error);
    return { ok: false, error: field && Object.hasOwn(copy.errors.fields, field) ? copy.errors.fields[field as keyof typeof copy.errors.fields] : copy.errors.invalid };
  }
  const challenge = humanTokenSchema.safeParse(form.get("turnstileToken") ?? "");
  if (!challenge.success || !await verifyTurnstile(challenge.data)) return { ok: false, error: copy.errors.challenge };
  // Empty parts (an untouched file input, however the encoder names it) are no upload.
  const files = submittedFiles(form.getAll("photos"));
  if (!files) return { ok: false, error: copy.errors.photos };
  try {
    // Discontinued products can still cause reactions: any known product qualifies.
    const product = await db.product.findUnique({ where: { slug: parsed.data.productSlug }, select: { slug: true, title: true } });
    if (!product) return { ok: false, error: copy.errors.invalid };
    const result = await createContactTicket(adverseToContactInput(parsed.data, product), files, (await auth())?.user?.id ?? null);
    if (!result.ok) return { ok: false, error: copy.errors[result.error] };
    await deliverTicketEmails(result.ticketId).catch(() => console.error("Adverse-event ticket emails remain queued"));
    return { ok: true, reference: result.reference };
  } catch {
    console.error("Adverse-event report requires retry");
    return { ok: false, error: copy.errors.failed };
  }
}

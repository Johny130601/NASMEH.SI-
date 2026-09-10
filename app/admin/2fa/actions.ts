"use server";

import { z } from "zod";
import { requireStaff } from "@/lib/admin/access";
import { completeTotpEnrolment, type EnrolmentCompletion } from "@/lib/admin/mfa";

/** The only staff action that may run before enrolment is complete. */
export async function completeEnrolmentAction(input: { code: string }): Promise<EnrolmentCompletion> {
  const staff = await requireStaff({ allowUnenrolled: true });
  const parsed = z.object({ code: z.string().trim().min(6).max(12) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_code" };
  return completeTotpEnrolment(staff.id, parsed.data.code);
}

import { db } from "@/lib/db";

export type GuestAccountOffer = "create" | "signIn" | null;

/**
 * The account box under a paid guest order, for the browser that placed it
 * (QA 2026-10-03 T2-09). A fresh address may create an account. An address that
 * already has a shopper's account is offered sign-in instead of a form that
 * could only answer "account exists" — which the checkout's own hint already
 * tells the same purchaser; signed in, there is nothing to offer. A staff
 * address is never confirmed here (as at the checkout hint, T2-10), so it gets
 * no box.
 */
export async function guestAccountOffer(email: string, signedIn: boolean): Promise<GuestAccountOffer> {
  const existing = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { role: true } });
  if (!existing) return "create";
  if (existing.role !== "CUSTOMER") return null;
  return signedIn ? null : "signIn";
}

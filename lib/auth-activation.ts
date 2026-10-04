import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { readActivationLink } from "@/lib/auth-tokens";

type ActivationReader = Pick<Prisma.TransactionClient, "user" | "subscriber">;

/** The address's Subscriber when it was unsubscribed after the activation link was issued. */
export async function withdrawnSince(client: ActivationReader, userId: string, issuedAt: Date) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return null;
  const subscriber = await client.subscriber.findUnique({
    where: { email: user.email.toLowerCase() }, select: { id: true, status: true, updatedAt: true },
  });
  return subscriber?.status === "UNSUBSCRIBED" && subscriber.updatedAt > issuedAt ? subscriber : null;
}

/**
 * What the activation page tells the link holder before the click (QA
 * 2026-10-03 T3-02): whether confirming also confirms the newsletter opt-in
 * chosen with the account — the link's snapshot, unless the address
 * unsubscribed after the link was sent, which wins at activation too. Null for
 * a link that cannot be used. Read-only.
 */
export async function activationPreview(raw: unknown): Promise<{ newsletter: boolean } | null> {
  const link = await readActivationLink(raw);
  if (!link) return null;
  return { newsletter: link.snapshot.marketingOptIn && !(await withdrawnSince(db, link.userId, link.issuedAt)) };
}

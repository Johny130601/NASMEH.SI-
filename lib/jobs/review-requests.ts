import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { signRatingToken } from "@/lib/reviews/rating-token";
import { sendReviewRequestEmail } from "@/lib/email/mailer";

const DAY_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const delaySchema = z.number().int().min(7).max(10);

/** Claim before SMTP; failed/crashed deliveries retain a retryable row. */
export async function sendDueReviewRequests(now = new Date()) {
  const configured = delaySchema.safeParse(await getSetting<unknown>("reviews.requestDelayDays"));
  const cutoff = new Date(now.getTime() - (configured.success ? configured.data : 7) * DAY_MS);
  const eligible = {
    status: "DELIVERED" as const, deliveredAt: { lte: cutoff }, refundRequired: false,
    items: { some: { variantId: { not: null }, review: null } },
  };
  // A permanently failing oldest batch must not hide new recipients. Reserve
  // capacity for unrequested orders, then rotate retries by attempt count.
  const orders = await db.order.findMany({
    where: { ...eligible, reviewRequest: null },
    select: { id: true }, orderBy: [{ deliveredAt: "asc" }, { id: "asc" }], take: 50,
  });
  if (orders.length < 50) {
    const retries = await db.order.findMany({
      where: {
        ...eligible,
        id: { notIn: orders.map(order => order.id) },
        reviewRequest: { is: { sentAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] } },
      },
      select: { id: true },
      orderBy: [{ reviewRequest: { attempts: "asc" } }, { deliveredAt: "asc" }, { id: "asc" }],
      take: 50 - orders.length,
    });
    orders.push(...retries);
  }
  const result = { processed: orders.length, sent: 0, failed: 0, skipped: 0 };
  for (const candidate of orders) {
    const leaseToken = randomUUID();
    try {
      await db.reviewRequest.createMany({ data: [{ orderId: candidate.id }], skipDuplicates: true });
      const claimNow = new Date();
      const claimed = await db.reviewRequest.updateMany({
        where: { orderId: candidate.id, sentAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: claimNow } }] },
        data: { leaseToken, leaseUntil: new Date(claimNow.getTime() + LEASE_MS), attempts: { increment: 1 }, lastError: null },
      });
      if (claimed.count !== 1) { result.skipped += 1; continue; }
      const order = await db.order.findUnique({ where: { id: candidate.id },
        include: { items: { where: { variantId: { not: null }, review: null } } } });
      if (!order || order.status !== "DELIVERED" || order.refundRequired || !order.deliveredAt || order.deliveredAt > cutoff || order.items.length === 0) {
        await db.reviewRequest.updateMany({ where: { orderId: candidate.id, leaseToken }, data: { leaseToken: null, leaseUntil: null } });
        result.skipped += 1;
        continue;
      }
      const items = order.items.map(item => ({ title: item.title,
        ratingUrls: [1, 2, 3, 4, 5].map(rating => ({ rating,
          token: signRatingToken({ orderItemId: item.id, rating }, getEnv().AUTH_SECRET, 30 * DAY_MS, now.getTime()) })),
      }));
      await sendReviewRequestEmail(order, items);
      await db.reviewRequest.updateMany({ where: { orderId: order.id, leaseToken, sentAt: null },
        data: { sentAt: new Date(), leaseUntil: null, leaseToken: null, lastError: null } });
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      // SMTP is at-least-once across the acceptance/DB-commit crash gap.
      await db.reviewRequest.updateMany({ where: { orderId: candidate.id, leaseToken, sentAt: null },
        data: { leaseUntil: null, leaseToken: null, lastError: error instanceof Error ? error.name : "DeliveryError" } }).catch(() => undefined);
      console.error("Review request remains queued");
    }
  }
  return result;
}

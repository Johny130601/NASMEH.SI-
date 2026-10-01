import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { siteUrl } from "@/lib/seo";
import { sendBackInStockAlertEmail } from "@/lib/email/mailer";
import { signUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";
import { isSoldOut, sellableStock } from "@/lib/bundle/availability";

const LEASE_MS = 5 * 60 * 1000;

/**
 * Restock alerts (§13.1–13.2): rows armed by the stock helper are claimed
 * with a lease before SMTP, re-checked against live stock, mailed once and
 * stamped `notifiedAt`. Failures release the lease and stay retryable;
 * delivery is at least once across the SMTP/DB acknowledgement gap.
 */
export async function sendPendingRestockAlerts(now = new Date(), limit = 50) {
  const rows = await db.backInStockSubscription.findMany({
    where: {
      status: "CONFIRMED", notifiedAt: null, alertPendingSince: { not: null },
      OR: [{ alertLeaseUntil: null }, { alertLeaseUntil: { lte: now } }],
    },
    select: { id: true },
    orderBy: [{ alertAttempts: "asc" }, { alertPendingSince: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(100, limit)),
  });
  const result = { processed: rows.length, sent: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    const leaseToken = randomUUID();
    try {
      const claimNow = new Date();
      const claimed = await db.backInStockSubscription.updateMany({
        where: {
          id: row.id, status: "CONFIRMED", notifiedAt: null, alertPendingSince: { not: null },
          OR: [{ alertLeaseUntil: null }, { alertLeaseUntil: { lte: claimNow } }],
        },
        data: {
          alertLeaseToken: leaseToken, alertLeaseUntil: new Date(claimNow.getTime() + LEASE_MS),
          alertAttempts: { increment: 1 }, alertLastError: null,
        },
      });
      if (claimed.count !== 1) { result.skipped += 1; continue; }

      const subscription = await db.backInStockSubscription.findUnique({
        where: { id: row.id },
        include: {
          variant: true,
          product: {
            include: {
              variants: { orderBy: { priceCents: "asc" } },
              bundle: { include: { items: { include: { variant: { select: { stock: true, allowBackorder: true } } } } } },
            },
          },
        },
      });
      // A bundle's stock is its components' (lib/bundle/availability): a component restock arms it.
      const bundle = subscription?.product.bundle ?? null;
      const available = (candidate: { stock: number; allowBackorder: boolean }) => !isSoldOut(sellableStock(candidate, bundle));
      const variant = subscription?.variant
        ?? subscription?.product.variants.find(available)
        ?? subscription?.product.variants[0]
        ?? null;
      if (!subscription || subscription.status !== "CONFIRMED" || subscription.notifiedAt
        || subscription.product.status !== "ACTIVE" || subscription.product.hiddenDeal || (bundle && !bundle.active)
        || !variant || !available(variant)) {
        // Sold out again (or withdrawn) before sending: disarm and keep the
        // subscription for the next restock instead of mailing a dead link.
        await db.backInStockSubscription.updateMany({
          where: { id: row.id, alertLeaseToken: leaseToken },
          data: { alertPendingSince: null, alertLeaseToken: null, alertLeaseUntil: null },
        });
        result.skipped += 1;
        continue;
      }

      const base = siteUrl();
      await sendBackInStockAlertEmail({
        to: subscription.email,
        subscriptionId: subscription.id,
        productTitle: subscription.product.title,
        productUrl: `${base}/izdelek/${subscription.product.slug}`,
        priceCents: variant.priceCents,
        unsubscribeUrl: `${base}/odjava-zaloga/${signUnsubscribeToken(subscription.id, getEnv().AUTH_SECRET)}`,
      });
      await db.backInStockSubscription.updateMany({
        where: { id: row.id, alertLeaseToken: leaseToken, notifiedAt: null },
        data: { notifiedAt: new Date(), alertPendingSince: null, alertLeaseToken: null, alertLeaseUntil: null, alertLastError: null },
      });
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      await db.backInStockSubscription.updateMany({
        where: { id: row.id, alertLeaseToken: leaseToken, notifiedAt: null },
        data: { alertLeaseToken: null, alertLeaseUntil: null, alertLastError: error instanceof Error ? error.name : "DeliveryError" },
      }).catch(() => undefined);
      // The bounded error type is stored; logs stay free of recipient data.
      console.error("Restock alert remains queued");
    }
  }
  return result;
}

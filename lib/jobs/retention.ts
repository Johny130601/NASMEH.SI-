import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reviewPhotoPaths } from "@/lib/reviews/photos";
import { removeReviewPhotos } from "@/lib/reviews/photo-storage";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sign-in tokens (verify e-mail, password reset) are single-use and expire
 * within a day; a used or expired row has no purpose left. It is kept 30 days
 * so support can still see that a link was issued, then deleted.
 */
export const AUTH_TOKEN_RETENTION_DAYS = 30;

/**
 * PLACEHOLDER pending D4 (lawyer / owner): how long an unconverted checkout
 * capture (step-1 e-mail plus cart snapshot) is kept. No recovery e-mails exist
 * yet (D7), so the short window from the audit is used until the privacy policy
 * states a period. Change it together with the policy text, never alone.
 */
export const ABANDONED_CHECKOUT_RETENTION_DAYS = 30;

const CONVERTED_SCAN_LIMIT = 1000;
const REJECTED_REVIEW_BATCH = 200;

export interface RetentionCounts {
  authTokensDeleted: number;
  activationDataCleared: number;
  abandonedCheckoutsDeleted: number;
  rejectedReviewPhotosRemoved: number;
  failed: number;
}

/**
 * Storage limitation (GDPR Art. 5(1)(e)) for rows with no business decision
 * attached: stale sign-in tokens and the credentials snapshot they carry,
 * checkout captures that became paid orders or went stale, and photos of
 * rejected reviews. Every step is idempotent; the result carries counts only.
 * Orders, invoices, consent records, tickets and accounts are out of scope:
 * their periods are D4 decisions.
 */
export async function runRetention(now = new Date()): Promise<RetentionCounts> {
  const counts: RetentionCounts = { authTokensDeleted: 0, activationDataCleared: 0, abandonedCheckoutsDeleted: 0, rejectedReviewPhotosRemoved: 0, failed: 0 };

  const tokenCutoff = new Date(now.getTime() - AUTH_TOKEN_RETENTION_DAYS * DAY_MS);
  counts.authTokensDeleted = (await db.authToken.deleteMany({
    where: { OR: [{ usedAt: { lt: tokenCutoff } }, { expiresAt: { lt: tokenCutoff } }] },
  })).count;
  // The password hash, name and consent snapshot of a token that can no longer be used.
  counts.activationDataCleared = (await db.authToken.updateMany({
    where: { activationData: { not: Prisma.DbNull }, OR: [{ usedAt: { not: null } }, { expiresAt: { lte: now } }] },
    data: { activationData: Prisma.DbNull },
  })).count;

  // A capture whose checkout became a paid order has served its purpose at any age.
  const checkoutCutoff = new Date(now.getTime() - ABANDONED_CHECKOUT_RETENTION_DAYS * DAY_MS);
  const recent = await db.abandonedCheckout.findMany({
    where: { updatedAt: { gte: checkoutCutoff } }, select: { recoveryToken: true }, orderBy: { updatedAt: "asc" }, take: CONVERTED_SCAN_LIMIT,
  });
  const converted = recent.length
    ? await db.order.findMany({ where: { checkoutKey: { in: recent.map((row) => row.recoveryToken) }, paidAt: { not: null } }, select: { checkoutKey: true } })
    : [];
  const convertedKeys = converted.flatMap((order) => (order.checkoutKey ? [order.checkoutKey] : []));
  if (convertedKeys.length) {
    counts.abandonedCheckoutsDeleted += (await db.abandonedCheckout.deleteMany({ where: { recoveryToken: { in: convertedKeys } } })).count;
  }
  counts.abandonedCheckoutsDeleted += (await db.abandonedCheckout.deleteMany({ where: { updatedAt: { lt: checkoutCutoff } } })).count;

  // Rejected reviews are never shown; their photos go (older rows rejected before moderation removed them).
  const rejected = await db.review.findMany({
    where: { status: "REJECTED", AND: [{ photos: { not: Prisma.DbNull } }, { NOT: { photos: { equals: [] } } }] },
    select: { id: true, photos: true }, orderBy: { updatedAt: "asc" }, take: REJECTED_REVIEW_BATCH,
  });
  for (const review of rejected) {
    const paths = reviewPhotoPaths(review.photos);
    try {
      // The DB write revokes access first; a re-approved review keeps its photos untouched.
      const cleared = await db.review.updateMany({ where: { id: review.id, status: "REJECTED" }, data: { photos: [] } });
      if (cleared.count !== 1) continue;
      if (paths.length) await removeReviewPhotos(paths);
      counts.rejectedReviewPhotosRemoved += paths.length;
    } catch {
      counts.failed += 1;
    }
  }
  if (counts.failed) console.error(`Retention could not remove ${counts.failed} rejected review photo set(s)`);
  return counts;
}

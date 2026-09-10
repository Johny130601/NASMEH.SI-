-- Phase 6 step 5: back-in-stock alerts queued on the subscription row.
-- AlterTable
ALTER TABLE "BackInStockSubscription" ADD COLUMN     "alertAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "alertLastError" TEXT,
ADD COLUMN     "alertLeaseToken" TEXT,
ADD COLUMN     "alertLeaseUntil" TIMESTAMP(3),
ADD COLUMN     "alertPendingSince" TIMESTAMP(3),
ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BackInStockSubscription_alertPendingSince_alertLeaseUntil_idx" ON "BackInStockSubscription"("alertPendingSince", "alertLeaseUntil");

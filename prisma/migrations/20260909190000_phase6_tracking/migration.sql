-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "shippedEmailLastError" TEXT,
ADD COLUMN     "shippedEmailLeaseUntil" TIMESTAMP(3),
ADD COLUMN     "shippedEmailPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shippedEmailSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_trackingNumber_idx" ON "Order"("trackingNumber");

-- Older shipped/delivered orders never recorded a shipment time. Preserve
-- their best available historical timestamp once; later edits do not change it.
UPDATE "Order"
SET "shippedAt" = COALESCE("deliveredAt", "updatedAt")
WHERE "status" IN ('SHIPPED', 'DELIVERED') AND "shippedAt" IS NULL;

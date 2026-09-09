ALTER TABLE "Order"
  ADD COLUMN "cartClearedAt" TIMESTAMP(3),
  ADD COLUMN "refundRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fulfillmentIssue" TEXT,
  ADD COLUMN "confirmationEmailPending" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "confirmationEmailLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "confirmationEmailLastError" TEXT;

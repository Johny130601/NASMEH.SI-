-- Phase 9 step 4 (GDPR and legal finalisation): the terms and withdrawal
-- pages the buyer saw when placing the order, and the invoice as issued, so
-- a later CMS edit, company-data change or customer anonymisation cannot
-- rewrite either record. Both nullable: orders placed before this step keep
-- the live-render fallback.
ALTER TABLE "Order" ADD COLUMN "legalAcceptance" JSONB;
ALTER TABLE "Order" ADD COLUMN "invoiceSnapshot" JSONB;

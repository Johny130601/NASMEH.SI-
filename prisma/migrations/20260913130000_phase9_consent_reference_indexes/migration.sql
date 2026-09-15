-- Phase 9 step 4: indexes for the ConsentLog subject-reference lookup.
-- lib/admin/customers.ts consentReferenceQuery (admin customer detail pages and
-- the GDPR export) finds unlinked consent rows by the ids stored inside
-- "choices" (orderNumber, subscriberId, subscriptionId) with "kind" <> 'cookie'.
-- ConsentLog gains a cookie row per visitor choice and is never purged, so
-- without these the lookup is a sequential scan.
--
-- Partial expression indexes cannot be written in schema.prisma. The Prisma
-- schema engine skips partial indexes when it introspects the database
-- (pg_index.indpred IS NULL), so `prisma migrate diff` / `migrate dev` do not
-- generate DROP INDEX for them. Keep the WHERE clause: without it they would
-- be seen as drift. IF NOT EXISTS keeps a re-run a no-op.
CREATE INDEX IF NOT EXISTS "ConsentLog_choices_orderNumber_idx" ON "ConsentLog" (("choices"->>'orderNumber')) WHERE "kind" <> 'cookie';
CREATE INDEX IF NOT EXISTS "ConsentLog_choices_subscriberId_idx" ON "ConsentLog" (("choices"->>'subscriberId')) WHERE "kind" <> 'cookie';
CREATE INDEX IF NOT EXISTS "ConsentLog_choices_subscriptionId_idx" ON "ConsentLog" (("choices"->>'subscriptionId')) WHERE "kind" <> 'cookie';

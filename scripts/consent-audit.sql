-- =============================================================================
-- Consent-log audit (Phase 9 step 4, gate D4 local part)
-- =============================================================================
--
-- Read-only. Every statement is a SELECT; the session is switched to
-- read-only before the first query, so an accidental write would fail.
--
-- Run (Git Bash on the workstation; never against the production database
-- without the operator's go-ahead, and never against a template database
-- another process is cloning):
--
--   PGPASSWORD=postgres psql -h ::1 -p 5543 -U postgres -d <database> \
--     -X -v ON_ERROR_STOP=1 -f scripts/consent-audit.sql
--
-- What it proves (docs/plans/phase-9.md, step 4: "every stored choice carries
-- the version and the categories"), against prisma/schema.prisma ConsentLog:
--
--   id text, "userId" text NULL (FK User, ON DELETE SET NULL),
--   "visitorId" text NULL, kind text, version text, choices jsonb,
--   ip text NULL, "userAgent" text NULL, "createdAt" timestamp(3)
--
-- The single write path is lib/consent-log.ts recordConsent(): kind is one of
-- CONSENT_KINDS, version is non-empty, choices is a non-empty object; cookie
-- rows need boolean analytics + marketing, back-in-stock rows a productSlug,
-- every other kind a boolean marketing. Subject links a row can carry:
--   "userId"                    signed-in / verified account
--   "visitorId"                 random consent id from the nasmeh_consent cookie
--   choices->>'subscriberId'    Subscriber row (newsletter double opt-in)
--   choices->>'subscriptionId'  BackInStockSubscription row
--   choices->>'orderNumber'     guest checkout (weaker: the order, not a person)
--
-- Sections
--   A  integrity: version, choices object, per-kind required keys   PASS/FAIL
--   B  counts by kind and version; cookie version vs the Setting
--   C  subject links by kind; dangling links; IP/UA minimisation
--   D  withdrawals following grants, per subject; stored state vs log
--   E  consent rows for anonymised subjects
--
-- "Legacy" rows are rows written before step 4 (2026-09-13): cookie rows
-- without the random consent id, marketing rows with the literal version "1".
-- They cannot carry a subject link and are reported separately, not as
-- failures of the current write path.
-- =============================================================================

\pset pager off
\pset null '(null)'
SET client_encoding = 'UTF8';
SET default_transaction_read_only = on;

-- -----------------------------------------------------------------------------
-- 0. Context: which database, when, at which migration
-- -----------------------------------------------------------------------------
SELECT current_database()                             AS database,
       now()                                          AS audited_at,
       current_setting('transaction_read_only')       AS read_only,
       (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS migrations_applied,
       (SELECT max(migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS last_migration,
       (SELECT count(*) FROM "ConsentLog")            AS consent_rows,
       (SELECT min("createdAt") FROM "ConsentLog")    AS oldest_row,
       (SELECT max("createdAt") FROM "ConsentLog")    AS newest_row;

-- -----------------------------------------------------------------------------
-- A1. Every row carries a non-empty version and a non-empty choices object.
-- -----------------------------------------------------------------------------
SELECT 'A1 version + choices object' AS check_name,
       count(*) AS rows_checked,
       count(*) FILTER (WHERE version IS NULL OR btrim(version) = '') AS empty_version,
       count(*) FILTER (WHERE choices IS NULL OR jsonb_typeof(choices) <> 'object') AS choices_not_object,
       count(*) FILTER (WHERE jsonb_typeof(choices) = 'object' AND choices = '{}'::jsonb) AS choices_empty_object,
       CASE WHEN count(*) FILTER (WHERE version IS NULL OR btrim(version) = ''
                                   OR choices IS NULL OR jsonb_typeof(choices) <> 'object'
                                   OR choices = '{}'::jsonb) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM "ConsentLog";

-- -----------------------------------------------------------------------------
-- A2. Cookie rows carry boolean analytics AND marketing (the two consent
--     categories; "necessary" is implied and not logged).
-- -----------------------------------------------------------------------------
SELECT 'A2 cookie categories are booleans' AS check_name,
       count(*) AS cookie_rows,
       count(*) FILTER (WHERE jsonb_typeof(choices->'analytics') IS DISTINCT FROM 'boolean') AS analytics_not_boolean,
       count(*) FILTER (WHERE jsonb_typeof(choices->'marketing') IS DISTINCT FROM 'boolean') AS marketing_not_boolean,
       count(*) FILTER (WHERE choices ? 'ts') AS with_ts,
       CASE WHEN count(*) FILTER (WHERE jsonb_typeof(choices->'analytics') IS DISTINCT FROM 'boolean'
                                   OR jsonb_typeof(choices->'marketing') IS DISTINCT FROM 'boolean') = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM "ConsentLog"
WHERE kind = 'cookie';

-- -----------------------------------------------------------------------------
-- A3. Non-cookie rows carry the key recordConsent() requires, and every kind
--     is a known one (lib/consent-log.ts CONSENT_KINDS).
-- -----------------------------------------------------------------------------
SELECT 'A3 per-kind required keys and known kinds' AS check_name,
       count(*) FILTER (WHERE kind <> 'cookie') AS non_cookie_rows,
       count(*) FILTER (WHERE kind = 'back-in-stock'
                          AND jsonb_typeof(choices->'productSlug') IS DISTINCT FROM 'string') AS back_in_stock_without_product,
       count(*) FILTER (WHERE kind LIKE 'marketing-%'
                          AND jsonb_typeof(choices->'marketing') IS DISTINCT FROM 'boolean') AS marketing_without_boolean,
       count(*) FILTER (WHERE kind NOT IN ('cookie', 'marketing-checkout', 'marketing-register',
                                           'marketing-activation', 'marketing-preference',
                                           'marketing-email', 'back-in-stock')) AS unknown_kind,
       CASE WHEN count(*) FILTER (WHERE (kind = 'back-in-stock' AND jsonb_typeof(choices->'productSlug') IS DISTINCT FROM 'string')
                                   OR (kind LIKE 'marketing-%' AND jsonb_typeof(choices->'marketing') IS DISTINCT FROM 'boolean')
                                   OR kind NOT IN ('cookie', 'marketing-checkout', 'marketing-register',
                                                   'marketing-activation', 'marketing-preference',
                                                   'marketing-email', 'back-in-stock')) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM "ConsentLog";

-- -----------------------------------------------------------------------------
-- B1. Counts by kind and version. Version style:
--       setting  = integer from the consent.version Setting (cookie rows)
--       wording  = t-<12 hex>, SHA-256 fingerprint of the wording shown
--                  (lib/consent-log.ts wordingVersion)
--       literal  = anything else (the pre-step-4 "1" on marketing rows)
-- -----------------------------------------------------------------------------
SELECT kind,
       version,
       CASE WHEN kind = 'cookie' AND version ~ '^[0-9]+$' THEN 'setting'
            WHEN version ~ '^t-[0-9a-f]{12}$' THEN 'wording'
            ELSE 'literal' END AS version_style,
       count(*) AS rows,
       min("createdAt") AS first_row,
       max("createdAt") AS last_row
FROM "ConsentLog"
GROUP BY kind, version
ORDER BY kind, version;

-- -----------------------------------------------------------------------------
-- B2. Cookie rows against the current consent.version Setting (a bump re-asks
--     every visitor; older rows stay as history).
-- -----------------------------------------------------------------------------
SELECT (SELECT value #>> '{}' FROM "Setting" WHERE key = 'consent.version') AS setting_version,
       count(*) FILTER (WHERE version = (SELECT value #>> '{}' FROM "Setting" WHERE key = 'consent.version')) AS cookie_rows_at_current,
       count(*) FILTER (WHERE version IS DISTINCT FROM (SELECT value #>> '{}' FROM "Setting" WHERE key = 'consent.version')) AS cookie_rows_at_other
FROM "ConsentLog"
WHERE kind = 'cookie';

-- -----------------------------------------------------------------------------
-- C1. Subject links by kind. no_subject = none of user, consent visitor id,
--     subscriber, subscription. Of those, how many are legacy rows and how
--     many can still be tied to an order through choices->>'orderNumber'.
-- -----------------------------------------------------------------------------
SELECT kind,
       count(*) AS rows,
       count(*) FILTER (WHERE "userId" IS NOT NULL) AS with_user,
       count(*) FILTER (WHERE "visitorId" IS NOT NULL) AS with_visitor_id,
       count(*) FILTER (WHERE choices ? 'subscriberId') AS with_subscriber,
       count(*) FILTER (WHERE choices ? 'subscriptionId') AS with_subscription,
       count(*) FILTER (WHERE "userId" IS NULL AND "visitorId" IS NULL
                          AND NOT choices ? 'subscriberId' AND NOT choices ? 'subscriptionId') AS no_subject,
       count(*) FILTER (WHERE "userId" IS NULL AND "visitorId" IS NULL
                          AND NOT choices ? 'subscriberId' AND NOT choices ? 'subscriptionId'
                          AND choices ? 'orderNumber') AS no_subject_order_only,
       count(*) FILTER (WHERE "userId" IS NULL AND "visitorId" IS NULL
                          AND NOT choices ? 'subscriberId' AND NOT choices ? 'subscriptionId'
                          AND ((kind = 'cookie' AND NOT choices ? 'ts') OR (kind <> 'cookie' AND version = '1'))) AS no_subject_legacy,
       count(*) FILTER (WHERE "userId" IS NULL AND "visitorId" IS NULL
                          AND NOT choices ? 'subscriberId' AND NOT choices ? 'subscriptionId'
                          AND NOT choices ? 'orderNumber'
                          AND NOT ((kind = 'cookie' AND NOT choices ? 'ts') OR (kind <> 'cookie' AND version = '1'))) AS no_subject_unexplained
FROM "ConsentLog"
GROUP BY kind
ORDER BY kind;

-- -----------------------------------------------------------------------------
-- C2. Dangling links: the row points at a subject that no longer exists.
--     Expected after anonymisation (Subscriber and BackInStockSubscription rows
--     are deleted, the log keeps the pseudonymous id) and after test cleanup.
--     A dangling userId cannot occur (ON DELETE SET NULL).
-- -----------------------------------------------------------------------------
SELECT count(*) FILTER (WHERE c.choices ? 'subscriberId'
                          AND NOT EXISTS (SELECT 1 FROM "Subscriber" s WHERE s.id = c.choices->>'subscriberId')) AS subscriber_gone,
       count(*) FILTER (WHERE c.choices ? 'subscriptionId'
                          AND NOT EXISTS (SELECT 1 FROM "BackInStockSubscription" b WHERE b.id = c.choices->>'subscriptionId')) AS subscription_gone,
       count(*) FILTER (WHERE c.choices ? 'orderNumber'
                          AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o.number = c.choices->>'orderNumber')) AS order_gone,
       count(*) FILTER (WHERE c."userId" IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = c."userId")) AS user_gone
FROM "ConsentLog" c;

-- -----------------------------------------------------------------------------
-- C3. Data minimisation: the ip and userAgent columns are never written by the
--     application (decision recorded in the legal checklist). Non-zero means a
--     new writer appeared.
-- -----------------------------------------------------------------------------
SELECT 'C3 no IP / user agent stored' AS check_name,
       count(*) FILTER (WHERE ip IS NOT NULL) AS with_ip,
       count(*) FILTER (WHERE "userAgent" IS NOT NULL) AS with_user_agent,
       CASE WHEN count(*) FILTER (WHERE ip IS NOT NULL OR "userAgent" IS NOT NULL) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM "ConsentLog";

-- -----------------------------------------------------------------------------
-- D1. Withdrawals following grants, per subject.
--     Each row is expanded into one event per subject link it carries, and
--     events are ordered per (link type, subject, purpose).
--       purpose  cookie | marketing | back-in-stock
--       grant    cookie: analytics or marketing true
--                marketing: marketing true (a registration still pending
--                  verification counts as a grant request)
--                back-in-stock: confirmation row (not unsubscribed)
--       withdrawal
--                cookie: a category that was true in the previous row of the
--                  same consent id / user is now false
--                marketing: marketing false with withdrawn / previous = true /
--                  reason 'anonymised'
--                back-in-stock: unsubscribed = true
--     withdrawals_without_prior_grant > 0 is REVIEW, not FAIL: the grant may
--     be a legacy row that carries no link.
-- -----------------------------------------------------------------------------
WITH links AS (
  SELECT id, kind, choices, "createdAt", 'user' AS link_type, "userId" AS subject FROM "ConsentLog" WHERE "userId" IS NOT NULL
  UNION ALL
  SELECT id, kind, choices, "createdAt", 'visitor', "visitorId" FROM "ConsentLog" WHERE "visitorId" IS NOT NULL
  UNION ALL
  SELECT id, kind, choices, "createdAt", 'subscriber', choices->>'subscriberId' FROM "ConsentLog" WHERE choices ? 'subscriberId'
  UNION ALL
  SELECT id, kind, choices, "createdAt", 'subscription', choices->>'subscriptionId' FROM "ConsentLog" WHERE choices ? 'subscriptionId'
),
events AS (
  SELECT l.*,
         CASE WHEN kind = 'cookie' THEN 'cookie'
              WHEN kind = 'back-in-stock' THEN 'back-in-stock'
              ELSE 'marketing' END AS purpose,
         (choices->'analytics' = 'true'::jsonb) AS analytics_on,
         (choices->'marketing' = 'true'::jsonb) AS marketing_on
  FROM links l
),
sequenced AS (
  SELECT e.*,
         lag(analytics_on) OVER w AS prev_analytics_on,
         lag(marketing_on) OVER w AS prev_marketing_on,
         row_number() OVER (PARTITION BY link_type, subject, purpose ORDER BY "createdAt" DESC, id DESC) AS recency
  FROM events e
  WINDOW w AS (PARTITION BY link_type, subject, purpose ORDER BY "createdAt", id)
),
classified AS (
  SELECT s.*,
         CASE
           WHEN purpose = 'cookie' THEN (analytics_on OR marketing_on)
           WHEN purpose = 'back-in-stock' THEN NOT coalesce(choices->'unsubscribed' = 'true'::jsonb, false)
           ELSE marketing_on
         END AS is_grant,
         CASE
           WHEN purpose = 'cookie' THEN (coalesce(prev_analytics_on, false) AND NOT analytics_on)
                                     OR (coalesce(prev_marketing_on, false) AND NOT marketing_on)
           WHEN purpose = 'back-in-stock' THEN coalesce(choices->'unsubscribed' = 'true'::jsonb, false)
           ELSE NOT marketing_on
                AND (coalesce(choices->'withdrawn' = 'true'::jsonb, false)
                     OR coalesce(choices->'previous' = 'true'::jsonb, false)
                     OR choices->>'reason' = 'anonymised')
         END AS is_withdrawal
  FROM sequenced s
),
flagged AS (
  SELECT c.*,
         coalesce(bool_or(is_grant) OVER (PARTITION BY link_type, subject, purpose ORDER BY "createdAt", id
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), false) AS grant_before
  FROM classified c
)
SELECT link_type,
       purpose,
       count(DISTINCT subject) AS subjects,
       count(DISTINCT subject) FILTER (WHERE is_grant) AS subjects_with_grant,
       count(*) FILTER (WHERE is_withdrawal) AS withdrawal_rows,
       count(*) FILTER (WHERE is_withdrawal AND grant_before) AS withdrawals_after_grant,
       count(*) FILTER (WHERE is_withdrawal AND NOT grant_before) AS withdrawals_without_prior_grant,
       count(DISTINCT subject) FILTER (WHERE recency = 1 AND is_withdrawal) AS subjects_now_withdrawn,
       count(DISTINCT subject) FILTER (WHERE recency = 1 AND is_grant) AS subjects_now_granted,
       CASE WHEN count(*) FILTER (WHERE is_withdrawal AND NOT grant_before) = 0 THEN 'PASS' ELSE 'REVIEW' END AS result
FROM flagged
GROUP BY link_type, purpose
ORDER BY link_type, purpose;

-- -----------------------------------------------------------------------------
-- D2. Stored state against the log: a subscription or opt-in flag in its
--     current state should have the matching log row. Rows created before
--     step 4 have no link and show up here as missing (legacy).
-- -----------------------------------------------------------------------------
SELECT 'Subscriber CONFIRMED without a marketing-email grant row' AS check_name,
       count(*) AS subjects,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM "ConsentLog" c
         WHERE c.kind = 'marketing-email' AND c.choices->>'subscriberId' = s.id AND c.choices->'marketing' = 'true'::jsonb)) AS missing
FROM "Subscriber" s WHERE s.status = 'CONFIRMED'
UNION ALL
SELECT 'Subscriber UNSUBSCRIBED without a withdrawal row',
       count(*),
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM "ConsentLog" c
         WHERE c.choices->>'subscriberId' = s.id AND c.choices->'marketing' = 'false'::jsonb))
FROM "Subscriber" s WHERE s.status = 'UNSUBSCRIBED'
UNION ALL
SELECT 'BackInStock CONFIRMED without a confirmation row',
       count(*),
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM "ConsentLog" c
         WHERE c.kind = 'back-in-stock' AND c.choices->>'subscriptionId' = b.id AND NOT c.choices ? 'unsubscribed'))
FROM "BackInStockSubscription" b WHERE b.status = 'CONFIRMED'
UNION ALL
SELECT 'BackInStock UNSUBSCRIBED without an unsubscribe row',
       count(*),
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM "ConsentLog" c
         WHERE c.kind = 'back-in-stock' AND c.choices->>'subscriptionId' = b.id AND c.choices->'unsubscribed' = 'true'::jsonb))
FROM "BackInStockSubscription" b WHERE b.status = 'UNSUBSCRIBED'
UNION ALL
SELECT 'User marketingOptIn=true but latest account marketing row is not a grant',
       count(*),
       count(*) FILTER (WHERE coalesce((
         SELECT c.choices->'marketing' = 'true'::jsonb FROM "ConsentLog" c
         WHERE c."userId" = u.id AND c.kind IN ('marketing-activation', 'marketing-preference', 'marketing-register')
         ORDER BY c."createdAt" DESC, c.id DESC LIMIT 1), false) = false)
FROM "User" u WHERE u."marketingOptIn"
UNION ALL
SELECT 'User marketingOptIn=false but latest account marketing row is a verified grant',
       count(*),
       count(*) FILTER (WHERE coalesce((
         SELECT c.choices->'marketing' = 'true'::jsonb AND NOT coalesce(c.choices->'pendingVerification' = 'true'::jsonb, false)
         FROM "ConsentLog" c
         WHERE c."userId" = u.id AND c.kind IN ('marketing-activation', 'marketing-preference', 'marketing-register')
         ORDER BY c."createdAt" DESC, c.id DESC LIMIT 1), false))
FROM "User" u WHERE NOT u."marketingOptIn" AND u."anonymizedAt" IS NULL;

-- -----------------------------------------------------------------------------
-- E1. Consent rows for anonymised subjects. Anonymisation keeps consent rows
--     as proof (lib/admin/customers.ts anonymiseCustomer) and appends a
--     marketing-preference withdrawal with reason 'anonymised' when the person
--     was opted in. Retention of these rows is an open D4 decision.
-- -----------------------------------------------------------------------------
SELECT 'rows of anonymised accounts' AS subject,
       count(*) AS rows,
       count(DISTINCT c."userId") AS subjects
FROM "ConsentLog" c JOIN "User" u ON u.id = c."userId"
WHERE u."anonymizedAt" IS NOT NULL
UNION ALL
SELECT 'rows tied to anonymised orders (orderNumber)',
       count(*), count(DISTINCT o.id)
FROM "ConsentLog" c JOIN "Order" o ON o.number = c.choices->>'orderNumber'
WHERE o."anonymizedAt" IS NOT NULL
UNION ALL
SELECT 'withdrawal rows written by anonymisation',
       count(*), count(DISTINCT coalesce(c."userId", c.choices->>'subscriberId', c.choices->>'orderNumber'))
FROM "ConsentLog" c
WHERE c.choices->>'reason' = 'anonymised'
UNION ALL
SELECT 'anonymised accounts whose latest marketing row is still a grant',
       count(*), count(*)
FROM "User" u
WHERE u."anonymizedAt" IS NOT NULL
  AND coalesce((SELECT c.choices->'marketing' = 'true'::jsonb FROM "ConsentLog" c
                WHERE c."userId" = u.id AND c.kind LIKE 'marketing-%'
                ORDER BY c."createdAt" DESC, c.id DESC LIMIT 1), false);

-- E2. Anonymised subjects in the database at all (context for E1).
SELECT (SELECT count(*) FROM "User"  WHERE "anonymizedAt" IS NOT NULL) AS anonymised_users,
       (SELECT count(*) FROM "Order" WHERE "anonymizedAt" IS NOT NULL) AS anonymised_orders;

-- QA 2026-10-03, data only: two seeded merchandising texts named a figure that
-- the operator can change elsewhere, so the text could state an untrue claim.
-- They now carry tokens the server fills from the live data (lib/content/tokens):
--
-- 1. T6-05: the marquee said "od 45 €" whatever `shipping.freeThresholdCents`
--    held; {prag} is that threshold, formatted like every price.
-- 2. T6-04: the welcome popup's thank-you text named WELCOME10 whatever code
--    the popup applied; {koda} is the popup's `couponCode`.
--
-- Each row changes only while it still holds the exact text the seed wrote; an
-- operator's own text is kept as typed.

BEGIN;

UPDATE "Setting"
SET "value" = '"Brezplačna dostava pri naročilih od {prag}"'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'marquee.text' AND "value" = '"Brezplačna dostava pri naročilih od 45 €"'::jsonb;

UPDATE "Setting"
SET "value" = jsonb_set("value", '{thankYouBody}', '"Preverite nabiralnik in potrdite prijavo. Koda {koda} je že shranjena za blagajno."'::jsonb),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'welcomePopup'
  AND jsonb_typeof("value") = 'object'
  AND "value" ->> 'thankYouBody' = 'Preverite nabiralnik in potrdite prijavo. Koda WELCOME10 je že shranjena za blagajno.';

COMMIT;

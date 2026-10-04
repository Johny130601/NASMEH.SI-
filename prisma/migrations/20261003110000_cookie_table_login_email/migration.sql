-- QA 2026-10-03, data only: two guarded edits of the live cookie table
-- (`consent.cookies`; lib/copy/cmp.ts COOKIES, which the seed writes too).
--
-- 1. T1-10: the table did not list `nasmeh_login_email` (httpOnly, path
--    /prijava, five minutes: the address typed into a failed sign-in, set by
--    app/(storefront)/prijava/actions.ts). The row is added after
--    `nasmeh_preauth` (first, when that row is gone), and only to a table that
--    does not name the cookie yet: a row the operator wrote for it is kept.
-- 2. T1-07: the welcome popup's flag is a session cookie now, no longer a
--    sessionStorage key. Its row is replaced only while it still holds the
--    exact text 20260913100000_phase9_cookie_table wrote; an edited row is kept.
--
-- Nothing else in the table changes, and a value that is not an array (never
-- written by this app) is left alone. jsonb equality ignores key order and
-- whitespace. Adding a necessary row does not bump `consent.version`.

UPDATE "Setting" AS s
SET "value" = (
    SELECT jsonb_agg(merged.entry ORDER BY merged.ord)
    FROM (
      SELECT t.entry, t.ord::numeric AS ord
      FROM jsonb_array_elements(s."value") WITH ORDINALITY AS t(entry, ord)
      UNION ALL
      SELECT '{"name":"nasmeh_login_email","provider":"Nasmeh.si","purpose":"E-poštni naslov, vpisan ob neuspeli prijavi, da ga obrazec za prijavo prikaže znova (samo na straneh /prijava).","duration":"5 minut","category":"necessary"}'::jsonb,
             COALESCE((
               SELECT p.ord
               FROM jsonb_array_elements(s."value") WITH ORDINALITY AS p(entry, ord)
               WHERE p.entry ->> 'name' = 'nasmeh_preauth'
               ORDER BY p.ord
               LIMIT 1
             ), 0) + 0.5
    ) AS merged
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE s."key" = 'consent.cookies'
  -- CASE, not AND: the array functions must never see a value that is not an array
  AND CASE WHEN jsonb_typeof(s."value") = 'array' THEN NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(s."value") AS e(entry)
    WHERE e.entry ->> 'name' = 'nasmeh_login_email'
  ) ELSE false END;

UPDATE "Setting" AS s
SET "value" = (
    SELECT jsonb_agg(
      CASE
        WHEN t.entry = '{"name":"nasmeh_welcome_seen","provider":"Nasmeh.si","purpose":"Zapis v shrambi seje brskalnika (sessionStorage), ne piškotek: pojavno okno dobrodošlice se v isti seji ne prikaže znova.","duration":"do zaprtja zavihka","category":"necessary"}'::jsonb
        THEN '{"name":"nasmeh_welcome_seen","provider":"Nasmeh.si","purpose":"Piškotek seje: ko pojavno okno dobrodošlice zaprete ali se prijavite na e-novice, se do zaprtja brskalnika ne prikaže znova.","duration":"seja","category":"necessary"}'::jsonb
        ELSE t.entry
      END
      ORDER BY t.ord
    )
    FROM jsonb_array_elements(s."value") WITH ORDINALITY AS t(entry, ord)
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE s."key" = 'consent.cookies'
  AND CASE WHEN jsonb_typeof(s."value") = 'array' THEN EXISTS (
    SELECT 1
    FROM jsonb_array_elements(s."value") AS e(entry)
    WHERE e.entry = '{"name":"nasmeh_welcome_seen","provider":"Nasmeh.si","purpose":"Zapis v shrambi seje brskalnika (sessionStorage), ne piškotek: pojavno okno dobrodošlice se v isti seji ne prikaže znova.","duration":"do zaprtja zavihka","category":"necessary"}'::jsonb
  ) ELSE false END;

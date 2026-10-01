-- QA 2026-09-29 (T1-19): two seeded links pointed at the wrong destination.
-- Data only. Each statement replaces one seeded value, and only while the stored
-- value still equals the exact original seed, so operator-edited menus and
-- marquee links are never touched and a re-run is a no-op. prisma/seed.ts
-- carries the same resulting values for fresh databases, and
-- tests/unit/storefront-links-migration.test.ts keeps both in step.
BEGIN;

-- Footer "Paketi" opened the routine bundle's product page while the header's
-- "PAKETI & PRIHRANKI" opens the bundles collection (AGENTS §5.11): both now
-- lead to the collection view.
UPDATE "Menu"
SET "items" = (
    SELECT jsonb_agg(
      CASE WHEN entry.item->>'label' = 'Paketi' AND entry.item->>'href' = '/izdelek/paket-popolna-rutina'
        THEN jsonb_set(entry.item, '{href}', '"/trgovina?kolekcija=paketi"'::jsonb)
        ELSE entry.item END
      ORDER BY entry.position)
    FROM jsonb_array_elements("items") WITH ORDINALITY AS entry(item, position)
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "handle" = 'footer-trgovina'
  AND jsonb_typeof("items") = 'array'
  AND "items" @> '[{"label":"Paketi","href":"/izdelek/paket-popolna-rutina"}]'::jsonb;

-- The announcement bar ("Brezplačna dostava pri naročilih od 45 €") sent a new
-- visitor to an empty checkout; it now opens the shop.
UPDATE "Setting"
SET "value" = '"/trgovina"'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'marquee.href' AND "value" = '"/checkout"'::jsonb;

COMMIT;

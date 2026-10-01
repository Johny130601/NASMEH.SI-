-- QA 2026-09-30: the seeded sold-out demo product (belilni-trakci-potovalni-7)
-- typed its stock state into its copy — "Trenutno razprodano." in the
-- description and the SEO description, a "Kdaj bo izdelek spet na zalogi?"
-- FAQ and a "RAZPRODANO" badge — so a restock left a false stock claim on the
-- page (AGENTS §8.23: a scarcity or stock hook is computed, never typed). The
-- sold-out state is shown by the computed pill, the OutOfStock availability and
-- the "Obvestite me" capture.
-- Data only. Each statement replaces one seeded value, and only while the stored
-- value still equals the exact original seed, so operator-edited copy is never
-- touched and a re-run is a no-op. prisma/seed.ts and prisma/seed-pdp.ts carry
-- the same resulting values; tests/unit/seed-stock-claims-migration.test.ts
-- keeps them in step.
BEGIN;

UPDATE "Product"
SET "description" = 'Potovalno pakiranje belilnih trakov: 7 uporab za na pot.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7'
  AND "description" = 'Potovalno pakiranje belilnih trakov: 7 uporab za na pot. Trenutno razprodano.';

UPDATE "Product"
SET "seoDescription" = 'Potovalno pakiranje belilnih trakov Nasmeh.si: 7 uporab za na pot, enaka formula brez peroksida kot pri polnem pakiranju.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7'
  AND "seoDescription" = 'Potovalno pakiranje belilnih trakov Nasmeh.si: 7 uporab za na pot. Trenutno razprodano — prijavite se na obvestilo o zalogi.';

UPDATE "Product"
SET "faq" = jsonb_set(
    jsonb_set("faq"::jsonb, '{0,q}', to_jsonb('Kaj, če izdelka ni na zalogi?'::text)),
    '{0,a}', to_jsonb('Prijavite se na obvestilo o zalogi na tej strani — ko je izdelek spet na voljo, vam pošljemo e-pošto.'::text)),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7'
  AND "faq"::jsonb #>> '{0,q}' = 'Kdaj bo izdelek spet na zalogi?'
  AND "faq"::jsonb #>> '{0,a}' = 'Natančnega datuma še nimamo — najhitreje izveste, če se prijavite na obvestilo o zalogi na tej strani.';

UPDATE "Product"
SET "badges" = '[{"label":"NOVO","style":"outline"}]'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7'
  AND "badges"::jsonb = '[{"label":"NOVO","style":"outline"},{"label":"RAZPRODANO","style":"grey"}]'::jsonb;

COMMIT;

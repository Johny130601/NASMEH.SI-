-- User-approved shopping-only navigation. Preserve unrelated operator data.
BEGIN;

-- Temporary recursive transform also covers nested custom menu groups.
CREATE FUNCTION pg_temp.nasmeh_shopping_menu(items JSONB) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  item JSONB;
  result JSONB := '[]'::jsonb;
  destination TEXT;
BEGIN
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RETURN items; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    destination := regexp_replace(item->>'href', '[?#].*$', '');
    IF jsonb_typeof(item->'children') = 'array' THEN
      item := jsonb_set(item, '{children}', pg_temp.nasmeh_shopping_menu(item->'children'));
    END IF;
    IF destination IN ('/pomoc', '/o-nas', '/razisli', '/dostava') THEN
      -- Removing a grouping must not erase unrelated operator-authored links.
      IF jsonb_typeof(item->'children') = 'array' THEN result := result || (item->'children'); END IF;
      CONTINUE;
    END IF;
    IF item->>'href' = '/paketi' THEN
      item := jsonb_set(item, '{href}', '"/trgovina?kolekcija=paketi"'::jsonb);
    END IF;
    result := result || jsonb_build_array(item);
  END LOOP;
  RETURN result;
END;
$$;

UPDATE "Menu"
SET "items" = pg_temp.nasmeh_shopping_menu("items"), "updatedAt" = CURRENT_TIMESTAMP
WHERE "items" IS DISTINCT FROM pg_temp.nasmeh_shopping_menu("items");

DROP FUNCTION pg_temp.nasmeh_shopping_menu(JSONB);

-- Account links are rendered from the live session in the drawer utility row.
UPDATE "Menu" SET "items" = (
  SELECT COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
  FROM jsonb_array_elements("items") WITH ORDINALITY AS entry(item, ordinal)
  WHERE COALESCE(item->>'href', '') NOT IN ('/prijava', '/racun')
), "updatedAt" = CURRENT_TIMESTAMP
WHERE "handle" = 'mobile' AND jsonb_typeof("items") = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements("items") AS entry(item)
              WHERE item->>'href' IN ('/prijava', '/racun'));

-- Keep existing support links and labels; only add missing destinations.
DO $$
DECLARE
  links JSONB;
  addition JSONB;
BEGIN
  SELECT "items" INTO links FROM "Menu" WHERE "handle" = 'footer-pomoc';
  IF jsonb_typeof(links) = 'array' THEN
    FOR addition IN SELECT value FROM jsonb_array_elements('[
      {"label":"Kontakt","href":"/kontakt"},
      {"label":"Sledi naročilu","href":"/sledi"},
      {"label":"Odstop od pogodbe","href":"/odstop-od-pogodbe"},
      {"label":"Reklamacije","href":"/reklamacije"}
    ]'::jsonb) LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(links) AS entry(item)
                     WHERE item->>'href' = addition->>'href') THEN
        links := links || jsonb_build_array(addition);
      END IF;
    END LOOP;
    UPDATE "Menu" SET "items" = links, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "handle" = 'footer-pomoc' AND "items" IS DISTINCT FROM links;
  END IF;
END;
$$;

UPDATE "Menu" SET "title" = 'Noga — Podpora', "updatedAt" = CURRENT_TIMESTAMP
WHERE "handle" = 'footer-pomoc' AND "title" = 'Noga — Pomoč';

-- Only replace known retired links; leave campaign copy/media/settings intact.
UPDATE "Setting" SET "value" = '"/checkout"'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'marquee.href' AND "value" = '"/dostava"'::jsonb;

UPDATE "Setting"
SET "value" = jsonb_set("value", '{promoOverlayHref}', '"/checkout"'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'home.hero' AND "value"->>'promoOverlayHref' = '/dostava';

-- Retain content for audit/history while removing its public publication.
UPDATE "ContentPage" SET "published" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN ('pomoc', 'o-nas', 'razisli', 'dostava', 'paketi') AND "published" = true;

-- Replace only the original unreviewed draft sentence, never approved/custom text.
UPDATE "ContentPage"
SET "body" = replace("body",
  'Pogoji, roki in stroški dostave so opisani na strani Dostava.',
  'Načini, predvideni roki in stroški dostave so prikazani na blagajni pred oddajo naročila.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'pogoji-poslovanja' AND "reviewed" = false
  AND strpos("body", 'Pogoji, roki in stroški dostave so opisani na strani Dostava.') > 0;

COMMIT;

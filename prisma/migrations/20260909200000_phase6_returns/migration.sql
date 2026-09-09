-- Phase 6 step 4: returns, withdrawal, complaints and adverse-event reporting.
BEGIN;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "details" JSONB;

-- B7: the online withdrawal form now exists. Replace only the original
-- unreviewed draft sentence; approved or custom text is never touched.
UPDATE "ContentPage"
SET "body" = replace("body",
  '<p>Obrazec za odstop od pogodbe (ime in naslov potrošnika, številka naročila, datum, podpis) pošljite na info@nasmeh.si — spletni obrazec je v pripravi.</p>',
  '<p>Uporabite spletni obrazec spodaj ali prenesite vzorčni obrazec (PDF) in ga pošljite na info@nasmeh.si.</p>'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'odstop-od-pogodbe' AND "reviewed" = false
  AND strpos("body", 'spletni obrazec je v pripravi') > 0;

-- 30-day money-back guarantee policy page (§12.4), draft pending legal review.
-- Added only when missing so an operator-authored page is preserved.
INSERT INTO "ContentPage" ("id", "title", "slug", "body", "template", "seoDescription", "published", "reviewed", "createdAt", "updatedAt")
SELECT
  'cp_' || md5(random()::text || clock_timestamp()::text),
  'Jamstvo vračila denarja',
  'garancija-vracila-denarja',
  '<h2>1. Kaj obljubljamo</h2>
<p>Če z izdelkom niste zadovoljni, vam v 30 dneh od dostave vrnemo kupnino. To je prostovoljna obljuba Nasmeh.si nad zakonsko 14-dnevno pravico do odstopa, ki je opisana na strani Odstop od pogodbe.</p>
<h2>2. Pogoji</h2>
<ul>
<li>Pred vračilom nas kontaktirajte prek strani Kontakt (tema Vračilo izdelkov) in navedite številko naročila.</li>
<li>Priložite dokazilo o nakupu (potrditev naročila ali račun).</li>
<li>Priložite fotografijo izdelka in embalaže.</li>
<li>Jamstvo velja za prvi nakup posameznega izdelka in za največ en kos posameznega izdelka na naročilo.</li>
</ul>
<h2>3. Vračilo kupnine</h2>
<p>Kupnino vrnemo na prvotno plačilno sredstvo najkasneje v 14 dneh po potrditvi zahtevka. Stroške povratne pošiljke, kadar jo zahtevamo, krije kupec.</p>
<h2>4. Razmerje do zakonskih pravic</h2>
<p>Jamstvo ne omejuje zakonskih pravic potrošnika: pravice do odstopa od pogodbe in uveljavljanja reklamacij zaradi stvarne napake.</p>',
  'LEGAL',
  '30-dnevno jamstvo vračila denarja Nasmeh.si — pogoji prostovoljne garancije nad zakonsko pravico do odstopa.',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ContentPage" WHERE "slug" = 'garancija-vracila-denarja');

-- Footer links: keep existing labels and order, add only missing destinations.
DO $$
DECLARE
  links JSONB;
  addition JSONB;
  handle_name TEXT;
  additions JSONB;
BEGIN
  FOR handle_name, additions IN SELECT * FROM (VALUES
    ('footer-pomoc', '[{"label":"Prijava neželenega učinka","href":"/prijava-nezelenega-ucinka"}]'::jsonb),
    ('footer-pravno', '[{"label":"Jamstvo vračila denarja","href":"/garancija-vracila-denarja"}]'::jsonb)
  ) AS pairs(handle_name, additions) LOOP
    SELECT "items" INTO links FROM "Menu" WHERE "handle" = handle_name;
    IF jsonb_typeof(links) = 'array' THEN
      FOR addition IN SELECT value FROM jsonb_array_elements(additions) LOOP
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(links) AS entry(item)
                       WHERE item->>'href' = addition->>'href') THEN
          links := links || jsonb_build_array(addition);
        END IF;
      END LOOP;
      UPDATE "Menu" SET "items" = links, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "handle" = handle_name AND "items" IS DISTINCT FROM links;
    END IF;
  END LOOP;
END;
$$;

COMMIT;

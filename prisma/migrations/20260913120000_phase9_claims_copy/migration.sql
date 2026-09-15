-- Phase 9 step 4: claims discipline (Reg. 655/2013) and original copy in place
-- of lines translated from competitor research notes.
-- Data only. Every statement replaces one seeded value, and only while the
-- stored value still equals the exact original seed or migration default, so
-- operator-edited copy is never overwritten and a re-run is a no-op.
-- prisma/seed.ts and prisma/seed-pdp.ts carry the same resulting values for
-- fresh databases.
BEGIN;

-- Homepage routine banner (inserted by 20260910180000_phase7_cms): an original
-- title, and the footnote loses its "*" because the banner carries no marker.
UPDATE "Setting"
SET "value" = jsonb_set("value", '{title}', to_jsonb('Trakci, ustna voda in serum v enem paketu.'::text)),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'home.routineBanner'
  AND "value"->>'title' = 'Vaša vsakodnevna rutina beljenja — urejena.';

UPDATE "Setting"
SET "value" = jsonb_set("value", '{footnote}', to_jsonb('Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.'::text)),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'home.routineBanner'
  AND "value"->>'footnote' = '*Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.';

-- Homepage hero (seeded): no enamel promise or 14-day efficacy claim; the
-- remaining claim carries a marker resolved by the new live footnote.
UPDATE "Setting"
SET "value" = jsonb_set(
    jsonb_set("value", '{subtitle}', to_jsonb('Belilni trakci s formulo brez peroksida za svetlejši nasmeh* — 30 minut na dan, 14 zaporednih dni.'::text)),
    '{footnote}', to_jsonb('*Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.'::text)),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'home.hero'
  AND "value"->>'subtitle' = 'Belilni trakci z nežno formulo brez peroksida — vidno svetlejši nasmeh že v 14 dneh, nežno do sklenine.'
  AND coalesce("value"->>'footnote', '') = '';

-- Seeded product copy (prisma/seed-pdp.ts): no study figures, mechanism,
-- durations, tolerance or permanence promises, free-from parabens claim, or
-- static savings and delivery terms; the guarantee accordion summarises and
-- links /garancija-vracila-denarja. One statement per changed field.

-- belilni-trakci-za-zobe
-- description
UPDATE "Product" SET "description" = 'Naš vodilni izdelek: belilni trakci s formulo brez peroksida za 14-dnevni protokol, 30 minut na dan.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "description" = 'Naš vodilni izdelek: belilni trakci za vidno svetlejši nasmeh v 14 dneh. Nežni do sklenine, brez peroksida.';
-- seoDescription
UPDATE "Product" SET "seoDescription" = 'Belilni trakci Nasmeh.si: 14-dnevni protokol, 30 minut na dan, formula brez peroksida. Sestavine (INCI), navodila za uporabo in pogoji jamstva na strani izdelka.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "seoDescription" = 'Belilni trakci Nasmeh.si za vidno svetlejši nasmeh v 14 dneh. Nežna formula brez peroksida, 30 minut na dan, rezultati že po prvi uporabi*.';
-- customFields.uspChips
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{uspChips}', '["Za svetlejši nasmeh*","30 minut na dan","Brez peroksida"]'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "customFields" #> '{uspChips}' = '["Rezultati že po 1 uporabi*","30 minut na dan","Brez peroksida"]'::jsonb;
-- customFields.intro
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{intro}', to_jsonb('Naš vodilni izdelek: belilni trakci za domačo uporabo s formulo brez peroksida — za svetlejši nasmeh*.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "customFields" #>> '{intro}' = 'Naš vodilni izdelek: belilni trakci, ki jih zobe in dlesni ne čutijo. Formula brez peroksida deluje na površinske in globlje madeže — za nasmeh, ki ga opazite vi in vsi okoli vas.';
-- customFields.bullets
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{bullets}', '["Za svetlejši nasmeh po 14-dnevnem protokolu*","Enostavna uporaba v 3 korakih","Le 30 minut na dan, doma ali na poti","14 uporab v pakiranju (14-dnevni protokol)"]'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "customFields" #> '{bullets}' = '["Vidno svetlejši zobje že po prvi uporabi*","Nežno do sklenine — brez pekočega občutka","Le 30 minut na dan, doma ali na poti","14 uporab v pakiranju (14-dnevni protokol)"]'::jsonb;
-- accordions.howItWorks
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{howItWorks}', to_jsonb('<p>Trak namestite na zobe in ga pustite 30 minut: ves ta čas zadrži formulo ob površini zob. Uporaba je suha in enostavna — trak se odlepi brez ostankov. Za najboljše rezultate uporabljajte 14 zaporednih dni. Če se pojavi neugodje, uporabo prekinite in se posvetujte z zobozdravnikom.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "accordions" #>> '{howItWorks}' = '<p>Trak se namesti na zobe in deluje 30 minut: aktivni belilni kompleks se veže na barvne pigmente v sklenini in jih razgradi, ne da bi dražil dlesni ali sklenino. Uporaba je suha in enostavna — trak se odlepi brez ostankov. Za najboljše rezultate uporabljajte 14 zaporednih dni.</p>';
-- accordions.inci
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{inci}', to_jsonb('<p>Aqua, Glycerin, PVP, Cellulose Gum, Carbomer, Aroma, Sodium Hydroxide, Sodium Saccharin, Mentha Piperita Oil, Xylitol, Tocopherol.</p><p>Formula ne vsebuje vodikovega peroksida in SLS.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "accordions" #>> '{inci}' = '<p>Aqua, Glycerin, PVP, Cellulose Gum, Carbomer, Aroma, Sodium Hydroxide, Sodium Saccharin, Mentha Piperita Oil, Xylitol, Tocopherol.</p><p>Formula ne vsebuje vodikovega peroksida, SLS in parabenov.</p>';
-- accordions.guarantee
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{guarantee}', to_jsonb('<p>Za izdelek velja 30-dnevno jamstvo vračila denarja. Pogoji in postopek so objavljeni na strani <a href="/garancija-vracila-denarja" class="underline underline-offset-2">Jamstvo vračila denarja</a>. Jamstvo ne vpliva na vaše zakonske pravice, kot sta pravica do odstopa od pogodbe in uveljavljanje pravic zaradi stvarne napake.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "accordions" #>> '{guarantee}' = '<p>Z nakupom ni nobenega tveganja: če z rezultati niste zadovoljni, vam v 30 dneh od prevzema vrnemo kupnino. Pogoj je predhodna prijava na info@nasmeh.si z dokazilom o nakupu; podrobnosti so na strani Odstop od pogodbe. Jamstvo velja za prvi kupljeni izdelek enake vrste na stranko.</p>';
-- accordions.tested
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{tested}', to_jsonb('<p>*Rezultati se lahko razlikujejo od osebe do osebe: odvisni so od izhodiščnega odtenka zob in navad, kot so kava, čaj in kajenje. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "accordions" #>> '{tested}' = '<p>*V neodvisni potrošniški raziskavi (n = 52, 14 dni) je 89 % udeležencev po prvi uporabi poročalo o vidno svetlejšem nasmehu; po 14 dneh 96 %. Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.</p>';
-- faq.0.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{0,a}', to_jsonb('Protokol traja 14 zaporednih dni. Kdaj in koliko razlike opazite, je odvisno od izhodiščnega odtenka zob in navad (kava, čaj, kajenje), zato se rezultati razlikujejo od osebe do osebe.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "faq" #>> '{0,a}' = 'Večina uporabnikov opazi razliko že po prvi uporabi*, polni učinek pa po 14-dnevnem protokolu. Rezultat je odvisen tudi od izhodiščnega odtenka in navad (kava, čaj, kajenje).';
-- faq.1.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{1,a}', to_jsonb('Če imate občutljive zobe, se pred uporabo posvetujte z zobozdravnikom. Če se med uporabo pojavi neugodje, uporabo prekinite.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "faq" #>> '{1,a}' = 'Da — formula brez peroksida je zasnovana prav za občutljive zobe. Če se pojavi neugodje, uporabo prekinite in se posvetujte z zobozdravnikom.';
-- faq.2.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{2,a}', to_jsonb('Umetni materiali (prevleke, krone, plombe) ne spremenijo barve. Pred uporabo se posvetujte z zobozdravnikom.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "faq" #>> '{2,a}' = 'Trakci belijo naravno sklenino; umetni materiali (prevleke, krone, plombe) se ne prebarvajo. Priporočamo posvet z zobozdravnikom pred uporabo.';
-- faq.3.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{3,a}', to_jsonb('Med nosečnostjo in dojenjem se pred uporabo posvetujte z zdravnikom.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "faq" #>> '{3,a}' = 'Prevladujočih dokazov o škodljivosti ni, vendar iz varnostnih razlogov priporočamo, da se med nosečnostjo in dojenjem o uporabi posvetujete z zdravnikom.';
-- education.1.heading
UPDATE "Product" SET "education" = jsonb_set("education", '{1,heading}', to_jsonb('30 minut ob vsakdanjih opravilih'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "education" #>> '{1,heading}' = '30 minut, ki jih sploh ne opazite';
-- education.1.body
UPDATE "Product" SET "education" = jsonb_set("education", '{1,body}', to_jsonb('Trak se tesno prilega zobem, zato lahko med nošenjem govorite, delate ali gledate serijo.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-za-zobe' AND "education" #>> '{1,body}' = 'Trak se popolnoma prilega, zato med nošenjem lahko govorite, delate ali gledate serijo. Beljenje se zgodi samo — vi se samo nasmehnete.';

-- ustna-voda-globinsko-ciscenje
-- description
UPDATE "Product" SET "description" = 'Ustna voda za vsakodnevno ustno nego po ščetkanju, zjutraj in zvečer.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "description" = 'Ustna voda za vsakodnevno rutino — odstrani nečistoče in osveži dih. Vidni rezultat že po prvi uporabi.';
-- seoTitle
UPDATE "Product" SET "seoTitle" = 'Ustna voda za globinsko čiščenje — za vsakodnevno rutino', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "seoTitle" = 'Ustna voda za globinsko čiščenje — vidite, kaj ščetka zamudi';
-- seoDescription
UPDATE "Product" SET "seoDescription" = 'Ustna voda Nasmeh.si za vsakodnevno ustno nego: 10 ml po ščetkanju, zjutraj in zvečer. Sestavine (INCI) in navodila za uporabo na strani izdelka.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "seoDescription" = 'Ustna voda Nasmeh.si: globinsko čiščenje, svež dah in vzdrževanje beline. Vidite, kaj ščetka pusti za seboj — že po prvi uporabi.';
-- customFields.uspChips
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{uspChips}', '["Za občutek čistih ust*","Za svež dah*","Za vsakodnevno rutino"]'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "customFields" #> '{uspChips}' = '["Vidno čiščenje*","Svež dah do 12 ur","Vzdržuje belino"]'::jsonb;
-- customFields.intro
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{intro}', to_jsonb('Ustna voda za vsakodnevno rutino po ščetkanju: ob izpiranju doseže tudi prostore med zobmi in ob dlesni. Osveži dah in pusti občutek čistih ust*.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "customFields" #>> '{intro}' = 'Ustna voda, ki pokaže svoje delo: ob izplakanju vidite, kaj ščetka pusti za seboj. Globinsko očisti, osveži dah in pomaga ohraniti svetel nasmeh.';
-- customFields.bullets
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{bullets}', '["Občutek čistih ust po izpiranju*","Osveži dah*","Dopolnilo k rutini z belilnimi trakci","Formula brez alkohola"]'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "customFields" #> '{bullets}' = '["Vidni dokaz čiščenja že ob prvi uporabi*","Svež dah do 12 ur","Pomaga ohranjati rezultate beljenja","Brez alkohola — brez pekočega občutka"]'::jsonb;
-- accordions.howItWorks
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{howItWorks}', to_jsonb('<p>Po ščetkanju 30 sekund izpirajte usta z 10 ml ustne vode, nato jo izpljunite. Tekočina ob izpiranju doseže tudi prostore med zobmi in ob dlesni. Ustna voda dopolnjuje ščetkanje in čiščenje medzobnih prostorov, ne nadomešča pa ju.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "accordions" #>> '{howItWorks}' = '<p>Aktivni sestavinski kompleks se ob izpiranju veže na proteine in bakterijski biofilm v ustih in jih ob izpljuvanju odstrani — zato je rezultat dobesedno viden. Z redno uporabo pomaga ohranjati čistočo med zobmi in ob dlesni, kamor ščetka ne seže.</p>';
-- accordions.guarantee
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{guarantee}', to_jsonb('<p>Za izdelek velja 30-dnevno jamstvo vračila denarja. Pogoji in postopek so objavljeni na strani <a href="/garancija-vracila-denarja" class="underline underline-offset-2">Jamstvo vračila denarja</a>. Jamstvo ne vpliva na vaše zakonske pravice, kot sta pravica do odstopa od pogodbe in uveljavljanje pravic zaradi stvarne napake.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "accordions" #>> '{guarantee}' = '<p>Z nakupom ni nobenega tveganja: če z rezultati niste zadovoljni, vam v 30 dneh od prevzema vrnemo kupnino. Pogoj je predhodna prijava na info@nasmeh.si z dokazilom o nakupu; podrobnosti so na strani Odstop od pogodbe. Jamstvo velja za prvi kupljeni izdelek enake vrste na stranko.</p>';
-- accordions.tested
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{tested}', to_jsonb('<p>*Navedbe opisujejo občutek po uporabi; rezultati se lahko razlikujejo od osebe do osebe. Ustna voda ne nadomešča ščetkanja in rednih pregledov pri zobozdravniku.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "accordions" #>> '{tested}' = '<p>*V potrošniškem testu (n = 48) je 94 % udeležencev ob prvi uporabi poročalo o vidnem učinku čiščenja, 90 % pa o prijetnejši svežini diha naslednje jutro. Rezultati se lahko razlikujejo.</p>';
-- faq.1.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{1,a}', to_jsonb('Da, namenjena je vsakodnevni uporabi, zjutraj in zvečer po ščetkanju. Če se pojavi neugodje, uporabo prekinite.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "faq" #>> '{1,a}' = 'Da — formula brez alkohola je nežna za vsakodnevno rutino, dvakrat na dan.';
-- faq.2.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{2,a}', to_jsonb('Ne, ustna voda ni belilni izdelek. Za beljenje zob priporočamo belilne trakce.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "faq" #>> '{2,a}' = 'Ustna voda pomaga odstranjevati površinske madeže in ohranja rezultate beljenja; za aktivno beljenje priporočamo belilne trakce.';
-- education.0.heading
UPDATE "Product" SET "education" = jsonb_set("education", '{0,heading}', to_jsonb('Tudi tam, kamor ščetka težje seže'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "education" #>> '{0,heading}' = 'Kaj ščetka zamudi';
-- education.0.body
UPDATE "Product" SET "education" = jsonb_set("education", '{0,body}', to_jsonb('Prostori med zobmi, rob ob dlesni in zadnji kočniki so s ščetko težje dosegljivi. Tekočina ob izpiranju doseže tudi ta mesta, zato je ustna voda dober dodatek k ščetkanju in čiščenju medzobnih prostorov.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "education" #>> '{0,body}' = 'Ščetka doseže le okoli 60 % površin zob. Prostore med zobmi, gubice ob dlesni in zadnje kočnike preplavi ustna voda — in ob izpljuvanju vidite, kaj je ostalo za ščetko. Dokaz, ki ga čutite in vidite.';
-- education.1.body
UPDATE "Product" SET "education" = jsonb_set("education", '{1,body}', to_jsonb('Ustna voda se lepo vključi v rutino z belilnimi trakci: trakci so namenjeni 14-dnevnemu protokolu, ustna voda pa vsakodnevni negi zjutraj in zvečer.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'ustna-voda-globinsko-ciscenje' AND "education" #>> '{1,body}' = 'Po 14-dnevnem protokolu beljenja ustna voda pomaga, da svetel rezultat traja dlje: zmanjšuje novo nabiranje madežev iz kave, čaja in vsakodnevne prehrane.';

-- serum-korektor-barve-zob
-- description
UPDATE "Product" SET "description" = 'Korektor za zobe: serum z vijoličnimi pigmenti za začasno optično korekcijo rumenih tonov. Za posebne priložnosti.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "description" = 'Korektor za zobe: serum takoj optično nevtralizira rumene tone. Za posebne priložnosti in vsakdan.';
-- seoTitle
UPDATE "Product" SET "seoTitle" = 'Serum korektor barve zob — začasna optična korekcija', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "seoTitle" = 'Serum korektor barve zob — takojšnja optična korekcija';
-- seoDescription
UPDATE "Product" SET "seoDescription" = 'Serum korektor Nasmeh.si z vijoličnimi pigmenti za začasno optično korekcijo rumenih tonov. Nanos v 30 sekundah. Sestavine (INCI) in navodila za uporabo na strani izdelka.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "seoDescription" = 'Serum korektor Nasmeh.si: vijolična nevtralizira rumene tone. Takojšnja optična korekcija nasmeha v 30 sekundah — za posebne priložnosti.';
-- customFields.intro
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{intro}', to_jsonb('Korektor za zobe: vijolični pigmenti v serumu optično nevtralizirajo rumenkaste tone, zato je nasmeh videti svetlejši*. Učinek je začasen — primeren pred dogodki in fotografiranjem.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "customFields" #>> '{intro}' = 'Korektor za zobe: tako kot vijolični šampon za lase, serum optično nevtralizira rumene tone. Nasmeh je videti svetlejši že med nanosom — idealno pred dogodki in fotografiranjem.';
-- customFields.bullets
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{bullets}', '["Optično svetlejši videz nasmeha*","Optična korekcija — brez belilnih učinkovin","Približno 30 nanosov v pakiranju","Za trajnejše rezultate: belilni trakci"]'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "customFields" #> '{bullets}' = '["Vidno svetlejši nasmeh že med nanosom*","Optična korekcija — brez belilnih učinkovin","Nežen za vsakodnevno uporabo","Za trajnejše rezultate: belilni trakci"]'::jsonb;
-- accordions.howItWorks
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{howItWorks}', to_jsonb('<p>Na barvnem krogu je vijolična nasproti rumeni: tanka, nevtralna plast vijoličnih pigmentov na zobeh optično izniči rumene podtone. Učinek je površinski in začasen (do naslednjega ščetkanja) — pošteno povedano, gre za ličenje, ne beljenje. Za beljenje zob priporočamo belilne trakce.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "accordions" #>> '{howItWorks}' = '<p>Na barvnem krogu je vijolična nasproti rumeni: tanka, nevtralna plast vijoličnih pigmentov na zobeh optično izniči rumene podtone. Učinek je površinski in začasen (do naslednjega ščetkanja) — pošteno povedano, gre za ličenje, ne beljenje. Za trajno spremembo odtenka priporočamo belilne trakce.</p>';
-- accordions.guarantee
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{guarantee}', to_jsonb('<p>Za izdelek velja 30-dnevno jamstvo vračila denarja. Pogoji in postopek so objavljeni na strani <a href="/garancija-vracila-denarja" class="underline underline-offset-2">Jamstvo vračila denarja</a>. Jamstvo ne vpliva na vaše zakonske pravice, kot sta pravica do odstopa od pogodbe in uveljavljanje pravic zaradi stvarne napake.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "accordions" #>> '{guarantee}' = '<p>Z nakupom ni nobenega tveganja: če z rezultati niste zadovoljni, vam v 30 dneh od prevzema vrnemo kupnino. Pogoj je predhodna prijava na info@nasmeh.si z dokazilom o nakupu; podrobnosti so na strani Odstop od pogodbe. Jamstvo velja za prvi kupljeni izdelek enake vrste na stranko.</p>';
-- accordions.tested
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{tested}', to_jsonb('<p>*Učinek je optičen in začasen ter traja do naslednjega ščetkanja ali obroka. Različni odtenki sklenine se na serum odzivajo različno, zato se rezultati lahko razlikujejo.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "accordions" #>> '{tested}' = '<p>*V senzorični oceni (n = 40) je 85 % ocenjevalcev takoj po nanosu ocenilo zobe kot vidno svetlejše. Učinek je optičen in začasen; različni odtenki sklenine se različno odzivajo.</p>';
-- faq.1.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{1,a}', to_jsonb('Ne — in tega ne trdimo. Serum je korektor, ki zobe začasno optično osvetli. Za beljenje zob uporabite belilne trakce.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "faq" #>> '{1,a}' = 'Ne — in tega ne trdimo. Serum je korektor, ki zobe začasno optično osvetli. Za trajno beljenje uporabite belilne trakce.';
-- faq.2.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{2,a}', to_jsonb('Eno do dve kapljici nanesite s čopičem ali prstom po prednjih zobeh, počakajte 30 sekund in izpljunite. Ne pogoltnite.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "faq" #>> '{2,a}' = 'Eno do dve kapljici nanesite s čopičem ali prstom po prednjih zobah, počakajte 30 sekund in izpljunite. Ne pogoltnite.';
-- education.1.body
UPDATE "Product" SET "education" = jsonb_set("education", '{1,body}', to_jsonb('Serum je dober zaključek 14-dnevnega protokola belilnih trakov: trakci so namenjeni beljenju zob, serum pa za posebne priložnosti poskrbi za začasen optični učinek.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'serum-korektor-barve-zob' AND "education" #>> '{1,body}' = 'Serum je odličen zaključek 14-dnevnega protokola belilnih trakov: trakci spremenijo odtenek trajno, serum pa ga za posebne priložnosti še optično izpostavi.';

-- paket-popolna-rutina
-- description
UPDATE "Product" SET "description" = 'Celotna rutina v enem paketu: belilni trakci, ustna voda in serum korektor.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "description" = 'Celotna rutina v enem paketu: trakci, ustna voda in serum. Najboljša vrednost — brezplačna dostava vključena.';
-- seoDescription
UPDATE "Product" SET "seoDescription" = 'Paket Nasmeh.si združuje belilne trakce, ustno vodo in serum korektor v eni rutini. Vrednost posameznih izdelkov in prihranek sta izračunana na strani paketa.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "seoDescription" = 'Celotna rutina beljenja v enem paketu: belilni trakci, ustna voda in serum korektor. Najboljša vrednost — z brezplačno dostavo.';
-- customFields.uspChips
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{uspChips}', '["Celotna rutina","3 izdelki","Za vsak korak rutine"]'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "customFields" #> '{uspChips}' = '["Celotna rutina","Prihranite 33 %","Brezplačna dostava"]'::jsonb;
-- customFields.intro
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{intro}', to_jsonb('V enem paketu: belilni trakci za 14-dnevni protokol, ustna voda za vsakodnevno nego in serum za začasno optično korekcijo pred posebnimi priložnostmi.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "customFields" #>> '{intro}' = 'Vse, kar potrebujete za svetlejši nasmeh, v enem paketu: 14-dnevni protokol trakov, ustna voda za vsakodnevno čistočo in serum za takojšnjo korekcijo pred posebnimi priložnostmi.';
-- customFields.bullets
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{bullets}', '["14-dnevni protokol belilnih trakov","Ustna voda za globinsko čiščenje","Serum korektor za začasno optično korekcijo"]'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "customFields" #> '{bullets}' = '["14-dnevni protokol belilnih trakov","Ustna voda za globinsko čiščenje","Serum korektor za takojšen učinek","Brezplačna dostava vključena"]'::jsonb;
-- accordions.howItWorks
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{howItWorks}', to_jsonb('<p>Paket združuje tri korake rutine: (1) belilni trakci za 14-dnevni protokol, (2) ustna voda za vsakodnevno nego po ščetkanju, (3) serum korektor za začasno optično osvetlitev pred priložnostmi. Vsak izdelek uporabljajte po navodilih na njegovi strani.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "accordions" #>> '{howItWorks}' = '<p>Paket združuje tri korake popolne rutine: (1) belilni trakci za 14-dnevni protokol beljenja, (2) ustna voda za vsakodnevno globinsko čiščenje in ohranjanje rezultata, (3) serum korektor za takojšnjo optično osvetlitev pred priložnostmi. Vsak izdelek uporabljajte po navodilih na njegovi strani.</p>';
-- accordions.inci
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{inci}', to_jsonb('<p>Sestavine posameznih izdelkov so navedene na njihovih straneh: Belilni trakci za zobe, Ustna voda za globinsko čiščenje, Serum korektor barve zob.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "accordions" #>> '{inci}' = '<p>Sestavine posameznih izdelkov so navedene na njihovih strani: Belilni trakci za zobe, Ustna voda za globinsko čiščenje, Serum korektor barve zob.</p>';
-- accordions.guarantee
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{guarantee}', to_jsonb('<p>Za izdelek velja 30-dnevno jamstvo vračila denarja. Pogoji in postopek so objavljeni na strani <a href="/garancija-vracila-denarja" class="underline underline-offset-2">Jamstvo vračila denarja</a>. Jamstvo ne vpliva na vaše zakonske pravice, kot sta pravica do odstopa od pogodbe in uveljavljanje pravic zaradi stvarne napake.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "accordions" #>> '{guarantee}' = '<p>Z nakupom ni nobenega tveganja: če z rezultati niste zadovoljni, vam v 30 dneh od prevzema vrnemo kupnino. Pogoj je predhodna prijava na info@nasmeh.si z dokazilom o nakupu; podrobnosti so na strani Odstop od pogodbe. Jamstvo velja za prvi kupljeni izdelek enake vrste na stranko.</p>';
-- accordions.tested
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{tested}', to_jsonb('<p>Opombe k navedbam o posameznih izdelkih so na njihovih straneh. Rezultati se lahko razlikujejo od osebe do osebe.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "accordions" #>> '{tested}' = '<p>Za paket veljajo enaki standardi preizkušanja kot za posamezne izdelke — podrobnosti najdete na straneh izdelkov. Rezultati se lahko razlikujejo od osebe do osebe.</p>';
-- faq.1.a
UPDATE "Product" SET "faq" = jsonb_set("faq", '{1,a}', to_jsonb('Vrednost posameznih izdelkov in prihranek s paketom sta prikazana v razdelku Vsebina paketa na tej strani in se izračunata iz trenutnih cen.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "faq" #>> '{1,a}' = 'Vrednost posameznih izdelkov skupaj je 74,97 € — s paketom prihranite 33 %. Cena paketa že vključuje brezplačno dostavo.';
-- education.0.body
UPDATE "Product" SET "education" = jsonb_set("education", '{0,body}', to_jsonb('Rutina je lažja, ko ima vsak izdelek svoje mesto: trakci za 14-dnevni protokol, ustna voda za vsakodnevno nego po ščetkanju, serum pa za začasen optični učinek pred posebnimi priložnostmi.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'paket-popolna-rutina' AND "education" #>> '{0,body}' = 'Beljenje je najučinkovitejše kot rutina, ne kot enkraten dogodek: trakci naredijo težko delo v 14 dneh, ustna voda vzdržuje rezultat vsak dan, serum pa poskrbi za fotogenične trenutke.';

-- belilni-trakci-potovalni-7
-- customFields.intro
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{intro}', to_jsonb('Enaka formula kot pri polnem pakiranju belilnih trakov, v kompaktnem potovalnem pakiranju: 7 uporab za vikend, službeno pot ali preskus pred polnim protokolom.'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7' AND "customFields" #>> '{intro}' = 'Enaka nežna formula kot pri naših uspešnicah, v kompaktnem potovalnem pakiranju: 7 uporab za vikend, službeno pot ali preskus pred polnim protokolom.';
-- customFields.bullets
UPDATE "Product" SET "customFields" = jsonb_set("customFields", '{bullets}', '["7 uporab — idealno za na pot","Enaka formula brez peroksida","Za svetlejši nasmeh*","Odličen prvi korak pred 14-dnevnim protokolom"]'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7' AND "customFields" #> '{bullets}' = '["7 uporab — idealno za na pot","Enaka nežna formula brez peroksida","Rezultati že po 1 uporabi*","Odličen prvi korak pred 14-dnevnim protokolom"]'::jsonb;
-- accordions.howItWorks
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{howItWorks}', to_jsonb('<p>Uporaba je enaka kot pri polnem pakiranju: trak namestite na zobe in ga pustite 30 minut, ves ta čas zadrži formulo ob površini zob. 7 uporab zadostuje za en teden ali za preskus formule.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7' AND "accordions" #>> '{howItWorks}' = '<p>Enak mehanizem kot pri polnem pakiranju: aktivni belilni kompleks razgradi barvne pigmente v sklenini v 30 minutah, nežno in brez draženja. 7 uporab zadostuje za en teden vzdrževanja ali preskus formule.</p>';
-- accordions.guarantee
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{guarantee}', to_jsonb('<p>Za izdelek velja 30-dnevno jamstvo vračila denarja. Pogoji in postopek so objavljeni na strani <a href="/garancija-vracila-denarja" class="underline underline-offset-2">Jamstvo vračila denarja</a>. Jamstvo ne vpliva na vaše zakonske pravice, kot sta pravica do odstopa od pogodbe in uveljavljanje pravic zaradi stvarne napake.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7' AND "accordions" #>> '{guarantee}' = '<p>Z nakupom ni nobenega tveganja: če z rezultati niste zadovoljni, vam v 30 dneh od prevzema vrnemo kupnino. Pogoj je predhodna prijava na info@nasmeh.si z dokazilom o nakupu; podrobnosti so na strani Odstop od pogodbe. Jamstvo velja za prvi kupljeni izdelek enake vrste na stranko.</p>';
-- accordions.tested
UPDATE "Product" SET "accordions" = jsonb_set("accordions", '{tested}', to_jsonb('<p>*Rezultati se lahko razlikujejo od osebe do osebe: odvisni so od izhodiščnega odtenka zob in navad, kot so kava, čaj in kajenje. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.</p>'::text)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'belilni-trakci-potovalni-7' AND "accordions" #>> '{tested}' = '<p>*Izjave temeljijo na enakih protokolih preizkušanja kot pri polnem pakiranju (n = 52). Rezultati se lahko razlikujejo.</p>';

-- Copy fix, not a claim: the seeded standard shipping estimate "2–4 delovna dneva"
-- is ungrammatical (after 2–4 the noun agrees with 4: "2–4 delovne dni"). It is
-- shown at checkout, in the confirmation and shipped mails and on the PDP. Only a
-- method whose estimate still equals the exact seeded string changes; the other
-- methods, their order and any edited estimate stay as stored.
UPDATE "Setting"
SET "value" = (
    SELECT jsonb_agg(
      CASE WHEN method->>'estimate' = '2–4 delovna dneva'
        THEN jsonb_set(method, '{estimate}', to_jsonb('2–4 delovne dni'::text))
        ELSE method END
      ORDER BY ord)
    FROM jsonb_array_elements("value") WITH ORDINALITY AS methods(method, ord)
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'shipping.methods'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof("value") = 'array' THEN "value" ELSE '[]'::jsonb END) AS methods(method)
    WHERE method->>'estimate' = '2–4 delovna dneva'
  );

COMMIT;

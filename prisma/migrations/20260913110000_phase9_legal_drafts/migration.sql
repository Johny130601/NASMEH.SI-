-- Phase 9 step 4: GDPR and legal finalisation of the seeded draft pages.
-- Data only. Each statement replaces one exact original draft sentence, and
-- only on a page that is still unreviewed (D4) and still contains it, so
-- approved or operator-edited text is never touched and a re-run is a no-op.
-- prisma/seed-legal.ts carries the same resulting text for fresh databases.
BEGIN;

-- Terms §5: no fixed payment-method list (Klarna and PayPal are switchable).
UPDATE "ContentPage"
SET "body" = replace("body",
  'Sprejemamo plačila s karticami (Visa, Mastercard), PayPal, Apple Pay, Google Pay in Klarna.',
  'Načini plačila, ki so na voljo, so prikazani na blagajni pred oddajo naročila.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'pogoji-poslovanja' AND "reviewed" = false
  AND strpos("body", 'Sprejemamo plačila s karticami (Visa, Mastercard), PayPal, Apple Pay, Google Pay in Klarna.') > 0;

-- Cookie policy §2: the necessary cookies named by what they actually do.
UPDATE "ContentPage"
SET "body" = replace("body",
  '<strong>Nujni</strong> piškotki zagotavljajo delovanje strani (seja, varnost, shranjena privolitev) in se uporabljajo vedno.',
  '<strong>Nujni</strong> piškotki zagotavljajo delovanje strani in se uporabljajo vedno: seja in prijava (tudi dvostopenjska prijava osebja), košarica, koda za popust, dostop do potrditve naročila, zaščita obrazcev in plačil, shranjena izbira glede piškotkov ter dostop med vzdrževalnimi deli.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'politika-piskotkov' AND "reviewed" = false
  AND strpos("body", '<strong>Nujni</strong> piškotki zagotavljajo delovanje strani (seja, varnost, shranjena privolitev) in se uporabljajo vedno.') > 0;

-- Cookie policy §3: grammar.
UPDATE "ContentPage"
SET "body" = replace("body",
  'Svoj izbiro lahko kadar koli spremenite',
  'Svojo izbiro lahko kadar koli spremenite'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'politika-piskotkov' AND "reviewed" = false
  AND strpos("body", 'Svoj izbiro lahko kadar koli spremenite') > 0;

-- Withdrawal §1: the consumer protection act in force is ZVPot-1.
UPDATE "ContentPage"
SET "body" = replace("body",
  'V skladu z Zakonom o varstvu potrošnikov (ZVPot) lahko',
  'V skladu z Zakonom o varstvu potrošnikov (ZVPot-1) lahko'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'odstop-od-pogodbe' AND "reviewed" = false
  AND strpos("body", 'V skladu z Zakonom o varstvu potrošnikov (ZVPot) lahko') > 0;

-- Withdrawal §2: the exception in the words of Directive 2011/83/EU Art. 16(e)
-- (sealed goods unsuitable for return for health or hygiene reasons, unsealed
-- after delivery); the extra "undamaged" condition and the 14-day return
-- sentence that contradicted §3 are dropped. lib/copy/legal.ts
-- sealedGoodsException carries the same phrase for the short notices.
UPDATE "ContentPage"
SET "body" = replace("body",
  'Zaradi varovanja zdravja in higiene (člen 16(e) Direktive o pravicah potrošnikov) odstop <strong>ni mogoč</strong> za izdelke, ki so bili odpečateni oz. odprti po dostavi. Nepoškodovani, neodprti izdelki se lahko vrnejo v 14 dneh.',
  'Odstop <strong>ni mogoč</strong> za zapečateno blago, ki zaradi varovanja zdravja ali higienskih razlogov ni primerno za vračilo in je bilo po dobavi odpečateno (člen 16(e) Direktive 2011/83/EU o pravicah potrošnikov). Za blago, ki ga niste odpečatili, velja pravica do odstopa iz točke 1; vračilo kupnine ureja točka 3.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'odstop-od-pogodbe' AND "reviewed" = false
  AND strpos("body", 'Zaradi varovanja zdravja in higiene (člen 16(e) Direktive o pravicah potrošnikov) odstop <strong>ni mogoč</strong> za izdelke, ki so bili odpečateni oz. odprti po dostavi. Nepoškodovani, neodprti izdelki se lahko vrnejo v 14 dneh.') > 0;

-- Withdrawal §3: refund timing per Directive 2011/83/EU Art. 13 / Annex I(A)
-- (14 days from the notice; withheld until goods or proof of sending).
UPDATE "ContentPage"
SET "body" = replace("body",
  'Kupnino, vključno s standardnimi stroški izhodne dostave, vrnemo na prvotno plačilno sredstvo najkasneje v 14 dneh od prejema vrnjenega blaga (ali dokazila o oddaji).',
  'Vsa prejeta plačila, vključno s stroški standardne dostave, vrnemo brez nepotrebnega odlašanja, najpozneje pa v 14 dneh od dne, ko prejmemo vaše obvestilo o odstopu od pogodbe. Dodatnih stroškov, ki nastanejo, ker ste izbrali dražji način dostave od najcenejše standardne dostave, ki jo ponujamo, ne povrnemo. Vračilo izvedemo na prvotno plačilno sredstvo. Vračilo lahko zadržimo, dokler ne prejmemo blaga nazaj ali dokler ne predložite dokazila, da ste ga poslali nazaj, kar nastopi prej.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'odstop-od-pogodbe' AND "reviewed" = false
  AND strpos("body", 'Kupnino, vključno s standardnimi stroški izhodne dostave, vrnemo na prvotno plačilno sredstvo najkasneje v 14 dneh od prejema vrnjenega blaga (ali dokazila o oddaji).') > 0;

-- Withdrawal §4: a pointer to the guarantee page, which alone states the conditions.
UPDATE "ContentPage"
SET "body" = replace("body",
  '<h2>4. Prostovoljna podaljšana garancija</h2>',
  '<h2>4. Jamstvo vračila denarja</h2>'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'odstop-od-pogodbe' AND "reviewed" = false
  AND strpos("body", '<h2>4. Prostovoljna podaljšana garancija</h2>') > 0;

UPDATE "ContentPage"
SET "body" = replace("body",
  'Nad zakonsko pravico ponujamo 30-dnevno garancijo vračila denarja pod pogoji: predhodni kontakt, dokazilo o nakupu in fotografija izdelka.',
  'Prostovoljno jamstvo vračila denarja ne vpliva na zakonsko pravico do odstopa.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'odstop-od-pogodbe' AND "reviewed" = false
  AND strpos("body", 'Nad zakonsko pravico ponujamo 30-dnevno garancijo vračila denarja pod pogoji: predhodni kontakt, dokazilo o nakupu in fotografija izdelka.') > 0;

UPDATE "ContentPage"
SET "body" = replace("body",
  'Podrobnosti posredujemo ob prijavi na info@nasmeh.si.',
  'Pogoji jamstva so objavljeni na strani <a href="/garancija-vracila-denarja">Jamstvo vračila denarja</a>.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'odstop-od-pogodbe' AND "reviewed" = false
  AND strpos("body", 'Podrobnosti posredujemo ob prijavi na info@nasmeh.si.') > 0;

-- Complaints §4: the EU ODR platform closed on 20 July 2025 (Reg. (EU) 2024/3228).
UPDATE "ContentPage"
SET "body" = replace("body",
  ' Spletna platforma EU za reševanje sporov: ec.europa.eu/consumers/odr.',
  ''),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'reklamacije' AND "reviewed" = false
  AND strpos("body", ' Spletna platforma EU za reševanje sporov: ec.europa.eu/consumers/odr.') > 0;

-- Guarantee page: remove internal contradictions without changing a condition.
UPDATE "ContentPage"
SET "body" = replace("body",
  'Če z izdelkom niste zadovoljni, vam v 30 dneh od dostave vrnemo kupnino.',
  'Če z izdelkom niste zadovoljni in nam to sporočite v 30 dneh od dostave, vam pod pogoji iz točke 2 vrnemo kupnino.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'garancija-vracila-denarja' AND "reviewed" = false
  AND strpos("body", 'Če z izdelkom niste zadovoljni, vam v 30 dneh od dostave vrnemo kupnino.') > 0;

UPDATE "ContentPage"
SET "body" = replace("body",
  'Pred vračilom nas kontaktirajte prek strani Kontakt',
  'Pred morebitnim vračilom izdelka nas kontaktirajte prek strani Kontakt'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'garancija-vracila-denarja' AND "reviewed" = false
  AND strpos("body", 'Pred vračilom nas kontaktirajte prek strani Kontakt') > 0;

UPDATE "ContentPage"
SET "body" = replace("body",
  'Jamstvo ne omejuje zakonskih pravic potrošnika: pravice do odstopa od pogodbe in uveljavljanja reklamacij zaradi stvarne napake.',
  'Jamstvo je prostovoljno in ne vpliva na zakonske pravice potrošnika: pravica do odstopa od pogodbe in pravica do uveljavljanja reklamacij zaradi stvarne napake veljata ne glede na jamstvo.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'garancija-vracila-denarja' AND "reviewed" = false
  AND strpos("body", 'Jamstvo ne omejuje zakonskih pravic potrošnika: pravice do odstopa od pogodbe in uveljavljanja reklamacij zaradi stvarne napake.') > 0;

-- "garancija" has a statutory meaning; the page describes a voluntary "jamstvo".
UPDATE "ContentPage"
SET "seoDescription" = '30-dnevno jamstvo vračila denarja Nasmeh.si — pogoji prostovoljnega jamstva nad zakonsko pravico do odstopa.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'garancija-vracila-denarja' AND "reviewed" = false
  AND "seoDescription" = '30-dnevno jamstvo vračila denarja Nasmeh.si — pogoji prostovoljne garancije nad zakonsko pravico do odstopa.';

-- Upgrade-path completion (2026-09-15)
-- The seed texts below were revised after the statements above were written
-- (seller block rendered from the company Setting, the privacy policy rewritten
-- to describe the processing the code performs, the cookie-policy table wording);
-- the upgrade path must carry the same text as a fresh seed. Found by the
-- Phase 9 step 4 upgrade-path check (docs/testing/phase-9-step-4-2026-09-15.md).

-- Terms §1: the seller is named by reference to the company block rendered above the body.
UPDATE "ContentPage"
SET "body" = replace("body",
  '<p>Ti pogoji poslovanja urejajo odnos med podjetjem Nasmeh.si, d.o.o. (v nadaljevanju: prodajalec) in kupcem pri nakupu izdelkov v spletni trgovini Nasmeh.si. Z oddajo naročila kupec potrjuje, da je seznanjen s temi pogoji in da jih v celoti sprejema.</p>',
  '<p>Ti pogoji poslovanja urejajo odnos med prodajalcem, katerega podatki so navedeni zgoraj (v nadaljevanju: prodajalec), in kupcem pri nakupu izdelkov v spletni trgovini Nasmeh.si. Z oddajo naročila kupec potrjuje, da je seznanjen s temi pogoji in da jih v celoti sprejema.</p>'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'pogoji-poslovanja' AND "reviewed" = false
  AND strpos("body", '<p>Ti pogoji poslovanja urejajo odnos med podjetjem Nasmeh.si, d.o.o. (v nadaljevanju: prodajalec) in kupcem pri nakupu izdelkov v spletni trgovini Nasmeh.si. Z oddajo naročila kupec potrjuje, da je seznanjen s temi pogoji in da jih v celoti sprejema.</p>') > 0;

-- Terms §2: seller identification comes from the company Setting rendered above the body.
UPDATE "ContentPage"
SET "body" = replace("body",
  '<p>Nasmeh.si, d.o.o., Trg nasmeha 1, 1000 Ljubljana, Slovenija. Matična številka in ID za DDV sta navedena v nogi spletne strani. Kontakt: info@nasmeh.si.</p>',
  '<p>Podatki o prodajalcu (firma, naslov, matična številka, identifikacijska številka za DDV, e-poštni naslov in telefonska številka, kadar je navedena) so navedeni zgoraj.</p>'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'pogoji-poslovanja' AND "reviewed" = false
  AND strpos("body", '<p>Nasmeh.si, d.o.o., Trg nasmeha 1, 1000 Ljubljana, Slovenija. Matična številka in ID za DDV sta navedena v nogi spletne strani. Kontakt: info@nasmeh.si.</p>') > 0;

-- Terms §7: the Art. 16(e) exception in the shared wording (lib/copy/legal.ts sealedGoodsException).
UPDATE "ContentPage"
SET "body" = replace("body",
  '<p>Potrošnik ima v skladu z zakonodajo pravico do odstopa od pogodbe v 14 dneh (podrobnosti na strani Odstop od pogodbe) ter pravico do uveljavljanja reklamacij (stran Reklamacije).</p>',
  '<p>Potrošnik ima v skladu z zakonodajo pravico do odstopa od pogodbe v 14 dneh; odstop ni mogoč za zapečateno blago, ki zaradi varovanja zdravja ali higienskih razlogov ni primerno za vračilo in je bilo po dobavi odpečateno. Podrobnosti so na strani Odstop od pogodbe. Potrošnik ima tudi pravico do uveljavljanja reklamacij (stran Reklamacije).</p>'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'pogoji-poslovanja' AND "reviewed" = false
  AND strpos("body", '<p>Potrošnik ima v skladu z zakonodajo pravico do odstopa od pogodbe v 14 dneh (podrobnosti na strani Odstop od pogodbe) ter pravico do uveljavljanja reklamacij (stran Reklamacije).</p>') > 0;

-- Privacy policy: the whole draft rewritten to describe the processing the code performs (sections 1-16, [v potrditvi] marks the lawyer inputs); only the exact earlier draft is replaced.
UPDATE "ContentPage"
SET "body" = replace("body",
  '
<h2>1. Upravljalec podatkov</h2>
<p>Upravljalec osebnih podatkov je Nasmeh.si, d.o.o., Trg nasmeha 1, 1000 Ljubljana. Za vprašanja o zasebnosti pišite na info@nasmeh.si.</p>
<h2>2. Katere podatke zbiramo</h2>
<p>Podatke za izvedbo naročila (ime, naslov, e-pošta, plačilni podatki — ti se obdelujejo izključno pri plačilnih ponudnikih), podatke o privolitvah (piškotki, e-novice) ter tehnične podatke o obisku, če temu privolite.</p>
<h2>3. Nameni in pravne podlage</h2>
<p>Podatke obdelujemo za: izvedbo pogodbe (naročilo, dostava, račun), izpolnitev zakonskih obveznosti (računovodstvo), pošiljanje e-novic na podlagi vaše privolitve (dvojna prijava) ter anonimno statistiko obiskov na podlagi privolitve.</p>
<h2>4. Obdelovalci</h2>
<p>Podatke zaupamo v obdelavo le ponudnikom, ki so nujni za poslovanje: plačilni ponudniki (Stripe, PayPal), dostavne službe (Pošta Slovenije, GLS), ponudnik e-pošte ter — ob vaši privolitvi — analitična orodja (Google Analytics). Z vsemi imamo sklenjene ustrezne pogodbe o varstvu podatkov.</p>
<h2>5. Hramba</h2>
<p>Podatke o naročilih hranimo toliko časa, kot zahtevajo davčni in računovodski predpisi; privolitve do preklica; podatke za e-novice do odjave.</p>
<h2>6. Vaše pravice</h2>
<p>Imate pravico do dostopa, popravka, izbrisa, prenosljivosti, ugovora in omejitve obdelave ter pravico do preklica privolitve kadar koli (brez vpliva na zakonitost predhodne obdelave). Pravice uveljavite na info@nasmeh.si. Pritožbo lahko vložite tudi pri Informacijskem pooblaščencu RS.</p>
<h2>7. Piškotki</h2>
<p>Podrobnosti o piškotkih so na strani Politika piškotkov, kjer je objavljena tudi živa tabela piškotkov.</p>',
  '
<p>Ta politika pojasnjuje, katere osebne podatke obdelujemo v spletni trgovini Nasmeh.si, za katere namene, na kateri pravni podlagi in kako dolgo. Pravne podlage so navedene po Splošni uredbi o varstvu podatkov (Uredba (EU) 2016/679, v nadaljevanju: Splošna uredba). Oznaka [v potrditvi] označuje podatke, ki bodo dopolnjeni po pravnem pregledu.</p>
<h2>1. Upravljavec</h2>
<p>Upravljavec osebnih podatkov je prodajalec, katerega podatki (firma, naslov, matična številka, e-poštni naslov in telefonska številka, kadar je navedena) so navedeni zgoraj. Za vprašanja o varstvu osebnih podatkov in za uveljavljanje pravic nam pišite na e-poštni naslov prodajalca. Pooblaščena oseba za varstvo podatkov: [v potrditvi].</p>
<h2>2. Naročila</h2>
<p>Za sklenitev in izvedbo pogodbe obdelujemo e-poštni naslov, ime in priimek, naslov za dostavo in račun, telefonsko številko za dostavno službo, naročene izdelke, zneske, uporabljeno kodo za popust, izbrani način dostave in plačila, stanje plačila in številko za sledenje pošiljki. Ob oddaji naročila shranimo tudi zapis o tem, katero besedilo pogojev poslovanja in odstopa od pogodbe je takrat veljalo. Podatke uporabljamo za izvedbo naročila, pošiljanje potrditve naročila z računom in obvestila o odpremi ter za izdajo računa. Pravna podlaga je pogodba (člen 6(1)(b) Splošne uredbe), za izdajo in hrambo računov pa zakonska obveznost (člen 6(1)(c)). Brez teh podatkov naročila ne moremo izvesti.</p>
<h2>3. E-poštni naslov v prvem koraku blagajne</h2>
<p>Ko na blagajni vpišete e-poštni naslov in nadaljujete na korak dostave, shranimo e-poštni naslov in trenutno vsebino košarice (zapis o nedokončanem nakupu). Zapis je namenjen nadaljevanju nedokončanega nakupa. Funkcija, ki bi ga za to uporabila (na primer opomnik po e-pošti), še ni vzpostavljena, zato vam na podlagi tega zapisa ne pošiljamo sporočil. Zapis izbrišemo, ko je naročilo plačano, sicer po 30 dneh od zadnje spremembe [v potrditvi]. Pravna podlaga: [v potrditvi].</p>
<h2>4. Uporabniški račun</h2>
<p>Če ustvarite uporabniški račun ob registraciji ali po nakupu, obdelujemo e-poštni naslov, ime, geslo v zgoščeni obliki, shranjene naslove in telefonske številke, zgodovino naročil in vašo izbiro glede e-novic. Račun aktivirate s povezavo, ki jo pošljemo na vaš e-poštni naslov. Zapise o povezavah za potrditev e-poštnega naslova in ponastavitev gesla izbrišemo 30 dni po uporabi ali izteku povezave; podatke, ki jih povezava hrani za aktivacijo računa, izbrišemo pri rednem dnevnem čiščenju, ko povezave ni več mogoče uporabiti. Pravna podlaga je pogodba (člen 6(1)(b)) [v potrditvi].</p>
<h2>5. E-novice</h2>
<p>Na e-novice se lahko prijavite v nogi strani, v pojavnem oknu, na blagajni ali ob registraciji. Obdelujemo e-poštni naslov, stanje prijave, mesto prijave ter čas prijave in potrditve. Prijava v nogi strani, v pojavnem oknu ali na blagajni začne veljati šele, ko jo potrdite na strani, na katero vas vodi povezava v potrditvenem sporočilu (dvojna potrditev); izbira ob registraciji začne veljati, ko potrdite e-poštni naslov računa. Pravna podlaga je vaša privolitev (člen 6(1)(a)). Privolitev lahko kadar koli prekličete s povezavo za odjavo v potrditvenem sporočilu, v nastavitvah uporabniškega računa ali s sporočilom na e-poštni naslov prodajalca. Preklic ne vpliva na zakonitost obdelave pred preklicem. Po odjavi vam e-novic ne pošiljamo več; zapis o prijavi in odjavi hranimo [v potrditvi].</p>
<h2>6. Obvestilo o ponovni zalogi</h2>
<p>Če zaprosite za obvestilo, ko bo izdelek spet na zalogi, obdelujemo e-poštni naslov, izbrani izdelek in stanje prijave. Prijavo potrdite na strani, na katero vas vodi povezava v potrditvenem sporočilu. Ko je izdelek spet na zalogi, vam pošljemo obvestilo s povezavo za odjavo. Pravna podlaga: vaša zahteva oziroma privolitev [v potrditvi]. Zapis hranimo [v potrditvi].</p>
<h2>7. Povabila k oceni in mnenja o izdelkih</h2>
<p>Nekaj dni po dostavi naročila (privzeto 7 dni) vam pošljemo e-sporočilo s povabilom k oceni kupljenih izdelkov. Povabila ne pošljemo, če so bili podatki naročila izbrisani na vašo zahtevo. Pravna podlaga za povabilo: [v potrditvi]. Če oddate mnenje, obdelujemo oceno, naslov in besedilo mnenja, fotografije, ki jih priložite, odgovore na neobvezna vprašanja (na primer o občutljivosti zob) in povezavo z naročilom, s katero mnenje označimo kot preverjen nakup. Ob objavljenem mnenju sta navedena samo vaše ime in začetnica priimka. Fotografije zavrnjenih mnenj izbrišemo. Pravna podlaga za obdelavo in objavo mnenja: [v potrditvi].</p>
<h2>8. Kontakt, reklamacije in odstop od pogodbe</h2>
<p>Ko nam pišete prek kontaktnega obrazca, prijavite reklamacijo ali odstopite od pogodbe s spletnim obrazcem, obdelujemo ime in priimek, e-poštni naslov, številko naročila, vsebino sporočila in podatke obrazca (pri odstopu od pogodbe tudi vaš naslov, datum prevzema in blago, od katerega odstopate) ter fotografije, ki jih priložite. Zahtevek povežemo z naročilom, kadar naročilo lahko preverimo (prijava v uporabniški račun ali ujemanje številke naročila in e-poštnega naslova). O prejemu vam pošljemo potrdilo po e-pošti, obvestilo o zahtevku pa prejme poštni predal naše podpore. Zahtevke obravnava pooblaščeno osebje; fotografije hranimo na našem strežniku in niso javno dostopne. Pravna podlaga je pogodba in izpolnjevanje zakonskih obveznosti pri odstopu od pogodbe in reklamacijah (člen 6(1)(b) in (c)); pri splošnih vprašanjih naš zakoniti interes, da vam odgovorimo (člen 6(1)(f)) [v potrditvi]. Zahtevke in fotografije hranimo [v potrditvi].</p>
<h2>9. Prijava neželenega učinka</h2>
<p>Prijava neželenega učinka lahko vsebuje podatke o zdravju, ki so posebna vrsta osebnih podatkov (člen 9 Splošne uredbe). Obdelujemo podatke o prijavitelju (ime in priimek, e-poštni naslov, telefonska številka, če jo navedete, in kdo prijavlja), podatke o izdelku (izdelek, številka serije, kraj in datum nakupa, številka naročila), opis učinka, datum pojava, ali učinek še traja, podatke o zdravniški pomoči, fotografije ter vaše dovoljenje za dodatna vprašanja. Podatke uporabljamo za oceno varnosti izdelka in za izpolnjevanje obveznosti glede varnosti kozmetičnih izdelkov po Uredbi (ES) št. 1223/2009, kar lahko vključuje sporočanje resnih neželenih učinkov pristojnemu organu. Dostop do prijav imajo samo pooblaščene osebe. Pravna podlaga in izjema po členu 9(2) Splošne uredbe: [v potrditvi]. Prijave hranimo [v potrditvi].</p>
<h2>10. Evidenca privolitev</h2>
<p>Da lahko dokažemo, kdaj ste privolitev dali ali preklicali (člen 7(1) Splošne uredbe), vodimo evidenco privolitev. Pri izbiri glede piškotkov shranimo izbrane kategorije, različico nastavitev piškotkov, čas, naključni identifikator, ki je shranjen tudi v piškotku nasmeh_consent, in uporabniški račun, če ste prijavljeni. Pri e-novicah, obvestilih o zalogi in izbirah v uporabniškem računu shranimo izbiro, oznako različice besedila, ki ste ga videli, čas ter povezavo z uporabniškim računom, prijavo ali številko naročila. IP-naslova in podatkov o brskalniku v evidenco ne shranjujemo. Pravna podlaga: [v potrditvi]. Zapise hranimo tudi po izbrisu drugih podatkov, kolikor so potrebni za dokazovanje privolitve [v potrditvi].</p>
<h2>11. Zaščita obrazcev pred roboti</h2>
<p>Obrazce (na primer prijavo in registracijo, blagajno, kontaktne obrazce in prijavo na e-novice) ščitimo s storitvijo Cloudflare Turnstile. Storitev se naloži šele, ko začnete uporabljati zaščiten obrazec, in obdela tehnične podatke o napravi in povezavi (na primer IP-naslov in podatke o brskalniku), da loči ljudi od samodejnih programov. Pravna podlaga je naš zakoniti interes za varnost trgovine (člen 6(1)(f)) [v potrditvi].</p>
<h2>12. Prejemniki in prenosi v tretje države</h2>
<p>Podatke posredujemo le prejemnikom, ki jih potrebujemo za poslovanje:</p>
<ul>
<li>plačilna ponudnika Stripe (plačila s kartico, Apple Pay, Google Pay in Klarna, kadar je na voljo) in PayPal: podatke za plačilo vnesete neposredno pri ponudniku, mi pa prejmemo stanje plačila in oznako transakcije, ne pa številke vaše kartice;</li>
<li>dostavne službe (Pošta Slovenije, GLS): ime in priimek, naslov za dostavo in telefonska številka;</li>
<li>ponudnik pošiljanja e-pošte: [v potrditvi];</li>
<li>ponudnik gostovanja strežnika in hrambe varnostnih kopij: [v potrditvi];</li>
<li>Cloudflare za zaščito obrazcev (točka 11);</li>
<li>če so orodja vklopljena in v to privolite: Google (Google Tag Manager, Google Analytics) in ponudniki trženjskih orodij, na primer Meta (podrobnosti so na strani Politika piškotkov).</li>
</ul>
<p>Pogodbe o obdelavi osebnih podatkov z obdelovalci: [v potrditvi]. Nekateri ponudniki (na primer Stripe, PayPal, Google, Meta in Cloudflare) lahko podatke obdelujejo tudi zunaj Evropskega gospodarskega prostora, zlasti v ZDA; zaščitni ukrepi za te prenose: [v potrditvi]. Podatke posredujemo tudi državnim organom, kadar to zahteva zakon.</p>
<h2>13. Obisk strani, dnevniki in varnostne kopije</h2>
<p>Pri obisku strani strežnik obdela tehnične podatke, ki so nujni za prikaz strani in varnost (IP-naslov, čas, zahtevani naslov in podatke o brskalniku). IP-naslov začasno uporabimo tudi za omejevanje števila zahtev. Dnevniki aplikacije so omejeni po velikosti in se sproti prepisujejo [v potrditvi]. Podatkovno bazo ter zasebne fotografije mnenj in zahtevkov varnostno kopiramo enkrat na dan; hranimo zadnjih 14 dnevnih kopij in tedenske kopije do 8 tednov. Pravna podlaga je naš zakoniti interes za delovanje in varnost trgovine (člen 6(1)(f)).</p>
<h2>14. Piškotki in statistika obiskov</h2>
<p>Nujne piškotke uporabljamo za delovanje trgovine. Piškotke za statistiko in trženje nastavimo samo z vašo privolitvijo. Ti piškotki vsebujejo naključne identifikatorje brskalnika, zato podatki niso anonimni. Podrobnosti in tabela piškotkov so na strani Politika piškotkov.</p>
<h2>15. Roki hrambe</h2>
<ul>
<li>naročila in računi: toliko časa, kot zahtevajo davčni in računovodski predpisi [v potrditvi];</li>
<li>uporabniški račun: do izbrisa [v potrditvi]; povezave za potrditev e-poštnega naslova in ponastavitev gesla: 30 dni po uporabi ali izteku;</li>
<li>zapis o nedokončanem nakupu: do plačila naročila, sicer 30 dni od zadnje spremembe [v potrditvi];</li>
<li>e-novice in obvestila o zalogi: do odjave, zapis o prijavi in odjavi [v potrditvi];</li>
<li>mnenja: [v potrditvi]; fotografije zavrnjenih mnenj izbrišemo;</li>
<li>zahtevki, reklamacije, odstopi od pogodbe in priložene fotografije: [v potrditvi];</li>
<li>prijave neželenih učinkov: [v potrditvi];</li>
<li>evidenca privolitev: [v potrditvi];</li>
<li>varnostne kopije: dnevne 14 dni, tedenske do 8 tednov.</li>
</ul>
<h2>16. Vaše pravice</h2>
<p>Imate pravico do dostopa do svojih osebnih podatkov, do popravka, izbrisa in omejitve obdelave, do prenosljivosti podatkov ter pravico do ugovora obdelavi, ki temelji na zakonitem interesu. Obdelavi za neposredno trženje lahko ugovarjate kadar koli. Privolitev lahko kadar koli prekličete, kar ne vpliva na zakonitost obdelave pred preklicem. Zahtevo pošljite na e-poštni naslov prodajalca, naveden zgoraj; odgovorimo najpozneje v enem mesecu. Ob izbrisu podatke izbrišemo ali anonimiziramo, ohranimo pa podatke, ki jih moramo hraniti po zakonu ali za dokazovanje (na primer podatke izdanih računov, zapis o besedilih, ki so veljala ob naročilu, in evidenco privolitev) [v potrditvi]. Odločitev, ki bi temeljile izključno na avtomatizirani obdelavi in bi imele za vas pravne ali podobno pomembne učinke, ne sprejemamo.</p>
<p>Pritožbo lahko vložite pri Informacijskem pooblaščencu Republike Slovenije, Dunajska cesta 22, 1000 Ljubljana (www.ip-rs.si).</p>'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'politika-zasebnosti' AND "reviewed" = false
  AND strpos("body", '
<h2>1. Upravljalec podatkov</h2>
<p>Upravljalec osebnih podatkov je Nasmeh.si, d.o.o., Trg nasmeha 1, 1000 Ljubljana. Za vprašanja o zasebnosti pišite na info@nasmeh.si.</p>
<h2>2. Katere podatke zbiramo</h2>
<p>Podatke za izvedbo naročila (ime, naslov, e-pošta, plačilni podatki — ti se obdelujejo izključno pri plačilnih ponudnikih), podatke o privolitvah (piškotki, e-novice) ter tehnične podatke o obisku, če temu privolite.</p>
<h2>3. Nameni in pravne podlage</h2>
<p>Podatke obdelujemo za: izvedbo pogodbe (naročilo, dostava, račun), izpolnitev zakonskih obveznosti (računovodstvo), pošiljanje e-novic na podlagi vaše privolitve (dvojna prijava) ter anonimno statistiko obiskov na podlagi privolitve.</p>
<h2>4. Obdelovalci</h2>
<p>Podatke zaupamo v obdelavo le ponudnikom, ki so nujni za poslovanje: plačilni ponudniki (Stripe, PayPal), dostavne službe (Pošta Slovenije, GLS), ponudnik e-pošte ter — ob vaši privolitvi — analitična orodja (Google Analytics). Z vsemi imamo sklenjene ustrezne pogodbe o varstvu podatkov.</p>
<h2>5. Hramba</h2>
<p>Podatke o naročilih hranimo toliko časa, kot zahtevajo davčni in računovodski predpisi; privolitve do preklica; podatke za e-novice do odjave.</p>
<h2>6. Vaše pravice</h2>
<p>Imate pravico do dostopa, popravka, izbrisa, prenosljivosti, ugovora in omejitve obdelave ter pravico do preklica privolitve kadar koli (brez vpliva na zakonitost predhodne obdelave). Pravice uveljavite na info@nasmeh.si. Pritožbo lahko vložite tudi pri Informacijskem pooblaščencu RS.</p>
<h2>7. Piškotki</h2>
<p>Podrobnosti o piškotkih so na strani Politika piškotkov, kjer je objavljena tudi živa tabela piškotkov.</p>') > 0;

-- Cookie policy §4: what the table lists (category column, provider-level third-party rows, analytics cookies are not anonymous).
UPDATE "ContentPage"
SET "body" = replace("body",
  '<p>Aktualna tabela vseh piškotkov z imeni, ponudniki, nameni in trajanjem je objavljena spodaj na tej strani.</p>',
  '<p>Tabela spodaj za vsak piškotek in zapis v brskalniku, ki ga nastavi Nasmeh.si, navaja ime, kategorijo, ponudnika, namen in trajanje. Ponudniki, ki jih uporabljamo samo za plačila (Stripe, PayPal) in za zaščito obrazcev pred roboti (Cloudflare Turnstile), nastavljajo lastne piškotke, katerih imena in trajanje določajo sami, zato so v tabeli navedeni po ponudniku. Pri orodjih za statistiko in trženje, ki se naložijo samo po vaši privolitvi, so navedeni njihovi glavni piškotki. Piškotki za statistiko vsebujejo naključni identifikator brskalnika, zato podatki niso anonimni.</p>'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'politika-piskotkov' AND "reviewed" = false
  AND strpos("body", '<p>Aktualna tabela vseh piškotkov z imeni, ponudniki, nameni in trajanjem je objavljena spodaj na tej strani.</p>') > 0;

-- Cookie policy meta description: the table is no longer called a live table of all cookies.
UPDATE "ContentPage"
SET "seoDescription" = 'Politika piškotkov Nasmeh.si — kategorije piškotkov, privolitev in tabela piškotkov.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'politika-piskotkov' AND "reviewed" = false
  AND "seoDescription" = 'Politika piškotkov Nasmeh.si — kategorije piškotkov, privolitev in živa tabela vseh piškotkov.';

-- legal.links: drop the unused complaints key (lib/settings-schemas.ts LEGAL_LINK_KEYS has terms,
-- withdrawal, privacy and cookies; the schema already ignored it and the seed no longer writes it).
UPDATE "Setting"
SET "value" = "value" - 'complaints', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'legal.links' AND jsonb_typeof("value") = 'object' AND "value" ? 'complaints';
COMMIT;

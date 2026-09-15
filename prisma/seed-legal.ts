/**
 * Slovenian DRAFT legal texts (D4 — pending professional review; the
 * `reviewed` flag on ContentPage stays false until sign-off).
 * Bodies are HTML rendered by the LEGAL template.
 */
export interface LegalPageSeed {
  title: string;
  slug: string;
  seoDescription: string;
  body: string;
}

export const LEGAL_PAGES: LegalPageSeed[] = [
  {
    title: "Pogoji poslovanja",
    slug: "pogoji-poslovanja",
    seoDescription:
      "Splošni pogoji poslovanja spletne trgovine Nasmeh.si — naročanje, plačilo, dobava in pravice potrošnika.",
    body: `
<h2>1. Splošne določbe</h2>
<p>Ti pogoji poslovanja urejajo odnos med prodajalcem, katerega podatki so navedeni zgoraj (v nadaljevanju: prodajalec), in kupcem pri nakupu izdelkov v spletni trgovini Nasmeh.si. Z oddajo naročila kupec potrjuje, da je seznanjen s temi pogoji in da jih v celoti sprejema.</p>
<h2>2. Identifikacija prodajalca</h2>
<p>Podatki o prodajalcu (firma, naslov, matična številka, identifikacijska številka za DDV, e-poštni naslov in telefonska številka, kadar je navedena) so navedeni zgoraj.</p>
<h2>3. Ponudba in cene</h2>
<p>Vse cene so v evrih (EUR) in vključujejo DDV po veljavni stopnji (22 %). Stroški dostave so prikazani pred oddajo naročila. Prodajalec si pridržuje pravico do spremembe cen; za oddana naročila velja cena v času oddaje.</p>
<h2>4. Sklenitev pogodbe</h2>
<p>Naročilo je za prodajalca zavezujoče, ko kupec prejme potrditveno e-sporočilo o uspešnem naročilu. Prodajalec lahko naročilo zavrne, če izdelka ni na zalogi ali če sumi na zlorabo; v tem primeru vrne celoten znesek.</p>
<h2>5. Plačilo</h2>
<p>Načini plačila, ki so na voljo, so prikazani na blagajni pred oddajo naročila. Plačilo se izvede ob oddaji naročila prek varovanih plačilnih ponudnikov.</p>
<h2>6. Dobava</h2>
<p>Načini, predvideni roki in stroški dostave so prikazani na blagajni pred oddajo naročila. Naslov za dostavo je tisti, ki ga kupec navede ob oddaji naročila.</p>
<h2>7. Odstop od pogodbe in reklamacije</h2>
<p>Potrošnik ima v skladu z zakonodajo pravico do odstopa od pogodbe v 14 dneh; odstop ni mogoč za zapečateno blago, ki zaradi varovanja zdravja ali higienskih razlogov ni primerno za vračilo in je bilo po dobavi odpečateno. Podrobnosti so na strani Odstop od pogodbe. Potrošnik ima tudi pravico do uveljavljanja reklamacij (stran Reklamacije).</p>
<h2>8. Varstvo podatkov</h2>
<p>Osebne podatke obdelujemo v skladu s Politiko zasebnosti, ki je sestavni del teh pogojev.</p>
<h2>9. Izvensodno reševanje sporov</h2>
<p>Morebitne spore rešujeva po mirni poti; kupec lahko spor predloži tudi v izvensodno reševanje potrošniških sporov (IRPS). Podrobnosti so na strani Reklamacije.</p>`,
  },
  {
    title: "Politika zasebnosti",
    slug: "politika-zasebnosti",
    seoDescription:
      "Politika zasebnosti Nasmeh.si — kako zbiramo, uporabljamo in varujemo vaše osebne podatke (GDPR).",
    body: `
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
<p>Pritožbo lahko vložite pri Informacijskem pooblaščencu Republike Slovenije, Dunajska cesta 22, 1000 Ljubljana (www.ip-rs.si).</p>`,
  },
  {
    title: "Politika piškotkov",
    slug: "politika-piskotkov",
    seoDescription:
      "Politika piškotkov Nasmeh.si — kategorije piškotkov, privolitev in tabela piškotkov.",
    body: `
<h2>1. Kaj so piškotki</h2>
<p>Piškotki so majhne besedilne datoteke, ki jih spletna stran shrani v vašo napravo. Uporabljamo jih za delovanje trgovine ter — samo z vašo privolitvijo — za statistiko in trženje.</p>
<h2>2. Kategorije in privolitev</h2>
<p><strong>Nujni</strong> piškotki zagotavljajo delovanje strani in se uporabljajo vedno: seja in prijava (tudi dvostopenjska prijava osebja), košarica, koda za popust, dostop do potrditve naročila, zaščita obrazcev in plačil, shranjena izbira glede piškotkov ter dostop med vzdrževalnimi deli. <strong>Analitični</strong> in <strong>trženjski</strong> piškotki se naložijo šele po vaši izrecni privolitvi v pasici za privolitev. Google Consent Mode v2 signali se posredujejo orodjem, privzeto stanje je "zavrnjeno".</p>
<h2>3. Sprememba izbire</h2>
<p>Svojo izbiro lahko kadar koli spremenite prek povezave »Nastavitve piškotkov« v nogi strani — pasica se ponovno odpre in shrani novo izbiro (v piškotek in v naš dnevnik privolitev).</p>
<h2>4. Tabela piškotkov</h2>
<p>Tabela spodaj za vsak piškotek in zapis v brskalniku, ki ga nastavi Nasmeh.si, navaja ime, kategorijo, ponudnika, namen in trajanje. Ponudniki, ki jih uporabljamo samo za plačila (Stripe, PayPal) in za zaščito obrazcev pred roboti (Cloudflare Turnstile), nastavljajo lastne piškotke, katerih imena in trajanje določajo sami, zato so v tabeli navedeni po ponudniku. Pri orodjih za statistiko in trženje, ki se naložijo samo po vaši privolitvi, so navedeni njihovi glavni piškotki. Piškotki za statistiko vsebujejo naključni identifikator brskalnika, zato podatki niso anonimni.</p>`,
  },
  {
    title: "Odstop od pogodbe",
    slug: "odstop-od-pogodbe",
    seoDescription:
      "Pravica do odstopa od pogodbe v 14 dneh — navodila, izjeme za kozmetiko in vzorčni obrazec (EU).",
    body: `
<h2>1. Pravica do odstopa (14 dni)</h2>
<p>V skladu z Zakonom o varstvu potrošnikov (ZVPot-1) lahko kot potrošnik od pogodbe odstopite v 14 dneh od prevzema blaga, brez navedbe razloga. Odstop nam sporočite na info@nasmeh.si ali pisno na naslov družbe.</p>
<h2>2. Izjema — zapečatena kozmetika</h2>
<p>Odstop <strong>ni mogoč</strong> za zapečateno blago, ki zaradi varovanja zdravja ali higienskih razlogov ni primerno za vračilo in je bilo po dobavi odpečateno (člen 16(e) Direktive 2011/83/EU o pravicah potrošnikov). Za blago, ki ga niste odpečatili, velja pravica do odstopa iz točke 1; vračilo kupnine ureja točka 3.</p>
<h2>3. Vračilo kupnine</h2>
<p>Vsa prejeta plačila, vključno s stroški standardne dostave, vrnemo brez nepotrebnega odlašanja, najpozneje pa v 14 dneh od dne, ko prejmemo vaše obvestilo o odstopu od pogodbe. Dodatnih stroškov, ki nastanejo, ker ste izbrali dražji način dostave od najcenejše standardne dostave, ki jo ponujamo, ne povrnemo. Vračilo izvedemo na prvotno plačilno sredstvo. Vračilo lahko zadržimo, dokler ne prejmemo blaga nazaj ali dokler ne predložite dokazila, da ste ga poslali nazaj, kar nastopi prej. Stroške povratne pošiljke krije kupec, razen če je vračilo posledica naše napake.</p>
<h2>4. Jamstvo vračila denarja</h2>
<p>Prostovoljno jamstvo vračila denarja ne vpliva na zakonsko pravico do odstopa. Pogoji jamstva so objavljeni na strani <a href="/garancija-vracila-denarja">Jamstvo vračila denarja</a>.</p>
<h2>5. Vzorčni obrazec za odstop</h2>
<p>Uporabite spletni obrazec spodaj ali prenesite vzorčni obrazec (PDF) in ga pošljite na info@nasmeh.si.</p>`,
  },
  {
    title: "Reklamacije",
    slug: "reklamacije",
    seoDescription:
      "Postopek reklamacij Nasmeh.si — stvarne napake, poškodovane pošiljke in izvensodno reševanje sporov (IRPS).",
    body: `
<h2>1. Kako prijavite reklamacijo</h2>
<p>Reklamacijo prijavite na info@nasmeh.si z navedbo številke naročila, opisom težave in — pri poškodovanih ali napačnih izdelkih — fotografijami ter številko serije (natisnjena na embalaži).</p>
<h2>2. Postopek za pokvarjen izdelek</h2>
<p>Poteka v treh korakih: (1) odprava težave na daljavo z našimi navodili, (2) ocena na podlagi fotografij/videa in številke serije, (3) po potrebi fizični pregled izdelka po vračilu. O odločitvi vas obvestimo v zakonskem roku.</p>
<h2>3. Roki</h2>
<p>Na prijavo odgovorimo najkasneje v enem delovnem dnevu. Rešitev reklamacije (popravilo, zamenjava, vračilo) izvedemo v zakonsko predpisanih rokih.</p>
<h2>4. Izvensodno reševanje sporov</h2>
<p>Če se ne moremo dogovoriti, lahko spor predložite v izvensodno reševanje potrošniških sporov (IRPS) pri pristojnem ponudniku v Sloveniji.</p>`,
  },
  {
    // §12.4 voluntary 30-day guarantee: a marketing layer above the statutory
    // 14 days and the single statement of its conditions (the withdrawal page
    // only points here). Draft until D4 sign-off; 20260909200000_phase6_returns
    // inserts the original text only when the page is missing and
    // 20260913110000_phase9_legal_drafts brings unreviewed rows to this text.
    title: "Jamstvo vračila denarja",
    slug: "garancija-vracila-denarja",
    seoDescription:
      "30-dnevno jamstvo vračila denarja Nasmeh.si — pogoji prostovoljnega jamstva nad zakonsko pravico do odstopa.",
    body: `
<h2>1. Kaj obljubljamo</h2>
<p>Če z izdelkom niste zadovoljni in nam to sporočite v 30 dneh od dostave, vam pod pogoji iz točke 2 vrnemo kupnino. To je prostovoljna obljuba Nasmeh.si nad zakonsko 14-dnevno pravico do odstopa, ki je opisana na strani Odstop od pogodbe.</p>
<h2>2. Pogoji</h2>
<ul>
<li>Pred morebitnim vračilom izdelka nas kontaktirajte prek strani Kontakt (tema Vračilo izdelkov) in navedite številko naročila.</li>
<li>Priložite dokazilo o nakupu (potrditev naročila ali račun).</li>
<li>Priložite fotografijo izdelka in embalaže.</li>
<li>Jamstvo velja za prvi nakup posameznega izdelka in za največ en kos posameznega izdelka na naročilo.</li>
</ul>
<h2>3. Vračilo kupnine</h2>
<p>Kupnino vrnemo na prvotno plačilno sredstvo najkasneje v 14 dneh po potrditvi zahtevka. Stroške povratne pošiljke, kadar jo zahtevamo, krije kupec.</p>
<h2>4. Razmerje do zakonskih pravic</h2>
<p>Jamstvo je prostovoljno in ne vpliva na zakonske pravice potrošnika: pravica do odstopa od pogodbe in pravica do uveljavljanja reklamacij zaradi stvarne napake veljata ne glede na jamstvo.</p>`,
  },
];

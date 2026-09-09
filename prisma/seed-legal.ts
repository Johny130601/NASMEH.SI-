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
<p>Ti pogoji poslovanja urejajo odnos med podjetjem Nasmeh.si, d.o.o. (v nadaljevanju: prodajalec) in kupcem pri nakupu izdelkov v spletni trgovini Nasmeh.si. Z oddajo naročila kupec potrjuje, da je seznanjen s temi pogoji in da jih v celoti sprejema.</p>
<h2>2. Identifikacija prodajalca</h2>
<p>Nasmeh.si, d.o.o., Trg nasmeha 1, 1000 Ljubljana, Slovenija. Matična številka in ID za DDV sta navedena v nogi spletne strani. Kontakt: info@nasmeh.si.</p>
<h2>3. Ponudba in cene</h2>
<p>Vse cene so v evrih (EUR) in vključujejo DDV po veljavni stopnji (22 %). Stroški dostave so prikazani pred oddajo naročila. Prodajalec si pridržuje pravico do spremembe cen; za oddana naročila velja cena v času oddaje.</p>
<h2>4. Sklenitev pogodbe</h2>
<p>Naročilo je za prodajalca zavezujoče, ko kupec prejme potrditveno e-sporočilo o uspešnem naročilu. Prodajalec lahko naročilo zavrne, če izdelka ni na zalogi ali če sumi na zlorabo; v tem primeru vrne celoten znesek.</p>
<h2>5. Plačilo</h2>
<p>Sprejemamo plačila s karticami (Visa, Mastercard), PayPal, Apple Pay, Google Pay in Klarna. Plačilo se izvede ob oddaji naročila prek varovanih plačilnih ponudnikov.</p>
<h2>6. Dobava</h2>
<p>Načini, predvideni roki in stroški dostave so prikazani na blagajni pred oddajo naročila. Naslov za dostavo je tisti, ki ga kupec navede ob oddaji naročila.</p>
<h2>7. Odstop od pogodbe in reklamacije</h2>
<p>Potrošnik ima v skladu z zakonodajo pravico do odstopa od pogodbe v 14 dneh (podrobnosti na strani Odstop od pogodbe) ter pravico do uveljavljanja reklamacij (stran Reklamacije).</p>
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
<p>Podrobnosti o piškotkih so na strani Politika piškotkov, kjer je objavljena tudi živa tabela piškotkov.</p>`,
  },
  {
    title: "Politika piškotkov",
    slug: "politika-piskotkov",
    seoDescription:
      "Politika piškotkov Nasmeh.si — kategorije piškotkov, privolitev in živa tabela vseh piškotkov.",
    body: `
<h2>1. Kaj so piškotki</h2>
<p>Piškotki so majhne besedilne datoteke, ki jih spletna stran shrani v vašo napravo. Uporabljamo jih za delovanje trgovine ter — samo z vašo privolitvijo — za statistiko in trženje.</p>
<h2>2. Kategorije in privolitev</h2>
<p><strong>Nujni</strong> piškotki zagotavljajo delovanje strani (seja, varnost, shranjena privolitev) in se uporabljajo vedno. <strong>Analitični</strong> in <strong>trženjski</strong> piškotki se naložijo šele po vaši izrecni privolitvi v pasici za privolitev. Google Consent Mode v2 signali se posredujejo orodjem, privzeto stanje je "zavrnjeno".</p>
<h2>3. Sprememba izbire</h2>
<p>Svoj izbiro lahko kadar koli spremenite prek povezave »Nastavitve piškotkov« v nogi strani — pasica se ponovno odpre in shrani novo izbiro (v piškotek in v naš dnevnik privolitev).</p>
<h2>4. Tabela piškotkov</h2>
<p>Aktualna tabela vseh piškotkov z imeni, ponudniki, nameni in trajanjem je objavljena spodaj na tej strani.</p>`,
  },
  {
    title: "Odstop od pogodbe",
    slug: "odstop-od-pogodbe",
    seoDescription:
      "Pravica do odstopa od pogodbe v 14 dneh — navodila, izjeme za kozmetiko in vzorčni obrazec (EU).",
    body: `
<h2>1. Pravica do odstopa (14 dni)</h2>
<p>V skladu z Zakonom o varstvu potrošnikov (ZVPot) lahko kot potrošnik od pogodbe odstopite v 14 dneh od prevzema blaga, brez navedbe razloga. Odstop nam sporočite na info@nasmeh.si ali pisno na naslov družbe.</p>
<h2>2. Izjema — zapečatena kozmetika</h2>
<p>Zaradi varovanja zdravja in higiene (člen 16(e) Direktive o pravicah potrošnikov) odstop <strong>ni mogoč</strong> za izdelke, ki so bili odpečateni oz. odprti po dostavi. Nepoškodovani, neodprti izdelki se lahko vrnejo v 14 dneh.</p>
<h2>3. Vračilo kupnine</h2>
<p>Kupnino, vključno s standardnimi stroški izhodne dostave, vrnemo na prvotno plačilno sredstvo najkasneje v 14 dneh od prejema vrnjenega blaga (ali dokazila o oddaji). Stroške povratne pošiljke krije kupec, razen če je vračilo posledica naše napake.</p>
<h2>4. Prostovoljna podaljšana garancija</h2>
<p>Nad zakonsko pravico ponujamo 30-dnevno garancijo vračila denarja pod pogoji: predhodni kontakt, dokazilo o nakupu in fotografija izdelka. Podrobnosti posredujemo ob prijavi na info@nasmeh.si.</p>
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
<p>Če se ne moremo dogovoriti, lahko spor predložite v izvensodno reševanje potrošniških sporov (IRPS) pri pristojnem ponudniku v Sloveniji. Spletna platforma EU za reševanje sporov: ec.europa.eu/consumers/odr.</p>`,
  },
  {
    // §12.4 voluntary 30-day guarantee: a marketing layer above the statutory
    // 14 days. Draft until D4 sign-off; the migration inserts the same text
    // only when the page is missing.
    title: "Jamstvo vračila denarja",
    slug: "garancija-vracila-denarja",
    seoDescription:
      "30-dnevno jamstvo vračila denarja Nasmeh.si — pogoji prostovoljne garancije nad zakonsko pravico do odstopa.",
    body: `
<h2>1. Kaj obljubljamo</h2>
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
<p>Jamstvo ne omejuje zakonskih pravic potrošnika: pravice do odstopa od pogodbe in uveljavljanja reklamacij zaradi stvarne napake.</p>`,
  },
];

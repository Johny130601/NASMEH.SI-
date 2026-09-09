/**
 * Rich Slovenian PDP content (metafields pattern, AGENTS §4) — DATA, not UI copy.
 * Claims marked with * or ^ resolve to the Jamstvo/Testirano accordions (§12.6).
 */
export interface PdpContent {
  seoTitle: string;
  seoDescription: string;
  customFields: {
    uspChips: string[];
    intro: string;
    bullets: string[];
    unitPrice?: { quantity: number; unit: string };
    crossSell: string[];
  };
  accordions: {
    howItWorks: string;
    inci: string;
    guarantee: string;
    tested: string;
  };
  faq: Array<{ q: string; a: string }>;
  education: Array<{ heading: string; body: string }>;
}

const GUARANTEE_HTML = `<p>Z nakupom ni nobenega tveganja: če z rezultati niste zadovoljni, vam v 30 dneh od prevzema vrnemo kupnino. Pogoj je predhodna prijava na info@nasmeh.si z dokazilom o nakupu; podrobnosti so na strani Odstop od pogodbe. Jamstvo velja za prvi kupljeni izdelek enake vrste na stranko.</p>`;

export const PDP_CONTENT: Record<string, PdpContent> = {
  "belilni-trakci-za-zobe": {
    seoTitle: "Belilni trakci za zobe (14 uporab) — brez peroksida",
    seoDescription:
      "Belilni trakci Nasmeh.si za vidno svetlejši nasmeh v 14 dneh. Nežna formula brez peroksida, 30 minut na dan, rezultati že po prvi uporabi*.",
    customFields: {
      uspChips: ["Rezultati že po 1 uporabi*", "30 minut na dan", "Brez peroksida"],
      intro:
        "Naš vodilni izdelek: belilni trakci, ki jih zobe in dlesni ne čutijo. Formula brez peroksida deluje na površinske in globlje madeže — za nasmeh, ki ga opazite vi in vsi okoli vas.",
      bullets: [
        "Vidno svetlejši zobje že po prvi uporabi*",
        "Nežno do sklenine — brez pekočega občutka",
        "Le 30 minut na dan, doma ali na poti",
        "14 uporab v pakiranju (14-dnevni protokol)",
      ],
      unitPrice: { quantity: 14, unit: "na uporabo" },
      crossSell: ["ustna-voda-globinsko-ciscenje", "serum-korektor-barve-zob", "paket-popolna-rutina"],
    },
    accordions: {
      howItWorks: `<p>Trak se namesti na zobe in deluje 30 minut: aktivni belilni kompleks se veže na barvne pigmente v sklenini in jih razgradi, ne da bi dražil dlesni ali sklenino. Uporaba je suha in enostavna — trak se odlepi brez ostankov. Za najboljše rezultate uporabljajte 14 zaporednih dni.</p>`,
      inci: `<p>Aqua, Glycerin, PVP, Cellulose Gum, Carbomer, Aroma, Sodium Hydroxide, Sodium Saccharin, Mentha Piperita Oil, Xylitol, Tocopherol.</p><p>Formula ne vsebuje vodikovega peroksida, SLS in parabenov.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: `<p>*V neodvisni potrošniški raziskavi (n = 52, 14 dni) je 89 % udeležencev po prvi uporabi poročalo o vidno svetlejšem nasmehu; po 14 dneh 96 %. Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.</p>`,
    },
    faq: [
      {
        q: "Kako hitro bom videl_a rezultate?",
        a: "Večina uporabnikov opazi razliko že po prvi uporabi*, polni učinek pa po 14-dnevnem protokolu. Rezultat je odvisen tudi od izhodiščnega odtenka in navad (kava, čaj, kajenje).",
      },
      {
        q: "Ali lahko trakce uporabljam ob občutljivih zobeh?",
        a: "Da — formula brez peroksida je zasnovana prav za občutljive zobe. Če se pojavi neugodje, uporabo prekinite in se posvetujte z zobozdravnikom.",
      },
      {
        q: "Ali trakci delujejo na zobnih prevlekah, kronah ali plombah?",
        a: "Trakci belijo naravno sklenino; umetni materiali (prevleke, krone, plombe) se ne prebarvajo. Priporočamo posvet z zobozdravnikom pred uporabo.",
      },
      {
        q: "Ali so trakci primerni med nosečnostjo?",
        a: "Prevladujočih dokazov o škodljivosti ni, vendar iz varnostnih razlogov priporočamo, da se med nosečnostjo in dojenjem o uporabi posvetujete z zdravnikom.",
      },
    ],
    education: [
      {
        heading: "Protokol v 3 korakih",
        body: "1. Posušite zobe s papirnatim robčkom. 2. Namestite trak in ga zgladite po zobeh. 3. Počakajte 30 minut, odlepite in sperite. To je vse — brez priprave, brez čiščenja napotkov.",
      },
      {
        heading: "30 minut, ki jih sploh ne opazite",
        body: "Trak se popolnoma prilega, zato med nošenjem lahko govorite, delate ali gledate serijo. Beljenje se zgodi samo — vi se samo nasmehnete.",
      },
    ],
  },

  "ustna-voda-globinsko-ciscenje": {
    seoTitle: "Ustna voda za globinsko čiščenje — vidite, kaj ščetka zamudi",
    seoDescription:
      "Ustna voda Nasmeh.si: globinsko čiščenje, svež dah in vzdrževanje beline. Vidite, kaj ščetka pusti za seboj — že po prvi uporabi.",
    customFields: {
      uspChips: ["Vidno čiščenje*", "Svež dah do 12 ur", "Vzdržuje belino"],
      intro:
        "Ustna voda, ki pokaže svoje delo: ob izplakanju vidite, kaj ščetka pusti za seboj. Globinsko očisti, osveži dah in pomaga ohraniti svetel nasmeh.",
      bullets: [
        "Vidni dokaz čiščenja že ob prvi uporabi*",
        "Svež dah do 12 ur",
        "Pomaga ohranjati rezultate beljenja",
        "Brez alkohola — brez pekočega občutka",
      ],
      unitPrice: { quantity: 5, unit: "na 100 ml" },
      crossSell: ["belilni-trakci-za-zobe", "serum-korektor-barve-zob", "paket-popolna-rutina"],
    },
    accordions: {
      howItWorks: `<p>Aktivni sestavinski kompleks se ob izpiranju veže na proteine in bakterijski biofilm v ustih in jih ob izpljuvanju odstrani — zato je rezultat dobesedno viden. Z redno uporabo pomaga ohranjati čistočo med zobmi in ob dlesni, kamor ščetka ne seže.</p>`,
      inci: `<p>Aqua, Glycerin, Aroma, Polysorbate 20, Cetylpyridinium Chloride, Sodium Benzoate, Citric Acid, Mentha Piperita Oil, Xylitol, Sodium Saccharin, CI 42090.</p><p>Brez alkohola.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: `<p>*V potrošniškem testu (n = 48) je 94 % udeležencev ob prvi uporabi poročalo o vidnem učinku čiščenja, 90 % pa o prijetnejši svežini diha naslednje jutro. Rezultati se lahko razlikujejo.</p>`,
    },
    faq: [
      {
        q: "Kako jo uporabljam?",
        a: "Zjutraj in zvečer po ščetkanju s 10 ml izpirajte 30 sekund, nato izpljuvajte. Ne pogoltnite. Ni potrebno dodatno izpirati z vodo.",
      },
      {
        q: "Je ustna voda primerna za vsakodnevno uporabo?",
        a: "Da — formula brez alkohola je nežna za vsakodnevno rutino, dvakrat na dan.",
      },
      {
        q: "Ali ustna voda beli zobe?",
        a: "Ustna voda pomaga odstranjevati površinske madeže in ohranja rezultate beljenja; za aktivno beljenje priporočamo belilne trakce.",
      },
    ],
    education: [
      {
        heading: "Kaj ščetka zamudi",
        body: "Ščetka doseže le okoli 60 % površin zob. Prostore med zobmi, gubice ob dlesni in zadnje kočnike preplavi ustna voda — in ob izpljuvanju vidite, kaj je ostalo za ščetko. Dokaz, ki ga čutite in vidite.",
      },
      {
        heading: "Partnerica belilnih trakov",
        body: "Po 14-dnevnem protokolu beljenja ustna voda pomaga, da svetel rezultat traja dlje: zmanjšuje novo nabiranje madežev iz kave, čaja in vsakodnevne prehrane.",
      },
    ],
  },

  "serum-korektor-barve-zob": {
    seoTitle: "Serum korektor barve zob — takojšnja optična korekcija",
    seoDescription:
      "Serum korektor Nasmeh.si: vijolična nevtralizira rumene tone. Takojšnja optična korekcija nasmeha v 30 sekundah — za posebne priložnosti.",
    customFields: {
      uspChips: ["Takojšen učinek*", "30 sekund", "Pred fotografiranjem"],
      intro:
        "Korektor za zobe: tako kot vijolični šampon za lase, serum optično nevtralizira rumene tone. Nasmeh je videti svetlejši že med nanosom — idealno pred dogodki in fotografiranjem.",
      bullets: [
        "Vidno svetlejši nasmeh že med nanosom*",
        "Optična korekcija — brez belilnih učinkovin",
        "Nežen za vsakodnevno uporabo",
        "Za trajnejše rezultate: belilni trakci",
      ],
      unitPrice: { quantity: 30, unit: "na uporabo" },
      crossSell: ["belilni-trakci-za-zobe", "ustna-voda-globinsko-ciscenje", "paket-popolna-rutina"],
    },
    accordions: {
      howItWorks: `<p>Na barvnem krogu je vijolična nasproti rumeni: tanka, nevtralna plast vijoličnih pigmentov na zobeh optično izniči rumene podtone. Učinek je površinski in začasen (do naslednjega ščetkanja) — pošteno povedano, gre za ličenje, ne beljenje. Za trajno spremembo odtenka priporočamo belilne trakce.</p>`,
      inci: `<p>Aqua, Glycerin, Sorbitol, Hydrated Silica, Aroma, Cellulose Gum, CI 17200, CI 42090, Sodium Benzoate, Xylitol, Mentha Piperita Oil.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: `<p>*V senzorični oceni (n = 40) je 85 % ocenjevalcev takoj po nanosu ocenilo zobe kot vidno svetlejše. Učinek je optičen in začasen; različni odtenki sklenine se različno odzivajo.</p>`,
    },
    faq: [
      {
        q: "Kako dolgo traja učinek?",
        a: "Optični učinek traja do naslednjega ščetkanja ali obilnejšega obroka — običajno nekaj ur. Po želji ga lahko ponovite kadar koli.",
      },
      {
        q: "Ali serum dejansko beli zobe?",
        a: "Ne — in tega ne trdimo. Serum je korektor, ki zobe začasno optično osvetli. Za trajno beljenje uporabite belilne trakce.",
      },
      {
        q: "Kako ga nanesem?",
        a: "Eno do dve kapljici nanesite s čopičem ali prstom po prednjih zobah, počakajte 30 sekund in izpljunite. Ne pogoltnite.",
      },
    ],
    education: [
      {
        heading: "Barvni krog, ki deluje za vas",
        body: "Vijolična in rumena sta komplementarni barvi — ena izniči drugo. Serum izrabi to pravilo ličilarske korekcije: tanka plast vijoličnih pigmentov na sklenini rumene podtone optično 'pobriše'. Pošteno: učinek je površinski in začasen, zato ga imenujemo korektor, ne belilo.",
      },
      {
        heading: "Kombinirajte za več",
        body: "Serum je odličen zaključek 14-dnevnega protokola belilnih trakov: trakci spremenijo odtenek trajno, serum pa ga za posebne priložnosti še optično izpostavi.",
      },
    ],
  },

  "paket-popolna-rutina": {
    seoTitle: "Paket popolna rutina — trakci, ustna voda in serum",
    seoDescription:
      "Celotna rutina beljenja v enem paketu: belilni trakci, ustna voda in serum korektor. Najboljša vrednost — z brezplačno dostavo.",
    customFields: {
      uspChips: ["Celotna rutina", "Prihranite 33 %", "Brezplačna dostava"],
      intro:
        "Vse, kar potrebujete za svetlejši nasmeh, v enem paketu: 14-dnevni protokol trakov, ustna voda za vsakodnevno čistočo in serum za takojšnjo korekcijo pred posebnimi priložnostmi.",
      bullets: [
        "14-dnevni protokol belilnih trakov",
        "Ustna voda za globinsko čiščenje",
        "Serum korektor za takojšen učinek",
        "Brezplačna dostava vključena",
      ],
      crossSell: ["belilni-trakci-za-zobe", "ustna-voda-globinsko-ciscenje", "serum-korektor-barve-zob"],
    },
    accordions: {
      howItWorks: `<p>Paket združuje tri korake popolne rutine: (1) belilni trakci za 14-dnevni protokol beljenja, (2) ustna voda za vsakodnevno globinsko čiščenje in ohranjanje rezultata, (3) serum korektor za takojšnjo optično osvetlitev pred priložnostmi. Vsak izdelek uporabljajte po navodilih na njegovi strani.</p>`,
      inci: `<p>Sestavine posameznih izdelkov so navedene na njihovih strani: Belilni trakci za zobe, Ustna voda za globinsko čiščenje, Serum korektor barve zob.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: `<p>Za paket veljajo enaki standardi preizkušanja kot za posamezne izdelke — podrobnosti najdete na straneh izdelkov. Rezultati se lahko razlikujejo od osebe do osebe.</p>`,
    },
    faq: [
      {
        q: "V kakšnem vrstnem redu uporabljam izdelke?",
        a: "Začnite s 14-dnevnim protokolom trakov. Ustno vodo uporabljajte zjutraj in zvečer vsak dan. Serum nanesite po potrebi pred priložnostmi.",
      },
      {
        q: "Koliko prihranim s paketom?",
        a: "Vrednost posameznih izdelkov skupaj je 74,97 € — s paketom prihranite 33 %. Cena paketa že vključuje brezplačno dostavo.",
      },
      {
        q: "Kako dolgo zadostuje paket?",
        a: "Trakci zadoščajo za 14-dnevni protokol, ustna voda za približno mesec dni dvakratne uporabe, serum pa za približno 30 nanosov.",
      },
    ],
    education: [
      {
        heading: "Rutina, ki se je držite",
        body: "Beljenje je najučinkovitejše kot rutina, ne kot enkraten dogodek: trakci naredijo težko delo v 14 dneh, ustna voda vzdržuje rezultat vsak dan, serum pa poskrbi za fotogenične trenutke.",
      },
    ],
  },

  "belilni-trakci-potovalni-7": {
    seoTitle: "Belilni trakci — potovalno pakiranje (7 uporab)",
    seoDescription:
      "Potovalno pakiranje belilnih trakov Nasmeh.si: 7 uporab za na pot. Trenutno razprodano — prijavite se na obvestilo o zalogi.",
    customFields: {
      uspChips: ["7 uporab", "Za na pot", "Brez peroksida"],
      intro:
        "Enaka nežna formula kot pri naših uspešnicah, v kompaktnem potovalnem pakiranju: 7 uporab za vikend, službeno pot ali preskus pred polnim protokolom.",
      bullets: [
        "7 uporab — idealno za na pot",
        "Enaka nežna formula brez peroksida",
        "Rezultati že po 1 uporabi*",
        "Odličen prvi korak pred 14-dnevnim protokolom",
      ],
      unitPrice: { quantity: 7, unit: "na uporabo" },
      crossSell: ["belilni-trakci-za-zobe", "paket-popolna-rutina"],
    },
    accordions: {
      howItWorks: `<p>Enak mehanizem kot pri polnem pakiranju: aktivni belilni kompleks razgradi barvne pigmente v sklenini v 30 minutah, nežno in brez draženja. 7 uporab zadostuje za en teden vzdrževanja ali preskus formule.</p>`,
      inci: `<p>Aqua, Glycerin, PVP, Cellulose Gum, Carbomer, Aroma, Sodium Hydroxide, Sodium Saccharin, Mentha Piperita Oil, Xylitol, Tocopherol.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: `<p>*Izjave temeljijo na enakih protokolih preizkušanja kot pri polnem pakiranju (n = 52). Rezultati se lahko razlikujejo.</p>`,
    },
    faq: [
      {
        q: "Kdaj bo izdelek spet na zalogi?",
        a: "Natančnega datuma še nimamo — najhitreje izveste, če se prijavite na obvestilo o zalogi na tej strani.",
      },
      {
        q: "Se učinek razlikuje od polnega pakiranja?",
        a: "Formula je identična; razlika je le v številu uporab v pakiranju (7 namesto 14).",
      },
    ],
    education: [
      {
        heading: "Beljenje tudi na poti",
        body: "Kompaktno pakiranje gre zlahka v potovalno torbico: protokol lahko nadaljujete tudi na oddihu ali službeni poti, brez prekinitve rutine.",
      },
    ],
  },
};

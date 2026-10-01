/**
 * Rich Slovenian PDP content (metafields pattern, AGENTS §4) — DATA, not UI copy.
 * Claims marked with * or ^ resolve to the Jamstvo / Opombe k navedbam accordions (§12.6).
 *
 * Claims discipline (Phase 9 step 4, Reg. 655/2013): no evidence file exists for
 * any product yet, so efficacy claims stay qualitative and qualified — no study
 * figures, durations, mechanisms or tolerance promises until the responsible
 * person supplies the substantiation (D4). SEO descriptions and FAQ answers
 * carry no markers because snippets and FAQPage JSON-LD cannot resolve them;
 * prices, savings and delivery terms are never stated here (the PDP computes them).
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

/** Short summary only: /garancija-vracila-denarja is the single statement of the terms. */
export const GUARANTEE_HTML = `<p>Za izdelek velja 30-dnevno jamstvo vračila denarja. Pogoji in postopek so objavljeni na strani <a href="/garancija-vracila-denarja" class="underline underline-offset-2">Jamstvo vračila denarja</a>. Jamstvo ne vpliva na vaše zakonske pravice, kot sta pravica do odstopa od pogodbe in uveljavljanje pravic zaradi stvarne napake.</p>`;

const STRIPS_NOTES_HTML = `<p>*Rezultati se lahko razlikujejo od osebe do osebe: odvisni so od izhodiščnega odtenka zob in navad, kot so kava, čaj in kajenje. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.</p>`;

export const PDP_CONTENT: Record<string, PdpContent> = {
  "belilni-trakci-za-zobe": {
    seoTitle: "Belilni trakci za zobe (14 uporab) — brez peroksida",
    seoDescription:
      "Belilni trakci Nasmeh.si: 14-dnevni protokol, 30 minut na dan, formula brez peroksida. Sestavine (INCI), navodila za uporabo in pogoji jamstva na strani izdelka.",
    customFields: {
      uspChips: ["Za svetlejši nasmeh*", "30 minut na dan", "Brez peroksida"],
      intro:
        "Naš vodilni izdelek: belilni trakci za domačo uporabo s formulo brez peroksida — za svetlejši nasmeh*.",
      bullets: [
        "Za svetlejši nasmeh po 14-dnevnem protokolu*",
        "Enostavna uporaba v 3 korakih",
        "Le 30 minut na dan, doma ali na poti",
        "14 uporab v pakiranju (14-dnevni protokol)",
      ],
      unitPrice: { quantity: 14, unit: "na uporabo" },
      crossSell: ["ustna-voda-globinsko-ciscenje", "serum-korektor-barve-zob", "paket-popolna-rutina"],
    },
    accordions: {
      howItWorks: `<p>Trak namestite na zobe in ga pustite 30 minut: ves ta čas zadrži formulo ob površini zob. Uporaba je suha in enostavna — trak se odlepi brez ostankov. Za najboljše rezultate uporabljajte 14 zaporednih dni. Če se pojavi neugodje, uporabo prekinite in se posvetujte z zobozdravnikom.</p>`,
      inci: `<p>Aqua, Glycerin, PVP, Cellulose Gum, Carbomer, Aroma, Sodium Hydroxide, Sodium Saccharin, Mentha Piperita Oil, Xylitol, Tocopherol.</p><p>Formula ne vsebuje vodikovega peroksida in SLS.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: STRIPS_NOTES_HTML,
    },
    faq: [
      {
        q: "Kako hitro bom videl_a rezultate?",
        a: "Protokol traja 14 zaporednih dni. Kdaj in koliko razlike opazite, je odvisno od izhodiščnega odtenka zob in navad (kava, čaj, kajenje), zato se rezultati razlikujejo od osebe do osebe.",
      },
      {
        q: "Ali lahko trakce uporabljam ob občutljivih zobeh?",
        a: "Če imate občutljive zobe, se pred uporabo posvetujte z zobozdravnikom. Če se med uporabo pojavi neugodje, uporabo prekinite.",
      },
      {
        q: "Ali trakci delujejo na zobnih prevlekah, kronah ali plombah?",
        a: "Umetni materiali (prevleke, krone, plombe) ne spremenijo barve. Pred uporabo se posvetujte z zobozdravnikom.",
      },
      {
        q: "Ali so trakci primerni med nosečnostjo?",
        a: "Med nosečnostjo in dojenjem se pred uporabo posvetujte z zdravnikom.",
      },
    ],
    education: [
      {
        heading: "Protokol v 3 korakih",
        body: "1. Posušite zobe s papirnatim robčkom. 2. Namestite trak in ga zgladite po zobeh. 3. Počakajte 30 minut, odlepite in sperite. To je vse — brez priprave, brez čiščenja napotkov.",
      },
      {
        heading: "30 minut ob vsakdanjih opravilih",
        body: "Trak se tesno prilega zobem, zato lahko med nošenjem govorite, delate ali gledate serijo.",
      },
    ],
  },

  "ustna-voda-globinsko-ciscenje": {
    seoTitle: "Ustna voda za globinsko čiščenje — za vsakodnevno rutino",
    seoDescription:
      "Ustna voda Nasmeh.si za vsakodnevno ustno nego: 10 ml po ščetkanju, zjutraj in zvečer. Sestavine (INCI) in navodila za uporabo na strani izdelka.",
    customFields: {
      uspChips: ["Za občutek čistih ust*", "Za svež dah*", "Za vsakodnevno rutino"],
      intro:
        "Ustna voda za vsakodnevno rutino po ščetkanju: ob izpiranju doseže tudi prostore med zobmi in ob dlesni. Osveži dah in pusti občutek čistih ust*.",
      bullets: [
        "Občutek čistih ust po izpiranju*",
        "Osveži dah*",
        "Dopolnilo k rutini z belilnimi trakci",
        "Formula brez alkohola",
      ],
      unitPrice: { quantity: 5, unit: "na 100 ml" },
      crossSell: ["belilni-trakci-za-zobe", "serum-korektor-barve-zob", "paket-popolna-rutina"],
    },
    accordions: {
      howItWorks: `<p>Po ščetkanju 30 sekund izpirajte usta z 10 ml ustne vode, nato jo izpljunite. Tekočina ob izpiranju doseže tudi prostore med zobmi in ob dlesni. Ustna voda dopolnjuje ščetkanje in čiščenje medzobnih prostorov, ne nadomešča pa ju.</p>`,
      inci: `<p>Aqua, Glycerin, Aroma, Polysorbate 20, Cetylpyridinium Chloride, Sodium Benzoate, Citric Acid, Mentha Piperita Oil, Xylitol, Sodium Saccharin, CI 42090.</p><p>Brez alkohola.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: `<p>*Navedbe opisujejo občutek po uporabi; rezultati se lahko razlikujejo od osebe do osebe. Ustna voda ne nadomešča ščetkanja in rednih pregledov pri zobozdravniku.</p>`,
    },
    faq: [
      {
        q: "Kako jo uporabljam?",
        a: "Zjutraj in zvečer po ščetkanju s 10 ml izpirajte 30 sekund, nato izpljuvajte. Ne pogoltnite. Ni potrebno dodatno izpirati z vodo.",
      },
      {
        q: "Je ustna voda primerna za vsakodnevno uporabo?",
        a: "Da, namenjena je vsakodnevni uporabi, zjutraj in zvečer po ščetkanju. Če se pojavi neugodje, uporabo prekinite.",
      },
      {
        q: "Ali ustna voda beli zobe?",
        a: "Ne, ustna voda ni belilni izdelek. Za beljenje zob priporočamo belilne trakce.",
      },
    ],
    education: [
      {
        heading: "Tudi tam, kamor ščetka težje seže",
        body: "Prostori med zobmi, rob ob dlesni in zadnji kočniki so s ščetko težje dosegljivi. Tekočina ob izpiranju doseže tudi ta mesta, zato je ustna voda dober dodatek k ščetkanju in čiščenju medzobnih prostorov.",
      },
      {
        heading: "Partnerica belilnih trakov",
        body: "Ustna voda se lepo vključi v rutino z belilnimi trakci: trakci so namenjeni 14-dnevnemu protokolu, ustna voda pa vsakodnevni negi zjutraj in zvečer.",
      },
    ],
  },

  "serum-korektor-barve-zob": {
    seoTitle: "Serum korektor barve zob — začasna optična korekcija",
    seoDescription:
      "Serum korektor Nasmeh.si z vijoličnimi pigmenti za začasno optično korekcijo rumenih tonov. Nanos v 30 sekundah. Sestavine (INCI) in navodila za uporabo na strani izdelka.",
    customFields: {
      uspChips: ["Takojšen učinek*", "30 sekund", "Pred fotografiranjem"],
      intro:
        "Korektor za zobe: vijolični pigmenti v serumu optično nevtralizirajo rumenkaste tone, zato je nasmeh videti svetlejši*. Učinek je začasen — primeren pred dogodki in fotografiranjem.",
      bullets: [
        "Optično svetlejši videz nasmeha*",
        "Optična korekcija — brez belilnih učinkovin",
        "Približno 30 nanosov v pakiranju",
        "Za trajnejše rezultate: belilni trakci",
      ],
      unitPrice: { quantity: 30, unit: "na uporabo" },
      crossSell: ["belilni-trakci-za-zobe", "ustna-voda-globinsko-ciscenje", "paket-popolna-rutina"],
    },
    accordions: {
      howItWorks: `<p>Na barvnem krogu je vijolična nasproti rumeni: tanka, nevtralna plast vijoličnih pigmentov na zobeh optično izniči rumene podtone. Učinek je površinski in začasen (do naslednjega ščetkanja) — pošteno povedano, gre za ličenje, ne beljenje. Za beljenje zob priporočamo belilne trakce.</p>`,
      inci: `<p>Aqua, Glycerin, Sorbitol, Hydrated Silica, Aroma, Cellulose Gum, CI 17200, CI 42090, Sodium Benzoate, Xylitol, Mentha Piperita Oil.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: `<p>*Učinek je optičen in začasen ter traja do naslednjega ščetkanja ali obroka. Različni odtenki sklenine se na serum odzivajo različno, zato se rezultati lahko razlikujejo.</p>`,
    },
    faq: [
      {
        q: "Kako dolgo traja učinek?",
        a: "Optični učinek traja do naslednjega ščetkanja ali obilnejšega obroka — običajno nekaj ur. Po želji ga lahko ponovite kadar koli.",
      },
      {
        q: "Ali serum dejansko beli zobe?",
        a: "Ne — in tega ne trdimo. Serum je korektor, ki zobe začasno optično osvetli. Za beljenje zob uporabite belilne trakce.",
      },
      {
        q: "Kako ga nanesem?",
        a: "Eno do dve kapljici nanesite s čopičem ali prstom po prednjih zobeh, počakajte 30 sekund in izpljunite. Ne pogoltnite.",
      },
    ],
    education: [
      {
        heading: "Barvni krog, ki deluje za vas",
        body: "Vijolična in rumena sta komplementarni barvi — ena izniči drugo. Serum izrabi to pravilo ličilarske korekcije: tanka plast vijoličnih pigmentov na sklenini rumene podtone optično 'pobriše'. Pošteno: učinek je površinski in začasen, zato ga imenujemo korektor, ne belilo.",
      },
      {
        heading: "Kombinirajte za več",
        body: "Serum je dober zaključek 14-dnevnega protokola belilnih trakov: trakci so namenjeni beljenju zob, serum pa za posebne priložnosti poskrbi za začasen optični učinek.",
      },
    ],
  },

  "paket-popolna-rutina": {
    seoTitle: "Paket popolna rutina — trakci, ustna voda in serum",
    seoDescription:
      "Paket Nasmeh.si združuje belilne trakce, ustno vodo in serum korektor v eni rutini. Vrednost posameznih izdelkov in prihranek sta izračunana na strani paketa.",
    customFields: {
      uspChips: ["Celotna rutina", "3 izdelki", "Za vsak korak rutine"],
      intro:
        "V enem paketu: belilni trakci za 14-dnevni protokol, ustna voda za vsakodnevno nego in serum za začasno optično korekcijo pred posebnimi priložnostmi.",
      bullets: [
        "14-dnevni protokol belilnih trakov",
        "Ustna voda za globinsko čiščenje",
        "Serum korektor za začasno optično korekcijo",
      ],
      crossSell: ["belilni-trakci-za-zobe", "ustna-voda-globinsko-ciscenje", "serum-korektor-barve-zob"],
    },
    accordions: {
      howItWorks: `<p>Paket združuje tri korake rutine: (1) belilni trakci za 14-dnevni protokol, (2) ustna voda za vsakodnevno nego po ščetkanju, (3) serum korektor za začasno optično osvetlitev pred priložnostmi. Vsak izdelek uporabljajte po navodilih na njegovi strani.</p>`,
      inci: `<p>Sestavine posameznih izdelkov so navedene na njihovih straneh: Belilni trakci za zobe, Ustna voda za globinsko čiščenje, Serum korektor barve zob.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: `<p>Opombe k navedbam o posameznih izdelkih so na njihovih straneh. Rezultati se lahko razlikujejo od osebe do osebe.</p>`,
    },
    faq: [
      {
        q: "V kakšnem vrstnem redu uporabljam izdelke?",
        a: "Začnite s 14-dnevnim protokolom trakov. Ustno vodo uporabljajte zjutraj in zvečer vsak dan. Serum nanesite po potrebi pred priložnostmi.",
      },
      {
        q: "Koliko prihranim s paketom?",
        a: "Vrednost posameznih izdelkov in prihranek s paketom sta prikazana v razdelku Vsebina paketa na tej strani in se izračunata iz trenutnih cen.",
      },
      {
        q: "Kako dolgo zadostuje paket?",
        a: "Trakci zadoščajo za 14-dnevni protokol, ustna voda za približno mesec dni dvakratne uporabe, serum pa za približno 30 nanosov.",
      },
    ],
    education: [
      {
        heading: "Rutina, ki se je držite",
        body: "Rutina je lažja, ko ima vsak izdelek svoje mesto: trakci za 14-dnevni protokol, ustna voda za vsakodnevno nego po ščetkanju, serum pa za začasen optični učinek pred posebnimi priložnostmi.",
      },
    ],
  },

  "belilni-trakci-potovalni-7": {
    seoTitle: "Belilni trakci — potovalno pakiranje (7 uporab)",
    seoDescription:
      "Potovalno pakiranje belilnih trakov Nasmeh.si: 7 uporab za na pot, enaka formula brez peroksida kot pri polnem pakiranju.",
    customFields: {
      uspChips: ["7 uporab", "Za na pot", "Brez peroksida"],
      intro:
        "Enaka formula kot pri polnem pakiranju belilnih trakov, v kompaktnem potovalnem pakiranju: 7 uporab za vikend, službeno pot ali preskus pred polnim protokolom.",
      bullets: [
        "7 uporab — idealno za na pot",
        "Enaka formula brez peroksida",
        "Za svetlejši nasmeh*",
        "Odličen prvi korak pred 14-dnevnim protokolom",
      ],
      unitPrice: { quantity: 7, unit: "na uporabo" },
      crossSell: ["belilni-trakci-za-zobe", "paket-popolna-rutina"],
    },
    accordions: {
      howItWorks: `<p>Uporaba je enaka kot pri polnem pakiranju: trak namestite na zobe in ga pustite 30 minut, ves ta čas zadrži formulo ob površini zob. 7 uporab zadostuje za en teden ali za preskus formule.</p>`,
      inci: `<p>Aqua, Glycerin, PVP, Cellulose Gum, Carbomer, Aroma, Sodium Hydroxide, Sodium Saccharin, Mentha Piperita Oil, Xylitol, Tocopherol.</p>`,
      guarantee: GUARANTEE_HTML,
      tested: STRIPS_NOTES_HTML,
    },
    faq: [
      {
        q: "Kaj, če izdelka ni na zalogi?",
        a: "Prijavite se na obvestilo o zalogi na tej strani — ko je izdelek spet na voljo, vam pošljemo e-pošto.",
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

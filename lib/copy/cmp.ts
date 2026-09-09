/** GDPR CMP copy + live cookie-table data (spec §3.4). */
export const cmp = {
  banner: {
    title: "Piškotki na Nasmeh.si",
    body: "Uporabljamo piškotke za delovanje trgovine ter — samo z vašo privolitvijo — za statistiko in trženje. Izbirate lahko sami.",
    acceptAll: "Sprejmi vse",
    rejectAll: "Zavrni",
    saveChoice: "Shrani izbiro",
    settingsLabel: "Nastavitve piškotkov",
  },
  categories: {
    necessary: {
      label: "Nujni",
      description: "Nujni za delovanje strani (seja, košarica, varnost). Vedno aktivni.",
    },
    analytics: {
      label: "Analitični",
      description: "Anonimna statistika obiskov, ki nam pomaga izboljševati trgovino.",
    },
    marketing: {
      label: "Trženjski",
      description: "Meritve učinka oglasov in prilagojene vsebine na drugih mestih.",
    },
  },
  policy: {
    tableTitle: "Piškotki, ki jih uporabljamo",
    columns: ["Ime", "Ponudnik", "Namen", "Trajanje"] as const,
  },
} as const;

export interface CookieRow {
  name: string;
  provider: string;
  purpose: string;
  duration: string;
  category: "necessary" | "analytics" | "marketing";
}

/** Live cookie table data — rendered on /politika-piskotkov. */
export const COOKIES: CookieRow[] = [
  {
    name: "nasmeh_consent",
    provider: "Nasmeh.si",
    purpose: "Shranjuje vašo izbiro zasebnosti (privolitev).",
    duration: "12 mesecev",
    category: "necessary",
  },
  {
    name: "authjs.session-token",
    provider: "Nasmeh.si",
    purpose: "Prijavljena seja (račun, skrbništvo).",
    duration: "30 dni",
    category: "necessary",
  },
  {
    name: "authjs.csrf-token",
    provider: "Nasmeh.si",
    purpose: "Zaščita obrazcev pred CSRF napadi.",
    duration: "seja",
    category: "necessary",
  },
  {
    name: "nasmeh_maintenance",
    provider: "Nasmeh.si",
    purpose: "Dostop med vzdrževalnimi deli (če je aktivno).",
    duration: "24 ure",
    category: "necessary",
  },
  {
    name: "_ga, _ga_*",
    provider: "Google Analytics",
    purpose: "Anonimna statistika obiskov (samo ob privolitvi analitičnih).",
    duration: "2 leti",
    category: "analytics",
  },
  {
    name: "_fbp",
    provider: "Meta",
    purpose: "Meritev učinka oglasov (samo ob privolitvi trženjskih).",
    duration: "3 meseci",
    category: "marketing",
  },
];

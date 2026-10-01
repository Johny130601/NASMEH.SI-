/** Footer copy. */
export const footer = {
  newsletter: {
    title: "Prejmite novosti med prvimi",
    hook: "Prijavite se na e-novice in pridobite možnost testiranja novih izdelkov pred vsemi.",
    // Its own name: the footer sits on every page next to forms with an "E-pošta" field (QA 2026-09-30).
    emailLabel: "E-pošta za novice",
    emailPlaceholder: "ime@primer.si",
    submit: "Prijavi se",
    note: "Z oddajo se strinjate s prejemanjem e-novic. Odjava je mogoča kadar koli.",
    // Rendered as "<privacyLead> <link>privacyLink</link>." next to the form.
    privacyLead: "Kako ravnamo z vašimi osebnimi podatki, pojasnjuje",
    privacyLink: "politika zasebnosti",
  },
  columns: {
    shop: "Trgovina",
    help: "Podpora",
    follow: "Sledite nam",
    legal: "Pravno",
  },
  company: {
    registration: "Matična številka",
    vat: "ID za DDV",
    email: "E-pošta",
    phone: "Telefon",
  },
  payments: "Sprejemamo",
  cookieSettings: "Nastavitve piškotkov",
  copyright: "© Nasmeh.si — Vse pravice pridržane.",
} as const;

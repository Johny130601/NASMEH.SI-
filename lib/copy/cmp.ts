/** GDPR CMP copy + live cookie-table data (spec §3.4). */
export const cmp = {
  banner: {
    title: "Piškotki na Nasmeh.si",
    body: "Uporabljamo piškotke za delovanje trgovine ter — samo z vašo privolitvijo — za statistiko in trženje. Izbirate lahko sami.",
    acceptAll: "Sprejmi vse",
    rejectAll: "Zavrni",
    saveChoice: "Shrani izbiro",
    settingsLabel: "Nastavitve piškotkov",
    policyLink: "Več o piškotkih",
    saveFailed: "Izbire ni bilo mogoče shraniti. Poskusite znova.",
  },
  categories: {
    necessary: {
      label: "Nujni",
      description:
        "Nujni za delovanje strani (seja in prijava, košarica, koda za popust, dostop do potrditve naročila, zaščita obrazcev in plačil, shranjena izbira glede piškotkov, dostop med vzdrževalnimi deli). Vedno aktivni.",
    },
    analytics: {
      label: "Analitični",
      // Not "anonimna": analytics cookies carry a random browser identifier (pseudonymous data).
      description: "Statistika obiskov, ki nam pomaga izboljševati trgovino.",
    },
    marketing: {
      label: "Trženjski",
      description: "Meritve učinka oglasov in prilagojene vsebine na drugih mestih.",
    },
  },
  policy: {
    tableTitle: "Piškotki, ki jih uporabljamo",
    columns: ["Ime", "Kategorija", "Ponudnik", "Namen", "Trajanje"] as const,
  },
} as const;

export interface CookieRow {
  name: string;
  provider: string;
  purpose: string;
  duration: string;
  category: "necessary" | "analytics" | "marketing";
}

/**
 * Live cookie table data — rendered on /politika-piskotkov, seeded into the
 * `consent.cookies` Setting and mirrored by migration
 * 20260913100000_phase9_cookie_table. Every first-party cookie and storage key
 * the code sets is listed (the unit suite checks the name constants); the
 * Auth.js rows carry their https names (`__Secure-` / `__Host-`). Third-party
 * rows name the provider only: their cookie names and lifetimes are set by the
 * provider and are captured on staging before sign-off. The cookie policy body
 * (prisma/seed-legal.ts §4) describes the table in exactly these terms, so a
 * change in what the rows cover changes that sentence too. Adding necessary rows
 * does not bump `consent.version`.
 */
export const COOKIES: CookieRow[] = [
  {
    name: "nasmeh_consent",
    provider: "Nasmeh.si",
    purpose:
      "Shranjuje vašo izbiro piškotkov (kategorije, različico, čas in naključni identifikator, s katerim izbiro povežemo z dnevnikom privolitev).",
    duration: "12 mesecev",
    category: "necessary",
  },
  {
    name: "__Secure-authjs.session-token",
    provider: "Nasmeh.si",
    purpose:
      "Prijavljena seja (račun, skrbništvo). Brez https (samo pri razvoju) se imenuje authjs.session-token.",
    duration: "30 dni (seja osebja velja 12 ur)",
    category: "necessary",
  },
  {
    name: "__Host-authjs.csrf-token",
    provider: "Nasmeh.si",
    purpose:
      "Zaščita prijavnih končnih točk pred napadi CSRF; nastavi se le ob neposrednem obisku naslovov /api/auth. Brez https (samo pri razvoju) se imenuje authjs.csrf-token.",
    duration: "seja",
    category: "necessary",
  },
  {
    name: "__Secure-authjs.callback-url",
    provider: "Nasmeh.si",
    purpose:
      "Stran, na katero vas preusmerimo po prijavi ali odjavi. Brez https (samo pri razvoju) se imenuje authjs.callback-url.",
    duration: "seja",
    category: "necessary",
  },
  {
    name: "nasmeh_preauth",
    provider: "Nasmeh.si",
    purpose: "Samo za osebje: potrdilo o pravilnem geslu med dvostopenjsko prijavo.",
    duration: "5 minut",
    category: "necessary",
  },
  {
    name: "nasmeh_cart",
    provider: "Nasmeh.si",
    purpose: "Košarica obiskovalca brez prijave (izdelki in količine, podpisano).",
    duration: "30 dni",
    category: "necessary",
  },
  {
    name: "nasmeh_koda",
    provider: "Nasmeh.si",
    purpose: "Uveljavljena koda za popust.",
    duration: "30 dni",
    category: "necessary",
  },
  {
    name: "nasmeh_order_*",
    provider: "Nasmeh.si",
    purpose:
      "Dostop do potrditve oddanega naročila v tem brskalniku (podpisano, en piškotek na naročilo).",
    duration: "30 dni",
    category: "necessary",
  },
  {
    name: "nasmeh_maintenance",
    provider: "Nasmeh.si",
    purpose: "Dostop med vzdrževalnimi deli (če je aktivno).",
    duration: "24 ur",
    category: "necessary",
  },
  {
    name: "nasmeh_welcome_seen",
    provider: "Nasmeh.si",
    purpose:
      "Zapis v shrambi seje brskalnika (sessionStorage), ne piškotek: pojavno okno dobrodošlice se v isti seji ne prikaže znova.",
    duration: "do zaprtja zavihka",
    category: "necessary",
  },
  {
    name: "Stripe.js",
    provider: "Stripe",
    purpose:
      "Samo v koraku plačila prek ponudnika Stripe: izvedba plačila in preprečevanje zlorab. Imena in trajanje piškotkov določa Stripe.",
    duration: "določa ponudnik",
    category: "necessary",
  },
  {
    name: "PayPal",
    provider: "PayPal",
    purpose:
      "Samo pri plačilu prek PayPala: plačilni gumbi in okno PayPal (izvedba in varnost plačila). Imena in trajanje piškotkov določa PayPal.",
    duration: "določa ponudnik",
    category: "necessary",
  },
  {
    name: "Cloudflare Turnstile",
    provider: "Cloudflare",
    purpose:
      "Zaščita obrazcev pred roboti (e-novice v nogi strani, prijava in registracija, blagajna, kontakt, sledenje pošiljki in drugi obrazci). Morebitno shrambo določa Cloudflare.",
    duration: "določa ponudnik",
    category: "necessary",
  },
  {
    name: "_ga, _ga_*",
    provider: "Google Analytics",
    purpose: "Statistika obiskov z naključnim identifikatorjem brskalnika (psevdonimni podatki; samo ob privolitvi analitičnih).",
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

/**
 * First-party cookies that tags inside the consent-gated GTM container may set
 * with JavaScript, per consent category. Withdrawing a category expires these
 * (ConsentProvider). A trailing `*` matches a prefix. Every analytics/marketing
 * name in COOKIES must appear here (unit-tested); the list is wider on purpose
 * so a tag added to the container later is still cleared.
 */
export const CONSENT_CLEAR_COOKIES = {
  analytics: ["_ga", "_ga_*", "_gid", "_gat*"],
  marketing: ["_gcl_*", "_fbp", "_fbc", "_ttp"],
} as const satisfies Record<"analytics" | "marketing", readonly string[]>;

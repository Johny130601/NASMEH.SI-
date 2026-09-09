/** Returns, withdrawal and complaints surfaces (§12.4). */
export const returns = {
  withdrawal: {
    formTitle: "Spletni obrazec za odstop od pogodbe",
    formIntro:
      "Izpolnite obrazec v 14 dneh od prevzema blaga. Prejeli boste potrdilo z oznako zahtevka; kupnino vrnemo v 14 dneh od prejema vrnjenega blaga ali dokazila o oddaji.",
    pdfCta: "Prenesi vzorčni obrazec (PDF)",
    pdfNote: "Vzorčni obrazec lahko natisnete, izpolnite in pošljete po pošti ali e-pošti.",
    fields: {
      name: "Ime in priimek",
      email: "E-pošta ob naročilu",
      address: "Naslov potrošnika",
      orderNumber: "Številka naročila",
      orderNumberHint: "Na primer NS-2026-00001. E-pošta se mora ujemati z e-pošto ob naročilu.",
      receivedAt: "Datum prevzema blaga",
      items: "Blago, od katerega odstopate",
      itemsHint: "Naštejte izdelke in količine. Odprte ali odpečatene kozmetične izdelke iz higienskih razlogov ni mogoče vrniti.",
      note: "Opomba (neobvezno)",
    },
    privacy: "Seznanjen/-a sem z obdelavo osebnih podatkov za obravnavo odstopa od pogodbe.",
    privacyLink: "Preberite politiko zasebnosti",
    submit: "Pošlji odstop od pogodbe",
    submitting: "Pošiljamo …",
    success: {
      title: "Odstop od pogodbe smo prejeli",
      body: "Shranite oznako zahtevka. Navodila za vračilo blaga in potrditev prejmete po e-pošti.",
      reference: "Oznaka zahtevka",
      statutory:
        "Kupnino vključno s standardnimi stroški dostave vrnemo najkasneje v 14 dneh od prejema vrnjenega blaga ali dokazila o njegovi oddaji.",
    },
    errors: {
      invalid: "Preverite vnesene podatke: vsa polja razen opombe so obvezna, datum prevzema ne sme biti v prihodnosti.",
      challenge: "Preverjanje ni uspelo. Potrdite, da niste robot, in poskusite znova.",
      orderNotFound: "Naročila s to številko in e-pošto ni mogoče najti. Uporabite e-pošto, s katero ste oddali naročilo.",
      failed: "Obrazca ni bilo mogoče poslati. Poskusite znova ali nam pišite po e-pošti.",
      conflict: "Obrazec s to oznako je bil že oddan z drugačnimi podatki. Osvežite stran za nov obrazec.",
    },
  },
  withdrawalPdf: {
    filename: "obrazec-odstop-od-pogodbe-nasmeh.pdf",
    title: "Obrazec za odstop od pogodbe",
    subtitle: "Izpolnite in vrnite ta obrazec le, če želite odstopiti od pogodbe.",
    to: "Za",
    toPlaceholder: "Nasmeh.si (naslov in e-pošta sta objavljena v nogi spletne strani)",
    lines: [
      "Obveščam/-o vas, da odstopam/-o od pogodbe za nakup naslednjega blaga: __________________________________",
      "Naročeno dne: __________________   Prejeto dne: __________________",
      "Številka naročila: __________________",
      "Ime in priimek potrošnika: ________________________________________",
      "Naslov potrošnika: ________________________________________",
      "Podpis potrošnika (samo če se obrazec pošlje na papirju): __________________",
      "Datum: __________________",
    ],
    hygieneNote:
      "Iz higienskih razlogov (člen 16(e) Direktive o pravicah potrošnikov) odstop ni mogoč za odpečatene ali odprte kozmetične izdelke.",
    footer: "Vzorčni obrazec po Prilogi I(B) Direktive 2011/83/EU. Nasmeh.si",
  },
  guarantee: {
    pdpLink: "30-dnevno jamstvo vračila denarja",
    readMore: "Preberite pogoje jamstva",
  },
  complaints: {
    ctaTitle: "Prijavite reklamacijo",
    ctaIntro:
      "Izberite, kaj se je zgodilo. Obrazec vas vodi skozi potrebne podatke; pri poškodovanih ali napačnih izdelkih priložite fotografije.",
    damaged: "Poškodovan izdelek ali pošiljka",
    wrong: "Napačen ali manjkajoč izdelek",
    withdrawal: "Odstop od pogodbe (14 dni)",
    adverse: "Prijava neželenega učinka",
    guarantee: "Pogoji 30-dnevnega jamstva",
  },
} as const;

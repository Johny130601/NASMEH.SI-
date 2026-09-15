import { legal } from "./legal";

/**
 * Refund timing per Directive 2011/83/EU Art. 13(1),(3) and the Annex I(A) model: counted from the
 * withdrawal notice, withheld at most until the goods or proof of sending arrive. Shared by the
 * success screen, the receipt mail (support-email.ts) and the order confirmation, so it is stated
 * as the rule, not as a promise about a particular submission: it covers only goods withdrawn from
 * in time, a partial withdrawal refunds proportionally and the Art. 16(e) exception still applies.
 */
const WITHDRAWAL_REFUND =
  `Če od pogodbe pravočasno odstopite, vam prejeta plačila za blago, od katerega ste odstopili, vključno s stroški standardne dostave, vrnemo na prvotno plačilno sredstvo brez nepotrebnega odlašanja, najpozneje pa v 14 dneh od prejema vašega obvestila o odstopu. Vračilo lahko zadržimo, dokler ne prejmemo blaga nazaj ali dokler ne predložite dokazila, da ste ga poslali nazaj, kar nastopi prej. Če odstopite le od dela naročila, vrnemo sorazmerni del plačil. Odstop ni mogoč za ${legal.sealedGoodsException}.`;

/** Returns, withdrawal and complaints surfaces (§12.4). */
export const returns = {
  withdrawal: {
    formTitle: "Spletni obrazec za odstop od pogodbe",
    formIntro:
      "Rok za odstop je 14 dni od prevzema blaga; od pogodbe lahko odstopite tudi, preden blago prejmete. Po oddaji obrazca prejmete potrdilo z oznako zahtevka.",
    pdfCta: "Prenesi vzorčni obrazec (PDF)",
    pdfNote: "Vzorčni obrazec lahko natisnete, izpolnite in pošljete po pošti ali e-pošti.",
    fields: {
      name: "Ime in priimek",
      email: "E-pošta ob naročilu",
      address: "Naslov potrošnika",
      orderNumber: "Številka naročila",
      orderNumberHint: "Na primer NS-2026-00001. Če se e-pošta ujema z e-pošto ob naročilu, odstop samodejno povežemo z naročilom.",
      deliveryStatus: "Ste blago že prejeli?",
      delivery: {
        received: "Da, blago sem prejel/-a",
        notReceived: "Ne, blaga še nisem prejel/-a",
      },
      receivedAt: "Datum prevzema blaga",
      items: "Blago, od katerega odstopate",
      itemsHint: `Naštejte izdelke in količine. Odstop ni mogoč za ${legal.sealedGoodsException}.`,
      note: "Opomba (neobvezno)",
    },
    /** Changing this wording changes the ticket's recorded privacy version (PRIVACY_NOTICE_VERSIONS, lib/support/validation.ts). */
    privacy: "Seznanjen/-a sem z obdelavo osebnih podatkov za obravnavo odstopa od pogodbe.",
    privacyLink: "Preberite politiko zasebnosti",
    submit: "Pošlji odstop od pogodbe",
    submitting: "Pošiljamo …",
    success: {
      title: "Odstop od pogodbe smo prejeli",
      body: "Shranite oznako zahtevka. Potrdilo o prejemu z isto oznako prejmete tudi po e-pošti.",
      reference: "Oznaka zahtevka",
      unlinked:
        "Navedene številke naročila in e-pošte nismo mogli samodejno povezati z naročilom. Odstop smo kljub temu zabeležili skupaj z navedeno številko naročila, naročilo pa bomo preverili ročno.",
      statutory: WITHDRAWAL_REFUND,
    },
    errors: {
      invalid: "Preverite vnesene podatke: vsa polja razen opombe so obvezna. Če ste blago že prejeli, vpišite datum prevzema, ki ne sme biti v prihodnosti.",
      challenge: "Preverjanje ni uspelo. Potrdite, da niste robot, in poskusite znova.",
      /** Not expected for this form: lib/support/tickets.ts records an unmatched notice without an order link. */
      orderNotFound: "Naročila s to številko in e-pošto ni bilo mogoče samodejno povezati. Odstop lahko pravočasno sporočite tudi po e-pošti ali pošti z vzorčnim obrazcem.",
      failed: "Obrazca ni bilo mogoče poslati. Poskusite znova ali nam pišite po e-pošti.",
      conflict: "Obrazec s to oznako je bil že oddan z drugačnimi podatki. Osvežite stran za nov obrazec.",
    },
  },
  withdrawalPdf: {
    filename: "obrazec-odstop-od-pogodbe-nasmeh.pdf",
    title: "Obrazec za odstop od pogodbe",
    subtitle: "Izpolnite in vrnite ta obrazec le, če želite odstopiti od pogodbe.",
    to: "Za",
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
      `Odstop ni mogoč za ${legal.sealedGoodsException} (člen 16(e) Direktive 2011/83/EU o pravicah potrošnikov).`,
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

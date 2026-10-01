import { returns } from "./returns";

/** Phase 6 steps 1 and 4: transactional support delivery, never marketing. */
export const supportEmail = {
  staff: {
    subjectPrefix: "Novo sporočilo za podporo",
    /** Triage marker in front of the subject of withdrawal tickets (phase-6 plan, step 4). */
    withdrawalSubjectTag: "[ODSTOP]",
    heading: "Prejeli ste sporočilo za podporo",
    reference: "Oznaka zahtevka",
    topic: "Tema",
    reason: "Podrobnejši razlog",
    name: "Ime prijavitelja",
    email: "E-pošta iz obrazca (lastništvo naslova ni potrjeno)",
    order: "Številka naročila",
    orderProof: "Preverjanje konteksta naročila",
    proofAccount: "Prijavljeni imetnik računa",
    proofEmailNumber: "Ujemanje e-pošte in številke naročila; lastništvo e-pošte ni potrjeno",
    proofUnknown: "Kontekst naročila ni preverjen",
    details: "Strukturirani podatki obrazca",
    yes: "Da",
    no: "Ne",
    message: "Sporočilo",
    photos: "Priložene fotografije",
    photo: "Fotografija",
    photoAccess: "Fotografije so zasebne; za ogled se prijavite z ustreznim dostopom.",
    footer: "Ta zahtevek sam po sebi ne spreminja in ne prekliče naročila.",
    /** A timely withdrawal ends the contract on notice (Directive 2011/83/EU Arts. 11-13); the system only records it. */
    footerWithdrawal:
      "Pravočasno poslan odstop od pogodbe učinkuje z obvestilom potrošnika, zato ga je treba obdelati, čeprav sistem naročila samodejno ne spremeni. Kupnino je treba vrniti brez nepotrebnega odlašanja, najpozneje v 14 dneh od prejema tega obvestila; vračilo se lahko zadrži le do prejema blaga ali dokazila o njegovi oddaji, kar nastopi prej.",
  },
  /** Label order is the rendering order; keys mirror the `details` payloads. */
  details: {
    withdrawal: {
      statutoryBasis: "Pravna podlaga",
      viaContactForm: "Poslano prek splošnega kontaktnega obrazca (brez podatkov vzorčnega obrazca; blago in naslov preverite v sporočilu)",
      claimedOrderNumber: "Številka naročila, ki jo je navedel potrošnik (ni samodejno povezana z naročilom)",
      goodsReceived: "Potrošnik je blago že prejel",
      receivedAt: "Blago prejeto dne",
      items: "Blago, od katerega potrošnik odstopa",
      address: "Naslov potrošnika",
      note: "Opomba potrošnika",
    },
    adverse: {
      reporterType: "Prijavitelj",
      /** A stated number that does not match the reporter e-mail is kept as a claim (QA M15): staff verify it by hand. */
      claimedOrderNumber: "Številka naročila, ki jo je navedel prijavitelj (ni samodejno povezana z naročilom)",
      phone: "Telefon prijavitelja",
      product: "Izdelek",
      batchNumber: "Številka serije (natisnjena na embalaži)",
      batchUnknown: "Prijavitelj številke serije ne pozna (npr. embalaže nima več)",
      purchasePlace: "Kraj nakupa",
      purchaseDate: "Datum nakupa",
      onsetDate: "Datum pojava učinka",
      ongoing: "Učinek še traja",
      medicalTreatment: "Poiskana zdravniška pomoč",
      medicalDetails: "Podrobnosti zdravniške pomoči",
      contactPermission: "Dovoljenje za dodatna vprašanja",
    },
  },
  reporterTypes: {
    USER: "Uporabnik izdelka",
    CARER: "Skrbnik ali sorodnik uporabnika",
    PROFESSIONAL: "Zdravstveni delavec",
  },
  customer: {
    subjectPrefix: "Prejeli smo vaše sporočilo",
    heading: "Vaše sporočilo smo prejeli",
    body: "Sporočilo je zabeleženo in ga bo pregledala naša ekipa.",
    reference: "Oznaka zahtevka",
    notes: {
      // An acknowledgement of receipt (CRD Art. 11(3)), not a decision on the notice: the refund sentence is the conditional statutory rule.
      withdrawal: `Prejeli smo vaše obvestilo o odstopu od pogodbe. To sporočilo potrjuje njegov prejem. ${returns.withdrawal.success.statutory}`,
      adverse:
        "Prijavo neželenega učinka obravnava ekipa za varnost izdelkov. Ta obrazec ni nujna medicinska pomoč; ob resnih težavah se obrnite na zdravnika.",
    },
    ignore: "Če nam niste pisali, lahko to potrdilo prezrete.",
    footer: "Nasmeh.si — potrdilo o prejemu sporočila.",
  },
} as const;

/** Phase 6 steps 1 and 4: transactional support delivery, never marketing. */
export const supportEmail = {
  staff: {
    subjectPrefix: "Novo sporočilo za podporo",
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
  },
  /** Label order is the rendering order; keys mirror the `details` payloads. */
  details: {
    withdrawal: {
      statutoryBasis: "Pravna podlaga",
      receivedAt: "Blago prejeto dne",
      items: "Blago, od katerega potrošnik odstopa",
      address: "Naslov potrošnika",
      note: "Opomba potrošnika",
    },
    adverse: {
      reporterType: "Prijavitelj",
      phone: "Telefon prijavitelja",
      product: "Izdelek",
      batchNumber: "Številka serije (natisnjena na embalaži)",
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
      withdrawal:
        "Odstop od pogodbe smo zabeležili. Kupnino vključno s standardnimi stroški dostave vrnemo najkasneje v 14 dneh od prejema vrnjenega blaga ali dokazila o njegovi oddaji, na prvotno plačilno sredstvo.",
      adverse:
        "Prijavo neželenega učinka obravnava ekipa za varnost izdelkov. Ta obrazec ni nujna medicinska pomoč; ob resnih težavah se obrnite na zdravnika.",
    },
    ignore: "Če nam niste pisali, lahko to potrdilo prezrete.",
    footer: "Nasmeh.si — potrdilo o prejemu sporočila.",
  },
} as const;

import { legal } from "./legal";

/** Checkout + orders/confirmation/lookup copy. */
export const checkout = {
  title: "Blagajna",
  steps: {
    contact: "Kontakt",
    shipping: "Dostava",
    payment: "Plačilo",
    review: "Pregled",
  },
  contact: {
    emailLabel: "E-pošta",
    accountHint: "imate račun? prijavite se",
    /** Point-of-collection notice (GDPR Art. 13): the address is stored when the shopper continues to delivery. */
    emailNotice: "E-poštni naslov uporabimo za izvedbo naročila in za nadaljevanje nedokončanega nakupa.",
    privacyLead: "Več v",
    privacyLink: "politiki zasebnosti",
    marketingOptIn: "Želim prejemati e-novice in ponudbe (neobvezno).",
    continue: "Naprej na dostavo",
  },
  shipping: {
    phoneLabel: "Telefon (za kurirja)",
    nameLabel: "Ime in priimek",
    streetLabel: "Ulica",
    streetNumberLabel: "Hišna številka",
    cityLabel: "Kraj",
    postalLabel: "Poštna številka",
    countryLabel: "Država",
    methodLabel: "Način dostave",
    free: "Brezplačna",
    back: "Nazaj",
    continue: "Naprej na plačilo",
    /** Signed-in shoppers pick from their address book; the fields stay editable (QA M12). */
    savedAddresses: "Shranjeni naslovi",
    savedAddressNew: "Vnesite nov naslov",
    savedAddressOption: (label: string, line: string) => `${label} — ${line}`,
  },
  /** Per-field messages; the client mirror and the server's `invalid_form` answer both land here (QA M11). */
  fields: {
    required: "To polje je obvezno.",
    invalid: "Preverite vnos.",
    tooLong: "Vnos je predolg.",
    email: "Vnesite veljaven e-poštni naslov (npr. ime@primer.si).",
    phone: "Vnesite veljavno telefonsko številko — samo številke, presledki in znak +.",
    postalCode: "Preverite obliko poštne številke za izbrano državo.",
    fullName: "Vnesite ime in priimek.",
  },
  payment: {
    providerLabel: "Način plačila",
    stripe: "Kartica / Apple Pay / Google Pay",
    paypal: "PayPal",
    test: "Testno plačilo (e2e)",
    continue: "Na pregled",
  },
  review: {
    title: "Preglejte in potrdite",
    contactLabel: "Kontakt",
    shippingLabel: "Dostava",
    paymentLabel: "Plačilo",
    recapTitle: "Vaše naročilo",
    /**
     * Shown directly above the order button. Terms acceptance and the withdrawal
     * notice are separate sentences: the statutory right is information, not a
     * term the shopper agrees to. The exception is the shared Art. 16(e) phrase
     * (legal.sealedGoodsException; D4 review pending). Order.legalAcceptance.noticeVersion
     * fingerprints this text, so a wording change is visible per order.
     */
    legal: {
      termsLead: "Z oddajo naročila se strinjate s",
      termsLink: "pogoji poslovanja",
      withdrawalLead: "Kot potrošnik imate",
      withdrawalLink: "pravico do odstopa od pogodbe",
      withdrawalTail: `v 14 dneh od prevzema blaga; odstop ni mogoč za ${legal.sealedGoodsException}.`,
    },
    placeOrder: "Naročilo z obveznostjo plačila",
  },
  pay: {
    title: "Plačilo naročila",
    testSuccess: "Testno plačilo — uspešno",
    testScaFail: "Simuliraj SCA napako",
    testFailure: "Simuliraj neuspeh",
    stripeNotConfigured: "Stripe ni konfiguriran (manjkajo ključi D5).",
    paypalApprove: "Nadaljuj na PayPal",
    failed: "Plačilo ni uspelo. Poskusite znova.",
    processing: "Obdelava …",
    confirm: "Plačaj naročilo",
    retry: "Poskusi znova",
    unavailable: "Plačila trenutno ni mogoče pripraviti. Naročilo je shranjeno; poskusite znova.",
  },
  errors: {
    invalidForm: "Preverite označena polja.",
    emptyCart: "Vaša košarica je prazna.",
    botCheck: "Preverjanje ni uspelo. Poskusite znova.",
    orderFailed: "Naročila ni bilo mogoče ustvariti. Poskusite znova.",
    stock: "Izdelek ni več na zalogi",
    quoteChanged: "Znesek naročila se je spremenil. Preverite novi povzetek in ponovno potrdite.",
    shippingUnavailable: "Za izbrano državo dostava še ni na voljo.",
    quoteEmptyCart: "Košarica je prazna — dodajte izdelke in se vrnite na blagajno.",
    quoteSoldOut: "Nekaterih izdelkov v košarici ni več na zalogi — uredite košarico in se vrnite na blagajno.",
    quoteFailed: "Zneska trenutno ni mogoče izračunati. Preverite povezavo in poskusite znova.",
    noProvider: "Plačila trenutno niso na voljo. Poskusite pozneje.",
  },
  /** A line sold out while it sat in the cart: the wizard stops at the start, names it and links back (QA 2026-09-30). */
  soldOut: {
    title: "Nekaterih izdelkov ni več na zalogi",
    body: "Odstranite jih iz košarice, nato nadaljujte z nakupom.",
    cta: "Uredi košarico",
  },
  empty: {
    title: "Blagajna",
    body: "Košarica je prazna — najprej dodajte izdelke.",
    cta: "Nazaj v trgovino",
  },
  summary: {
    title: "Povzetek naročila",
    subtotal: "Vmesna vsota",
    shipping: "Dostava",
    shippingNote: "izberite na koraku dostave",
    total: "Skupaj",
    vat: "Vključen DDV",
    updating: "Posodabljamo znesek …",
    klarnaRecap: "ali 3 obroki po",
    klarnaSuffix: "s Klarno",
  },
} as const;

export const orders = {
  confirmation: {
    paidTitle: "Naročilo je potrjeno 🎉",
    paidBody: "Hvala za nakup! Potrditveno sporočilo z računom je že na poti v vaš nabiralnik.",
    /** A payment was just submitted and its confirmation is pending (lib/orders/confirmation-view "awaiting"). */
    pendingTitle: "Čakamo na potrditev plačila",
    pendingBody: "Naročilo je ustvarjeno. Stran se osveži, ko plačilo potrdimo.",
    /** An unpaid order visited to pay it ("Dokončaj plačilo", a failed attempt): the payment leads (QA 2026-09-30). */
    unpaidTitle: "Dokončajte plačilo",
    unpaidBody: "Naročilo je ustvarjeno, plačilo pa še ni opravljeno. Dokončate ga spodaj.",
    /** Tab title when the order cannot be shown (no access, unknown number). */
    metaTitle: "Naročilo",
    cancelledTitle: "Naročilo je preklicano",
    cancelledBody: "Naročilo je preklicano. Za dodatne informacije se obrnite na podporo.",
    refundRequiredBody: "Plačilo je bilo prejeto, naročila pa zaradi težave z zalogo ne moremo odpremiti. Vračilo plačila je potrebno; za ureditev se obrnite na podporo.",
    refundedTitle: "Plačilo je vrnjeno",
    refundedBody: "Vračilo plačila za to naročilo je potrjeno.",
    refreshStatus: "Osveži stanje",
    resumePayment: "Nadaljuj plačilo",
    paymentWaiting: "Čakamo na potrditev ponudnika plačil. Stanje se osveži samodejno.",
    checkPaymentStatus: "Preveri stanje plačila",
    paymentCancelled: "Ta poskus plačila je preklican. Za nov poskus nadaljujte na blagajno.",
    newCheckout: "Nazaj na blagajno",
    resumeFailed: "Plačila trenutno ni mogoče nadaljevati. Poskusite znova.",
    orderNumber: "Številka naročila",
    summaryTitle: "Povzetek",
    totalLabel: "Skupaj",
    discountLabel: "Popust",
    /** The chosen method's estimate (shipping.methods); no line when the method is no longer configured. */
    deliveryEstimate: (estimate: string) => `Predviden rok dostave: ${estimate}.`,
    trackingNote: "Ob odpošiljanju boste prejeli e-sporočilo s številko sledenja — pošiljko lahko spremljate na strani Sledi naročilu.",
    createAccountTitle: "Ustvarite račun za naslednjič",
    createAccountBody: "Shranite podatke in spremljajte naročila. Izberite geslo, nato potrdite svoj e-poštni naslov.",
    passwordLabel: "Geslo (vsaj 8 znakov)",
    createAccountCta: "Ustvari račun",
    accountCreated: "Poslali smo vam povezavo za potrditev računa. Pred prijavo potrdite svoj e-poštni naslov.",
    accountErrors: {
      weak_password: "Geslo mora vsebovati od 8 do 72 znakov.",
      order_state: "Račun lahko ustvarite po potrjenem plačilu.",
      order_access: "Dostopa do tega naročila ni mogoče potrditi.",
      email_taken: "Za ta e-poštni naslov račun že obstaja. Prijavite se ali uporabite obnovitev gesla.",
      account_failed: "Potrditvenega sporočila ni bilo mogoče poslati. Poskusite znova.",
    },
    backHome: "Nazaj na domačo stran",
  },
  lookup: {
    title: "Sledi naročilu",
    emailLabel: "E-pošta",
    numberLabel: "Številka naročila (NS-…)",
    submit: "Poišči naročilo",
    notFound: "Naročila s temi podatki ni mogoče najti.",
    statusLabel: "Status",
    methodLabel: "Način dostave",
    trackingLabel: "Sledenje",
    itemsLabel: "Izdelkov",
    totalLabel: "Znesek",
    dateLabel: "Datum",
    // The customer-facing status words, shared with /racun and the processing mail (QA M10).
    statuses: {
      PENDING: "Čaka na plačilo",
      PAID: "Plačano",
      PROCESSING: "V obdelavi",
      SHIPPED: "Odposlano",
      DELIVERED: "Dostavljeno",
      CANCELLED: "Preklicano",
      REFUNDED: "Vrnjeno",
    } as const,
  },
} as const;

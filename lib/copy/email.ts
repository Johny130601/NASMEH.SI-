import { legal } from "./legal";

/** Transactional email copy (Phase 0 proof + Phase 1 verification). */
export const email = {
  proof: {
    subject: "Nasmeh.si — pošta deluje",
    heading: "Poštna storitev deluje",
    body: "To je preizkusno sporočilo transakcijske pošte Nasmeh.si (SMTP/Nodemailer).",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
  verifySubscription: {
    subject: "Potrdite prijavo na e-novice — Nasmeh.si",
    heading: "Potrdite svojo prijavo",
    body: "Hvala za prijavo na e-novice Nasmeh.si! Za potrditev kliknite spodnji gumb.",
    cta: "Potrdi prijavo",
    ignore: "Če se niste prijavili, to sporočilo preprosto prezrite.",
    // "<unsubscribe> <link>unsubscribeCta</link>" — the signed withdrawal route.
    unsubscribe: "Od e-novic se lahko kadar koli odjavite:",
    unsubscribeCta: "Odjava od e-novic",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
  backInStock: {
    subject: "Potrdite obvestilo o zalogi — Nasmeh.si",
    heading: "Potrdite obvestilo o zalogi",
    body: "Hvala! Da aktivirate obvestilo o zalogi za izdelek",
    bodySuffix: ", kliknite spodnji gumb.",
    cta: "Aktiviraj obvestilo",
    ignore: "Če obvestila niste zahtevali, to sporočilo preprosto prezrite.",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
  backInStockAlert: {
    subjectPrefix: "Spet na zalogi",
    heading: "Izdelek je spet na zalogi!",
    body: "Izdelek, za katerega ste želeli obvestilo, je spet na voljo:",
    priceLabel: "Cena",
    cta: "Poglej izdelek",
    unsubscribe: "To je edino obvestilo za ta izdelek. Ne želite več obvestil o zalogi za ta izdelek?",
    unsubscribeCta: "Odjava",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
  orderConfirmation: {
    subjectPrefix: "Potrditev naročila",
    heading: "Hvala za vaše naročilo!",
    body: "Vaše naročilo je bilo uspešno prejeto in plačano. Račun je priložen v prilogi (PDF).",
    /** The estimate comes from the chosen shipping method (shipping.methods), never a fixed day count. */
    deliveryEstimate: (estimate: string) => `Predviden rok dostave: ${estimate}. Ob odpošiljanju prejmete sporočilo s številko sledenja.`,
    deliveryNote: "Ob odpošiljanju prejmete sporočilo s številko sledenja.",
    shippingLabel: "Dostava",
    /** The discount row (code and amount) makes the lines add up to the total. */
    discountLabel: "Popust",
    discountWithCode: (code: string) => `Popust (koda ${code})`,
    totalLabel: "Skupaj",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
    /**
     * Contract confirmation on a durable medium (CRD Art. 8(7)): appended after
     * the body whether the code template or an operator override is sent. The
     * withdrawal wording follows the Odstop od pogodbe page and the checkout
     * notice; final wording is pending the D4 legal review.
     */
    legal: {
      deliveryTitle: "Dostava",
      sellerTitle: "Prodajalec",
      registration: "Matična številka",
      vatId: "ID za DDV",
      email: "E-pošta",
      phone: "Telefon",
      withdrawalTitle: "Pravica do odstopa od pogodbe",
      withdrawal: `Kot potrošnik lahko od pogodbe odstopite v 14 dneh od prevzema blaga, ne da bi navedli razlog. Odstop ni mogoč za ${legal.sealedGoodsException}.`,
      withdrawalHow: (email: string) =>
        `Odstop nam sporočite s spletnim obrazcem na strani Odstop od pogodbe, po e-pošti na ${email} ali pisno na naslov prodajalca. Uporabite lahko priloženi vzorčni obrazec.`,
      returnCosts: "Stroške povratne pošiljke krije kupec, razen če je vračilo posledica naše napake.",
      complaints: "Za stvarne napake blaga odgovarjamo v skladu z zakonom. Reklamacijo prijavite po navodilih na strani",
      guarantee: "Prostovoljno 30-dnevno jamstvo vračila denarja ne vpliva na zakonsko pravico do odstopa. Pogoji jamstva so objavljeni na strani",
      linksTitle: "Pravna besedila",
      links: {
        terms: "Pogoji poslovanja",
        withdrawal: "Odstop od pogodbe",
        complaints: "Reklamacije",
        guarantee: "Jamstvo vračila denarja",
      },
      accepted: (label: string, hash: string) => `${label}: oznaka različice, potrjene ob oddaji naročila (SHA-256) ${hash}`,
      attachments:
        "V prilogi so račun, vzorčni obrazec za odstop od pogodbe ter pogoji poslovanja in besedilo o odstopu od pogodbe (PDF). Shranite jih za svojo evidenco.",
    },
  },
  orderShipped: {
    subjectPrefix: "Naročilo je odposlano",
    heading: "Vaše naročilo je na poti!",
    body: "Pošiljko smo predali prevozniku. Številka naročila:",
    carrierLabel: "Prevoznik",
    trackingLabel: "Številka sledenja",
    carrierLink: "Spremljaj pošiljko pri prevozniku",
    noLink: "Povezava za sledenje pri tem prevozniku ni na voljo; številko vnesite na strani Sledi naročilu.",
    estimateLabel: "Predviden prihod",
    cta: "Sledi naročilu",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
  orderStatus: {
    processing: {
      subjectPrefix: "Naročilo je v obdelavi",
      heading: "Vaše naročilo pripravljamo",
      body: "Začeli smo s pripravo vašega naročila. Ob odpremi prejmete sporočilo s številko sledenja. Številka naročila:",
    },
    delivered: {
      subjectPrefix: "Naročilo je dostavljeno",
      heading: "Vaše naročilo je dostavljeno",
      body: "Pošiljka je označena kot dostavljena. Upamo, da boste z izdelki zadovoljni. Številka naročila:",
    },
    cancelled: {
      subjectPrefix: "Naročilo je preklicano",
      heading: "Vaše naročilo je preklicano",
      body: "Naročilo smo preklicali. Če je bilo plačano, znesek vrnemo na isto plačilno sredstvo v nekaj delovnih dneh. Številka naročila:",
    },
    refunded: {
      subjectPrefix: "Vračilo denarja",
      heading: "Vračilo denarja je izvedeno",
      body: "Vračilo smo predali ponudniku plačil; znesek bo vrnjen na isto plačilno sredstvo v nekaj delovnih dneh. Številka naročila:",
    },
    refundedAmountLabel: "Vrnjeni znesek",
    cta: "Poglej naročilo",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
  verifyAccount: {
    subject: "Potrdite svoj račun — Nasmeh.si",
    heading: "Dobrodošli na Nasmeh.si!",
    body: "Za aktivacijo računa kliknite spodnji gumb (povezava velja 24 ur).",
    cta: "Aktiviraj račun",
    ignore: "Če računa niste ustvarili, to sporočilo preprosto prezrite.",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
  resetPassword: {
    subject: "Ponastavitev gesla — Nasmeh.si",
    heading: "Ponastavitev gesla",
    body: "Prejeli smo zahtevo za ponastavitev gesla. Povezava velja 1 uro.",
    cta: "Nastavi novo geslo",
    ignore: "Če ponastavitve niste zahtevali, to sporočilo preprosto prezrite — geslo ostane nespremenjeno.",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
  reviewRequest: {
    subjectPrefix: "Kako vam je ustrezal nakup",
    heading: "Kako ste zadovoljni z nakupom?",
    body: "Nekaj dni je od dostave — vaše mnenje pomaga drugim kupcem (in nam). Ocenite izdelke s klikom na zvezdice:",
    photosNote: "Za najlepše mnenje priložite tudi fotografijo ali dve.",
    footer: "Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.",
  },
} as const;

/** /cart page copy. */
export const cart = {
  title: "Vaša košarica",
  progress: {
    empty: "Odklenite brezplačno dostavo pri naročilih nad 45 €",
    inProgress: "📦 Samo še €X vas loči do brezplačne dostave",
    reached: "🎉 Čestitamo! Odklenili ste brezplačno dostavo!",
  },
  klarna: "ali 3 enostavna obroka po",
  klarnaSuffix: "s Klarna",
  line: {
    decrease: "Zmanjšaj količino",
    increase: "Povečaj količino",
    remove: "Odstrani izdelek",
    maxQuantity: "Največ 5 kosov na naročilo",
    bundleContents: "Vsebina paketa",
    omnibusPrefix: "Najnižja cena v zadnjih 30 dneh",
  },
  crossSell: "Ljudje tudi kupujejo",
  checkout: {
    cta: "Na blagajno",
    note: "Varen nakup — cene vključujejo DDV.",
  },
  summary: {
    subtotal: "Vmesna vsota",
    shipping: "Dostava",
    shippingFree: "Brezplačna",
    total: "Skupaj",
    vatLine: "vključen DDV",
  },
  empty: {
    title: "Vaša košarica je prazna",
    body: "Dodajte izdelke in vrnite se — košarica se shrani tudi brez računa.",
    cta: "Nakupuj vse izdelke",
  },
  koda: {
    activeLabel: "Aktivna koda",
    rejectedLabel: "Koda",
    remove: "Odstrani kodo",
    phaseNote: "Koda se aktivira s popustom v fazi 4.",
    invalid: "Koda ni veljavna.",
  },
} as const;

/** Shared Slovenian UI copy (AGENTS §8.5). English [P2] = added file, not refactor. */
export const common = {
  siteName: "Nasmeh.si",
  siteTagline: "Svetel nasmeh, naravno.",
  currencyNote: "Vse cene vključujejo DDV.",
  nav: {
    shop: "TRGOVINA",
    explore: "RAZIŠČI",
    bundles: "PAKETI & PRIHRANKI",
    login: "Prijava",
    account: "Moj račun",
    help: "Center za pomoč",
    cart: "Košarica",
  },
  actions: {
    close: "Zapri",
    previous: "Prejšnji",
    next: "Naslednji",
    submit: "Potrdi",
    loading: "Nalaganje …",
    /** Screen-reader hint on links that open in a new tab. */
    opensInNewTab: "(odpre se v novem zavihku)",
  },
  /** Lazy Turnstile on the capture forms (useLazyChallenge). */
  challenge: {
    waiting: "Preverjamo, da niste robot …",
    unavailable:
      "Preverjanja, da niste robot, ni bilo mogoče dokončati. Preverite povezavo ali izklopite blokiranje vsebin in poskusite znova.",
  },
  footer: {
    legal: "Pravno",
    copyright: "© Nasmeh.si — Vse pravice pridržane.",
  },
} as const;

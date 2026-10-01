import { orders } from "./checkout";

/** Public order tracking page copy (§12.3). */
export const tracking = {
  title: "Sledi naročilu",
  description: "Preverite stanje pošiljke s številko sledenja ali z e-pošto in številko naročila.",
  intro:
    "Vnesite številko sledenja iz e-sporočila o odpremi. Če je še nimate, poiščite naročilo z e-pošto in številko naročila.",
  byNumber: {
    title: "Po številki sledenja",
    numberLabel: "Številka sledenja",
    submit: "Preveri pošiljko",
  },
  byOrder: {
    title: "Po e-pošti in številki naročila",
    emailLabel: "E-pošta",
    numberLabel: "Številka naročila (NS-…)",
    submit: "Poišči naročilo",
  },
  result: {
    title: "Stanje pošiljke",
    orderTitle: "Vaše naročilo",
    numberLabel: "Številka naročila",
    statusLabel: "Status",
    carrierLabel: "Prevoznik",
    trackingLabel: "Številka sledenja",
    trackLink: "Spremljaj pošiljko pri prevozniku",
    noTracking: "Številka sledenja bo na voljo ob odpremi.",
    /** Dates carry their own label, so a row never repeats the status word (QA T4-F10). */
    shippedAtLabel: "Datum odpreme",
    estimateLabel: "Predviden prihod",
    deliveredAtLabel: "Datum dostave",
    methodLabel: "Način dostave",
    itemsLabel: "Izdelkov",
    totalLabel: "Znesek",
    dateLabel: "Datum naročila",
  },
  statuses: orders.lookup.statuses,
  errors: {
    notFound: "Pošiljke oziroma naročila s temi podatki ni mogoče najti.",
    challenge: "Preverjanje ni uspelo. Poskusite znova.",
    failed: "Preverjanje trenutno ni mogoče. Poskusite znova.",
  },
  pending: "Preverjamo …",
  /** Shown only without JavaScript: the form then keeps its values but cannot run the checked lookup.
   * The contact form needs JavaScript too, so the way forward is the seller's e-mail address (a mailto link). */
  noScript: "Za preverjanje pošiljke potrebujete JavaScript. Omogočite ga v brskalniku.",
  noScriptMail: "Lahko nam tudi pišete na",
} as const;

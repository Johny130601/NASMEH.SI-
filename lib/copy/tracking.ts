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
    statusLabel: "Status",
    carrierLabel: "Prevoznik",
    trackingLabel: "Številka sledenja",
    trackLink: "Spremljaj pošiljko pri prevozniku",
    noTracking: "Številka sledenja bo na voljo ob odpremi.",
    shippedAtLabel: "Odposlano",
    estimateLabel: "Predviden prihod",
    deliveredAtLabel: "Dostavljeno",
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
} as const;

/** Promotions/coupons copy. */
export const promo = {
  terms: "Popust ne velja za pakete, že znižane izdelke in dostavo; ne sešteva se z drugimi ponudbami.",
  applied: "Koda",
  discountLabel: "Popust",
  remove: "Odstrani kodo",
  field: {
    label: "Koda za popust",
    placeholder: "Vnesite kodo",
    apply: "Uporabi",
  },
  errors: {
    not_found: "Koda ne obstaja.",
    inactive: "Koda ni aktivna.",
    not_started: "Koda še ne velja.",
    expired: "Koda je potekla.",
    min_spend: "Koda velja šele nad minimalnim zneskom naročila.",
    usage_limit: "Koda je bila v celoti izrabljena.",
    customer_limit: "To kodo ste že izkoristili.",
    not_eligible: "Koda ne velja za vašo košarico.",
    already_applied: "Uporabite lahko samo eno kodo na naročilo.",
  },
  orderNote: {
    applied: "s kodo",
    rejected: "Koda ni bila upoštevana",
  },
  popup: {
    closeLabel: "Zapri obvestilo",
  },
  adminNotes: {
    // Shown in the Phase 7 admin coupon form (usage-at-creation design, see
    // docs/plans/phase-4.md) — no behavior change.
    usageAtCreation:
      "Omejene kode se porabijo ob ustvaritvi naročila, tudi če plačilo ni uspešno.",
  },
} as const;

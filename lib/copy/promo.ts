/** Promotions/coupons copy. */
export const promo = {
  terms: "Popust ne velja za pakete, že znižane izdelke in dostavo; ne sešteva se z drugimi ponudbami.",
  /** A free-shipping code is about the delivery itself, so the uniform sentence would contradict it (QA T6-10). */
  termsFreeShipping: "Koda velja za brezplačno dostavo tega naročila; ne sešteva se z drugimi ponudbami.",
  termsFor: (type: "PERCENT" | "FIXED" | "FIXED_PRODUCT" | "FREE_SHIPPING" | null | undefined): string =>
    type === "FREE_SHIPPING" ? promo.termsFreeShipping : promo.terms,
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
    /** The cart knows no e-mail yet: the code is judged again at checkout with the entered address (QA T6-10). */
    email_restricted: "Koda velja samo za določene e-poštne naslove — upoštevana bo na blagajni, če vnesete e-poštni naslov, za katerega velja.",
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

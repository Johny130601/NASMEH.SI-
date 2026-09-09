/** Newsletter double opt-in copy. */
export const newsletter = {
  success:
    "Skoraj gotovo! Poslali smo vam potrditveno sporočilo — preverite nabiralnik in potrdite prijavo.",
  invalidEmail: "Vnesite veljaven e-poštni naslov.",
  botCheckFailed: "Preverjanje ni uspelo. Poskusite znova.",
  genericError: "Prijava ni uspela. Poskusite znova kasneje.",
  confirm: {
    titleOk: "Prijava potrjena 🎉",
    bodyOk:
      "Hvala! Vaša prijava na e-novice je potrjena. Med prvimi boste izvedeli za novosti in testiranja izdelkov.",
    titleInvalid: "Povezava ni veljavna",
    bodyInvalid:
      "Potrditvena povezava je neveljavna ali je že potekla. Prijavite se znova v nogi strani.",
    cta: "Na domačo stran",
  },
} as const;

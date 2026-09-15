/** Newsletter double opt-in and withdrawal copy. */
export const newsletter = {
  success:
    "Skoraj gotovo! Poslali smo vam potrditveno sporočilo — preverite nabiralnik in potrdite prijavo.",
  invalidEmail: "Vnesite veljaven e-poštni naslov.",
  botCheckFailed: "Preverjanje ni uspelo. Poskusite znova.",
  genericError: "Prijava ni uspela. Poskusite znova kasneje.",
  confirm: {
    title: "Potrdite prijavo na e-novice",
    body: "Za potrditev prijave na e-novice Nasmeh.si kliknite spodnji gumb.",
    submit: "Potrdi prijavo",
    genericError: "Potrditev ni uspela. Poskusite znova.",
    titleOk: "Prijava potrjena 🎉",
    bodyOk:
      "Hvala! Vaša prijava na e-novice je potrjena. Med prvimi boste izvedeli za novosti in testiranja izdelkov.",
    unsubscribeLead: "Premislili ste si?",
    unsubscribeLink: "Odjava od e-novic",
    titleInvalid: "Povezava ni veljavna",
    bodyInvalid:
      "Potrditvena povezava je neveljavna ali je že potekla. Prijavite se znova v nogi strani.",
    cta: "Na domačo stran",
  },
  unsubscribe: {
    title: "Odjava od e-novic",
    body: "Potrdite, da e-novic Nasmeh.si ne želite več prejemati.",
    submit: "Odjavi me",
    genericError: "Odjava ni uspela. Poskusite znova.",
    titleOk: "Odjava je uspela",
    bodyOk: "E-novic Nasmeh.si ne boste več prejemali. Znova se lahko kadar koli prijavite v nogi strani.",
    titleInvalid: "Povezava ni veljavna",
    bodyInvalid: "Povezava za odjavo je neveljavna. Če se želite odjaviti, nam pišite prek strani Kontakt.",
    cta: "Na domačo stran",
  },
} as const;

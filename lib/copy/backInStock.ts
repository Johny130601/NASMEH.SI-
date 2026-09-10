/** Back-in-stock capture, re-subscribe and unsubscribe copy. */
export const backInStock = {
  button: "Obvestite me",
  modalTitle: "Obvestite me, ko bo spet na zalogi",
  body: "Pustite e-pošto in poslali vam bomo eno sporočilo, ko bo izdelek spet na zalogi. Brez vsiljivega marketinga.",
  emailLabel: "E-pošta",
  submit: "Obvestite me",
  note: "S prijavo soglašate samo z enkratnim transakcijskim obvestilom o zalogi tega izdelka — ne s trženjskimi sporočili.",
  success:
    "Skoraj gotovo! Poslali smo vam potrditveno sporočilo — s klikom na povezavo potrdite obvestilo.",
  alreadyActive:
    "Obvestilo za ta izdelek je že aktivno — sporočilo prejmete, ko bo izdelek spet na zalogi.",
  invalidEmail: "Vnesite veljaven e-poštni naslov.",
  botCheckFailed: "Preverjanje ni uspelo. Poskusite znova.",
  genericError: "Prijava ni uspela. Poskusite znova kasneje.",
  confirm: {
    titleOk: "Obvestilo je aktivno",
    bodyOk: "Hvala! Ko bo izdelek spet na zalogi, vas obvestimo po e-pošti.",
    titleInvalid: "Povezava ni veljavna",
    bodyInvalid: "Potrditvena povezava je neveljavna ali že potekla. Prijavite se znova na strani izdelka.",
    cta: "Na domačo stran",
  },
  unsubscribe: {
    titleOk: "Odjava je uspela",
    bodyOk: "Obvestil o zalogi za ta izdelek ne boste več prejemali.",
    titleInvalid: "Povezava ni veljavna",
    bodyInvalid: "Povezava za odjavo je neveljavna. Če želite odjavo, nam pišite prek strani Kontakt.",
    cta: "Na domačo stran",
  },
} as const;

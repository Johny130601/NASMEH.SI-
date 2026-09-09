import { formatEUR } from "@/lib/pricing";

export const invoice = {
  title: (number: string) => `RAČUN ${number}`,
  issuedAt: (date: Date) => `Datum izdaje: ${date.toLocaleDateString("sl-SI")}`,
  registration: (number: string) => `Matična številka: ${number}`,
  vatId: (number: string) => `ID za DDV: ${number}`,
  customer: "Kupec:",
  items: "Postavke:",
  subtotal: "Vmesna vsota",
  discount: "Popust",
  shipping: "Dostava",
  total: "SKUPAJ",
  vat: (ratePercent: number, taxCents: number) =>
    `vključen DDV ${ratePercent} %: ${formatEUR(taxCents)}`,
  footer: "Vse cene vključujejo DDV. Nasmeh.si - hvala za vaše naročilo!",
};

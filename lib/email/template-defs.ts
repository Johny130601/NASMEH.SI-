/**
 * Editable transactional mails (§14.10): each key lists its placeholders, a
 * sample for previews and test sends, and the default subject/body an
 * operator starts from. Text placeholders are HTML-escaped when rendered;
 * `html` placeholders carry blocks the code already rendered safely.
 * No server imports: the admin editor runs this in the browser too.
 */

import { supportEmail } from "@/lib/copy/support-email";

export const EMAIL_TEMPLATE_KEYS = [
  "orderConfirmation", "orderShipped", "orderProcessing", "orderDelivered", "orderCancelled", "orderRefunded",
  "reviewRequest", "backInStockAlert", "backInStockConfirm", "verifySubscription", "verifyAccount", "resetPassword", "supportReceipt",
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export interface EmailPlaceholder { name: string; description: string; html?: boolean }

export interface EmailTemplateDef {
  label: string;
  description: string;
  placeholders: EmailPlaceholder[];
  sample: Record<string, string>;
  defaultSubject: string;
  defaultBody: string;
}

const FOOTER = `<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">Nasmeh.si — transakcijska pošta, ne odgovarjajte nanjo.</p>`;
const H1 = `style="font-size:1.5rem;font-weight:300;"`;
const P = `style="font-size:1rem;line-height:1.5;"`;
const BUTTON = `style="display:inline-block;background-color:rgb(28,28,30);color:rgb(255,255,255);text-decoration:none;padding:0.9rem 2rem;border-radius:3rem;font-size:1rem;font-weight:500;"`;

const orderNumber: EmailPlaceholder = { name: "orderNumber", description: "Številka naročila" };
const accountUrl: EmailPlaceholder = { name: "accountUrl", description: "Povezava do naročila (račun ali sledenje)" };
const ORDER_SAMPLE = { orderNumber: "NS-2026-00042", accountUrl: "https://nasmeh.si/racun/narocilo/NS-2026-00042" };

function statusDef(label: string, description: string, subject: string, heading: string, body: string, extra: EmailPlaceholder[] = [], extraSample: Record<string, string> = {}, extraBody = ""): EmailTemplateDef {
  return {
    label, description,
    placeholders: [orderNumber, accountUrl, ...extra],
    sample: { ...ORDER_SAMPLE, ...extraSample },
    defaultSubject: `${subject} {{orderNumber}} — Nasmeh.si`,
    defaultBody: `<h1 ${H1}>${heading}</h1>
<p ${P}>${body}<br /><strong>{{orderNumber}}</strong></p>
${extraBody}<p style="margin:2rem 0;"><a href="{{accountUrl}}" ${BUTTON}>Poglej naročilo</a></p>
${FOOTER}`,
  };
}

export const EMAIL_TEMPLATE_DEFS: Record<EmailTemplateKey, EmailTemplateDef> = {
  orderConfirmation: {
    label: "Potrditev naročila",
    description: "Po uspešnem plačilu. Rok dostave (če ga predloga ne prikaže z {{deliveryNote}}), podatki o prodajalcu, povzetek pravice do odstopa, povezave na pravna besedila in priloge (račun, vzorčni obrazec za odstop, pogoji poslovanja in odstop v PDF) se dodajo samodejno pod predlogo; predloga jih ne more odstraniti ali skriti. Komentarji, slogi (<style>), skripte in skrivajoči slogi se ob shranjevanju odstranijo.",
    placeholders: [
      orderNumber,
      { name: "items", description: "Tabela postavk, popusta (koda in znesek), dostave, skupnega zneska in vključenega DDV (pripravljen HTML)", html: true },
      { name: "total", description: "Skupni znesek z DDV" },
      { name: "shippingMethod", description: "Način dostave" },
      { name: "estimate", description: "Predviden rok dostave izbranega načina (lahko prazno)" },
      { name: "deliveryNote", description: "Stavek o roku dostave in obvestilu ob odpošiljanju (brez roka, če ga način dostave nima); če ga predloga ne vsebuje, se doda v obvezni del pod predlogo" },
    ],
    sample: { orderNumber: "NS-2026-00042", total: "62,98 €", shippingMethod: "GLS — paketna dostava", estimate: "2–3 delovni dnevi", deliveryNote: "Predviden rok dostave: 2–3 delovni dnevi. Ob odpošiljanju prejmete sporočilo s številko sledenja.", items: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:1rem 0;border-top:1px solid rgb(229,229,234);"><tr><td style="padding:0.4rem 0;font-size:0.9rem;">2 × Belilni trakci za zobe (14 uporab)</td><td style="padding:0.4rem 0;font-size:0.9rem;text-align:right;">69,98 €</td></tr><tr><td style="padding:0.4rem 0;font-size:0.9rem;">Popust (koda TEST10)</td><td style="padding:0.4rem 0;font-size:0.9rem;text-align:right;">−7,00 €</td></tr><tr><td style="padding:0.4rem 0;font-size:0.9rem;border-top:1px solid rgb(229,229,234);">Dostava (GLS — paketna dostava)</td><td style="padding:0.4rem 0;font-size:0.9rem;border-top:1px solid rgb(229,229,234);text-align:right;">0,00 €</td></tr><tr><td style="padding:0.4rem 0;font-size:1rem;font-weight:500;">Skupaj</td><td style="padding:0.4rem 0;font-size:1rem;font-weight:500;text-align:right;">62,98 €</td></tr><tr><td colspan="2" style="padding:0 0 0.4rem;font-size:0.8rem;color:rgb(99,99,102);text-align:right;">vključen DDV 22 %: 11,36 €</td></tr></table>` },
    defaultSubject: "Potrditev naročila {{orderNumber}} — Nasmeh.si",
    defaultBody: `<h1 ${H1}>Hvala za vaše naročilo!</h1>
<p ${P}>Vaše naročilo je bilo uspešno prejeto in plačano. Račun je priložen v prilogi (PDF).<br /><strong>{{orderNumber}}</strong></p>
{{items}}
<p ${P}>{{deliveryNote}}</p>
${FOOTER}`,
  },
  orderShipped: {
    label: "Naročilo je odposlano",
    description: "Ob predaji pošiljke prevozniku; nosi isto povezavo za sledenje kot spletna stran.",
    placeholders: [
      orderNumber,
      { name: "carrier", description: "Prevoznik" },
      { name: "trackingNumber", description: "Številka sledenja" },
      { name: "trackingUrl", description: "Povezava pri prevozniku (prazna, če prevoznik nima predloge)" },
      { name: "estimate", description: "Predviden prihod (lahko prazno)" },
      { name: "trackingPageUrl", description: "Povezava na stran Sledi naročilu" },
    ],
    sample: { orderNumber: "NS-2026-00042", carrier: "GLS", trackingNumber: "GLS123456789", trackingUrl: "https://gls-group.eu/SI/sl/sledenje-paketom?match=GLS123456789", estimate: "2–3 delovni dnevi", trackingPageUrl: "https://nasmeh.si/sledi?sledenje=GLS123456789" },
    defaultSubject: "Naročilo je odposlano {{orderNumber}} — Nasmeh.si",
    defaultBody: `<h1 ${H1}>Vaše naročilo je na poti!</h1>
<p ${P}>Pošiljko smo predali prevozniku. Številka naročila:<br /><strong>{{orderNumber}}</strong></p>
<p ${P}>Prevoznik: <strong>{{carrier}}</strong><br />Številka sledenja: <strong>{{trackingNumber}}</strong></p>
<p ${P}><a href="{{trackingUrl}}" style="color:rgb(0,122,255);word-break:break-all;">Spremljaj pošiljko pri prevozniku</a></p>
<p ${P}>Predviden prihod: {{estimate}}</p>
<p style="margin:2rem 0;"><a href="{{trackingPageUrl}}" ${BUTTON}>Sledi naročilu</a></p>
${FOOTER}`,
  },
  orderProcessing: statusDef("Naročilo je v obdelavi", "Ko skrbnik označi naročilo kot v obdelavi.", "Naročilo je v obdelavi", "Vaše naročilo pripravljamo",
    "Začeli smo s pripravo vašega naročila. Ob odpremi prejmete sporočilo s številko sledenja. Številka naročila:"),
  orderDelivered: statusDef("Naročilo je dostavljeno", "Ko je pošiljka označena kot dostavljena.", "Naročilo je dostavljeno", "Vaše naročilo je dostavljeno",
    "Pošiljka je označena kot dostavljena. Upamo, da boste z izdelki zadovoljni. Številka naročila:"),
  orderCancelled: statusDef("Naročilo je preklicano", "Ob preklicu naročila (s celotnim vračilom, če je bilo plačano).", "Naročilo je preklicano", "Vaše naročilo je preklicano",
    "Naročilo smo preklicali. Če je bilo plačano, znesek vrnemo na isto plačilno sredstvo v nekaj delovnih dneh. Številka naročila:"),
  orderRefunded: statusDef("Vračilo denarja", "Ob izvedenem (delnem) vračilu.", "Vračilo denarja", "Vračilo denarja je izvedeno",
    "Vračilo smo predali ponudniku plačil; znesek bo vrnjen na isto plačilno sredstvo v nekaj delovnih dneh. Številka naročila:",
    [{ name: "amount", description: "Vrnjeni znesek" }], { amount: "15,00 €" }, `<p ${P}>Vrnjeni znesek: <strong>{{amount}}</strong></p>\n`),
  reviewRequest: {
    label: "Povabilo k oceni",
    description: "Nekaj dni po dostavi; zvezdice so povezave z enim klikom.",
    placeholders: [orderNumber, { name: "items", description: "Tabela izdelkov z zvezdicami (pripravljen HTML)", html: true }],
    sample: { orderNumber: "NS-2026-00042", items: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:1rem 0;border-top:1px solid rgb(229,229,234);"><tr><td style="padding:0.6rem 0;font-size:0.95rem;">Belilni trakci za zobe (14 uporab)</td><td style="padding:0.6rem 0;text-align:right;white-space:nowrap;"><span style="font-size:1.4rem;color:rgb(0,168,143);">★ ★ ★ ★ ★</span></td></tr></table>` },
    defaultSubject: "Kako vam je ustrezal nakup {{orderNumber}} — Nasmeh.si",
    defaultBody: `<h1 ${H1}>Kako ste zadovoljni z nakupom?</h1>
<p ${P}>Nekaj dni je od dostave — vaše mnenje pomaga drugim kupcem (in nam). Ocenite izdelke s klikom na zvezdice:</p>
{{items}}
<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">Za najlepše mnenje priložite tudi fotografijo ali dve.</p>
${FOOTER}`,
  },
  backInStockAlert: {
    label: "Spet na zalogi",
    description: "Edino obvestilo potrjenemu naročniku, ko je izdelek spet na voljo.",
    placeholders: [
      { name: "productTitle", description: "Naziv izdelka" },
      { name: "productUrl", description: "Povezava na stran izdelka" },
      { name: "price", description: "Trenutna cena" },
      { name: "unsubscribeUrl", description: "Povezava za odjavo z enim klikom" },
    ],
    sample: { productTitle: "Belilni trakci za zobe (14 uporab)", productUrl: "https://nasmeh.si/izdelek/belilni-trakci-za-zobe", price: "34,99 €", unsubscribeUrl: "https://nasmeh.si/odjava-zaloga/primer" },
    defaultSubject: "Spet na zalogi: {{productTitle}} — Nasmeh.si",
    defaultBody: `<h1 ${H1}>Izdelek je spet na zalogi!</h1>
<p ${P}>Izdelek, za katerega ste želeli obvestilo, je spet na voljo: <strong>{{productTitle}}</strong></p>
<p ${P}>Cena: {{price}}</p>
<p style="margin:2rem 0;"><a href="{{productUrl}}" ${BUTTON}>Poglej izdelek</a></p>
<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">To je edino obvestilo za ta izdelek. Ne želite več obvestil o zalogi za ta izdelek? <a href="{{unsubscribeUrl}}" style="color:rgb(0,122,255);">Odjava</a></p>
${FOOTER}`,
  },
  backInStockConfirm: {
    label: "Potrditev obvestila o zalogi",
    description: "Dvojna potrditev prijave na obvestilo o zalogi.",
    placeholders: [{ name: "productTitle", description: "Naziv izdelka" }, { name: "confirmUrl", description: "Potrditvena povezava" }],
    sample: { productTitle: "Belilni trakci za zobe (14 uporab)", confirmUrl: "https://nasmeh.si/potrdi-zalogo/primer" },
    defaultSubject: "Potrdite obvestilo o zalogi — Nasmeh.si",
    defaultBody: `<h1 ${H1}>Potrdite obvestilo o zalogi</h1>
<p ${P}>Hvala! Da aktivirate obvestilo o zalogi za izdelek <strong>{{productTitle}}</strong>, kliknite spodnji gumb.</p>
<p style="margin:2rem 0;"><a href="{{confirmUrl}}" ${BUTTON}>Aktiviraj obvestilo</a></p>
<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">Če obvestila niste zahtevali, to sporočilo preprosto prezrite.</p>
${FOOTER}`,
  },
  verifySubscription: {
    label: "Potrditev prijave na e-novice",
    description: "Dvojna potrditev prijave (tudi iz pozdravnega okna s kodo). Povezavo za odjavo od e-novic sistem vedno doda na konec sporočila.",
    placeholders: [{ name: "confirmUrl", description: "Potrditvena povezava" }],
    sample: { confirmUrl: "https://nasmeh.si/potrdi/primer" },
    defaultSubject: "Potrdite prijavo na e-novice — Nasmeh.si",
    defaultBody: `<h1 ${H1}>Potrdite svojo prijavo</h1>
<p ${P}>Hvala za prijavo na e-novice Nasmeh.si! Za potrditev kliknite spodnji gumb.</p>
<p style="margin:2rem 0;"><a href="{{confirmUrl}}" ${BUTTON}>Potrdi prijavo</a></p>
<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">Če se niste prijavili, to sporočilo preprosto prezrite.</p>
${FOOTER}`,
  },
  verifyAccount: {
    label: "Potrditev računa",
    description: "Aktivacija novega računa (povezava velja 24 ur).",
    placeholders: [{ name: "confirmUrl", description: "Aktivacijska povezava" }],
    sample: { confirmUrl: "https://nasmeh.si/potrdi-racun/primer" },
    defaultSubject: "Potrdite svoj račun — Nasmeh.si",
    defaultBody: `<h1 ${H1}>Dobrodošli na Nasmeh.si!</h1>
<p ${P}>Za aktivacijo računa kliknite spodnji gumb (povezava velja 24 ur).</p>
<p style="margin:2rem 0;"><a href="{{confirmUrl}}" ${BUTTON}>Aktiviraj račun</a></p>
<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">Če računa niste ustvarili, to sporočilo preprosto prezrite.</p>
${FOOTER}`,
  },
  resetPassword: {
    label: "Ponastavitev gesla",
    description: "Povezava za novo geslo (velja 1 uro).",
    placeholders: [{ name: "resetUrl", description: "Povezava za ponastavitev" }],
    sample: { resetUrl: "https://nasmeh.si/ponastavi-geslo/primer" },
    defaultSubject: "Ponastavitev gesla — Nasmeh.si",
    defaultBody: `<h1 ${H1}>Ponastavitev gesla</h1>
<p ${P}>Prejeli smo zahtevo za ponastavitev gesla. Povezava velja 1 uro.</p>
<p style="margin:2rem 0;"><a href="{{resetUrl}}" ${BUTTON}>Nastavi novo geslo</a></p>
<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">Če ponastavitve niste zahtevali, to sporočilo preprosto prezrite — geslo ostane nespremenjeno.</p>
${FOOTER}`,
  },
  supportReceipt: {
    label: "Potrdilo o prejemu sporočila",
    description: "Pošiljatelju obrazca za kontakt, odstop od pogodbe ali prijavo neželenega učinka; nosi le oznako zahtevka.",
    placeholders: [
      { name: "reference", description: "Oznaka zahtevka" },
      { name: "note", description: "Zakonska opomba glede na vrsto obrazca (odstop, neželeni učinek); sicer prazno" },
    ],
    sample: { reference: "POD-2026-00042", note: supportEmail.customer.notes.withdrawal },
    defaultSubject: `${supportEmail.customer.subjectPrefix} {{reference}} — Nasmeh.si`,
    defaultBody: `<h1 ${H1}>${supportEmail.customer.heading}</h1>
<p ${P}>${supportEmail.customer.body}</p>
<p ${P}>${supportEmail.customer.reference}: <strong>{{reference}}</strong></p>
<p ${P}>{{note}}</p>
<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">${supportEmail.customer.ignore}</p>
<p style="font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);">${supportEmail.customer.footer}</p>`,
  },
};

export function isEmailTemplateKey(value: unknown): value is EmailTemplateKey {
  return typeof value === "string" && (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** Placeholder names used in a subject or body. */
export function findPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}

/** Placeholders that the key does not provide (or block placeholders used in a subject). */
export function unknownPlaceholders(key: EmailTemplateKey, subject: string, body: string): string[] {
  const def = EMAIL_TEMPLATE_DEFS[key];
  const known = new Set(def.placeholders.map((placeholder) => placeholder.name));
  const textOnly = new Set(def.placeholders.filter((placeholder) => !placeholder.html).map((placeholder) => placeholder.name));
  return [
    ...findPlaceholders(subject).filter((name) => !textOnly.has(name)),
    ...findPlaceholders(body).filter((name) => !known.has(name)),
  ];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

/** Replaces known placeholders; text values are escaped, `html` ones inserted as they are, unknown ones removed. */
export function substitutePlaceholders(key: EmailTemplateKey, template: string, values: Record<string, string>, mode: "text" | "html"): string {
  const def = EMAIL_TEMPLATE_DEFS[key];
  const byName = new Map(def.placeholders.map((placeholder) => [placeholder.name, placeholder]));
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const placeholder = byName.get(name);
    if (!placeholder) return "";
    const value = values[name] ?? "";
    if (mode === "text") return placeholder.html ? "" : value;
    return placeholder.html ? value : escapeHtml(value);
  });
}

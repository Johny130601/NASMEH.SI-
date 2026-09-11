import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { contact } from "@/lib/copy/contact";
import { TOPIC_CODES, topicReasons } from "@/lib/support/topics";
import { dismissCookieBanner, enrolledTotpFields, loginStaff, prisma, waitForMailMessage } from "./helpers";

/** Phase 7 step 6 (§14.12–§14.14): shipping, tax/invoice, marketing/SEO/consent/store and support settings reach the storefront at once. */

const PASSWORD = "SettingsAcceptance123!";
const SETTING_KEYS = [
  "shipping.methods", "shipping.freeThresholdCents", "shipping.standardCostCents", "tracking.templates", "vat.ratePercent", "company", "invoice.footer",
  "analytics.gtmId", "seo.googleVerification", "seo.defaults", "consent.version", "consent.cookies", "consent.banner", "legal.links", "maintenance", "support.contact",
] as const;

/** Snapshot before each test and restore after it — afterEach still runs when a test times out, a finally block does not. */
let snapshot: Array<{ key: string; value: unknown }> = [];
test.beforeEach(async () => { snapshot = await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } }); });
test.afterEach(async () => {
  for (const key of SETTING_KEYS) {
    const original = snapshot.find((row) => row.key === key);
    if (original) await prisma.setting.update({ where: { key }, data: { value: original.value as object } });
    else await prisma.setting.deleteMany({ where: { key } });
  }
});
test.afterAll(async () => { await prisma.$disconnect(); });

async function staff(role: "OWNER" | "MANAGER", key: string) {
  const totp = enrolledTotpFields();
  const user = await prisma.user.create({ data: {
    email: `settings-${role.toLowerCase()}-${key}@test.si`, name: `Staff ${role}`, role, emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4), ...totp.data,
  } });
  return { ...user, secret: totp.secret };
}

async function shippedOrder(key: string) {
  const product = await prisma.product.findUniqueOrThrow({ where: { slug: "belilni-trakci-za-zobe" }, include: { variants: true } });
  const number = `NS-2026-7${randomInt(1000, 9999)}`;
  return prisma.order.create({ data: {
    number, email: `settings-kupec-${key}@test.si`, status: "SHIPPED", paidAt: new Date(), stockDeducted: true, paymentProvider: "test",
    stripePaymentIntentId: `test_pi_${number}`, invoiceNumber: number, invoiceIssuedAt: new Date(), shippingMethod: "GLS — paketna dostava",
    carrier: "GLS", trackingNumber: `E2E${key.toUpperCase()}`, shippedAt: new Date(),
    shippingCents: 490, subtotalCents: 3499, totalCents: 3989, vatCents: 719, vatRatePercent: 22,
    shippingAddress: { fullName: "Nastavitve Test", line1: "Testna 5", postalCode: "1000", city: "Ljubljana", country: "SI" },
    items: { create: { variantId: product.variants[0].id, title: product.title, sku: product.variants[0].sku, unitPriceCents: 3499, quantity: 1 } },
    timeline: [],
  } });
}

async function addStripsToCart(page: Page) {
  await page.goto("/trgovina");
  await dismissCookieBanner(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
}

async function saved(page: Page, form: string, message = "Nastavitve so shranjene.") {
  const scope = page.locator(`[data-settings-form='${form}']`);
  await scope.locator("[data-settings-save]").click();
  await expect(scope.locator("[data-settings-message]")).toHaveText(message);
}

test("owner edits shipping, tax, marketing, consent, legal, maintenance and support settings; each change is live on the storefront", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const key = randomUUID().slice(0, 8);
  const owner = await staff("OWNER", key);
  const order = await shippedOrder(key);
  const supportEmail = `podpora-${key}@test.si`;
  const shop = await browser.newContext();
  const front = await shop.newPage();
  const ticketReferences: string[] = [];
  try {
    await loginStaff(page, owner.email, PASSWORD, owner.secret);
    await page.goto("/admin/nastavitve");
    for (const card of ["shipping", "tax", "marketing", "support"]) await expect(page.locator(`[data-settings-card='${card}']`)).toBeVisible();

    // Shipping: free-shipping threshold reaches the cart bar; a tracking template changes the carrier link.
    await page.goto("/admin/nastavitve/dostava");
    await expect(page.locator("[data-shipping-method]")).toHaveCount(3);
    await page.getByLabel("Brezplačna dostava od (centi z DDV)").fill("9900");
    await page.locator("[data-shipping-save]").click();
    await expect(page.locator("[data-shipping-editor] [data-settings-message]")).toHaveText("Nastavitve so shranjene.");
    await page.getByLabel("GLS", { exact: true }).fill(`https://sledenje-${key}.test/paket/{number}`);
    await saved(page, "tracking");
    expect(await prisma.setting.findUniqueOrThrow({ where: { key: "shipping.freeThresholdCents" } }).then((row) => row.value)).toBe(9900);
    await addStripsToCart(front);
    await front.goto("/cart");
    await expect(front.locator("main")).toContainText("€65 vas loči do brezplačne dostave"); // 99,00 € − 34,99 € rounded up
    await page.goto(`/admin/narocila/${order.number}`);
    await expect(page.locator("[data-tracking-link]")).toHaveAttribute("href", `https://sledenje-${key}.test/paket/E2E${key.toUpperCase()}`);
    await page.goto("/admin/nastavitve/dostava");
    await page.getByLabel("Pošta Slovenije", { exact: true }).fill("http://nezavarovano.test/{number}");
    await page.locator("[data-settings-form='tracking'] [data-settings-save]").click();
    await expect(page.locator("[data-settings-form='tracking'] [data-settings-message]")).toHaveText("Predloga mora biti https naslov brez gesla in vsebovati {number}.");

    // Tax and invoice: company block on the footer and the invoice route; provider status from the environment.
    await page.goto("/admin/nastavitve/davki-racuni");
    await expect(page.locator("[data-provider-status='test']")).toHaveAttribute("data-provider-configured", "yes");
    await expect(page.locator("[data-provider-status='stripe']")).toHaveAttribute("data-provider-configured", "no");
    await page.getByLabel("Naziv", { exact: true }).fill(`E2E podjetje ${key} d.o.o.`);
    await saved(page, "company");
    await page.locator("[data-invoice-footer]").fill(`Opomba računa ${key}`);
    await saved(page, "invoice");
    await page.getByLabel("Stopnja DDV (%, celo število)").fill("9");
    await saved(page, "vat");
    await front.goto("/cart");
    await expect(front.locator("main")).toContainText("DDV 9 %");
    await page.getByLabel("Stopnja DDV (%, celo število)").fill("22");
    await saved(page, "vat");
    expect(await prisma.setting.findUniqueOrThrow({ where: { key: "invoice.footer" } }).then((row) => row.value)).toBe(`Opomba računa ${key}`);
    await front.goto("/");
    await expect(front.locator("footer")).toContainText(`E2E podjetje ${key} d.o.o.`);
    const invoice = await page.request.get(`/racun/narocilo/${order.number}/racun.pdf`);
    expect(invoice.status()).toBe(200);
    expect(invoice.headers()["content-type"]).toBe("application/pdf");

    // Marketing: SEO title template and the index switch; Search Console token.
    await page.goto("/admin/nastavitve/trzenje");
    await page.getByLabel("Predloga naslova (%s = naslov strani)").fill(`%s · E2E ${key}`);
    await page.locator("[data-seo-indexable]").uncheck();
    await saved(page, "seo");
    await front.goto("/trgovina");
    await expect(front).toHaveTitle(new RegExp(`· E2E ${key}$`));
    await expect(front.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
    expect(await (await front.request.get("/robots.txt")).text()).toMatch(/Disallow: \/\s*$/m);
    await page.locator("[data-seo-indexable]").check();
    await saved(page, "seo");
    await front.goto("/trgovina");
    await expect(front.locator("meta[name='robots']")).toHaveCount(0);
    expect(await (await front.request.get("/robots.txt")).text()).toContain("Allow: /");
    await page.getByLabel("Koda za potrditev lastništva (vsebina meta oznake)").fill(`e2e-${key}-verification`);
    await saved(page, "verification");
    await front.goto("/");
    await expect(front.locator("meta[name='google-site-verification']")).toHaveAttribute("content", `e2e-${key}-verification`);
    await page.getByLabel("Google Tag Manager (GTM-…)").fill("UA-123");
    await page.locator("[data-settings-form='analytics'] [data-settings-save]").click();
    await expect(page.locator("[data-settings-form='analytics'] [data-settings-message]")).toHaveText("Preverite obliko ID-jev (GTM-XXXX, G-XXXX, Meta samo številke).");

    // Consent: banner copy override and a new cookie row are live; a version bump re-asks a visitor who already chose.
    await page.getByLabel("Naslov pasice (prazno = privzeto besedilo)").fill(`Piškotki E2E ${key}`);
    await page.locator("[data-cookie-add]").click();
    const rowIndex = (await page.locator("[data-cookie-row-editor]").count());
    await page.getByLabel(`Ime ${rowIndex}`, { exact: true }).fill(`_e2e_${key}`);
    await page.getByLabel(`Ponudnik ${rowIndex}`, { exact: true }).fill("E2E");
    await page.getByLabel(`Namen ${rowIndex}`, { exact: true }).fill("Preizkus nastavitev");
    await page.getByLabel(`Trajanje ${rowIndex}`, { exact: true }).fill("1 dan");
    await page.getByLabel(`Kategorija ${rowIndex}`, { exact: true }).selectOption("marketing");
    await saved(page, "consent");
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    try {
      await visitor.goto("/");
      const banner = visitor.getByRole("dialog", { name: `Piškotki E2E ${key}` });
      await expect(banner).toBeVisible();
      await expect(banner.locator("[data-cmp-policy-link]")).toHaveAttribute("href", "/politika-piskotkov");
      await banner.getByRole("button", { name: "Sprejmi vse", exact: true }).click();
      await expect(banner).toBeHidden();
      await visitor.goto("/politika-piskotkov");
      await expect(visitor.locator(`[data-cookie-row='_e2e_${key}']`)).toContainText("Preizkus nastavitev");
      await visitor.goto("/");
      await expect(visitor.getByRole("dialog", { name: /piškotki/i })).toHaveCount(0);
      const before = await prisma.setting.findUniqueOrThrow({ where: { key: "consent.version" } });
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("[data-consent-bump]").click();
      await expect(page.locator("[data-consent-bump-message]")).toHaveText(`Nova različica privolitve: ${Number(before.value) + 1}.`);
      await visitor.goto("/");
      await expect(visitor.getByRole("dialog", { name: `Piškotki E2E ${key}` })).toBeVisible();
    } finally {
      await visitorContext.close();
    }

    // Legal links: the checkout payment step names the configured terms page.
    await page.goto("/admin/nastavitve/trzenje");
    await page.getByLabel("Pogoji poslovanja", { exact: true }).fill(`/pogoji-poslovanja?e2e=${key}`);
    await saved(page, "legal");
    await front.goto("/checkout");
    await dismissCookieBanner(front); // the version bump above re-opened the banner for this context
    await front.getByLabel("E-pošta").fill(`settings-kupec-${key}@test.si`);
    await front.locator("[data-continue-contact]").click();
    await front.getByLabel("Ime in priimek").fill("Kupec Nastavitve");
    await front.getByLabel("Ulica").fill("Testna ulica");
    await front.getByLabel("Hišna številka").fill("12");
    await front.getByLabel("Kraj").fill("Ljubljana");
    await front.getByLabel("Poštna številka").fill("1000");
    await front.locator("[data-continue-shipping]").click();
    await expect(front.locator("[data-legal-terms]")).toHaveAttribute("href", `/pogoji-poslovanja?e2e=${key}`);
    await expect(front.locator("[data-legal-withdrawal]")).toHaveAttribute("href", "/odstop-od-pogodbe");

    // Support: the next ticket routes to the new support address and the contact page shows it.
    await page.goto("/admin/nastavitve/podpora");
    await page.getByLabel("E-naslov podpore").fill(supportEmail);
    await page.getByLabel("Delovni čas").fill(`Pon.–pet. 9.00–16.00 (${key})`);
    await saved(page, "support");
    const reporterContext = await browser.newContext();
    const reporter = await reporterContext.newPage();
    try {
      await reporter.goto("/kontakt");
      await dismissCookieBanner(reporter);
      await expect(reporter.locator("main")).toContainText(supportEmail);
      await expect(reporter.locator("main")).toContainText(`Pon.–pet. 9.00–16.00 (${key})`);
      const topic = TOPIC_CODES[0];
      const radio = reporter.locator(`input[name="contact-topic"][value="${topic}"]`);
      await radio.locator("..").click();
      await expect(radio).toBeChecked();
      if (topicReasons[topic].length > 1) await reporter.getByLabel(contact.reasonLabel, { exact: true }).selectOption(topicReasons[topic].at(-1)!);
      const form = reporter.locator("[data-contact-form]");
      await form.getByLabel(contact.message.name, { exact: true }).fill("Nastavitve Prijavitelj");
      await form.getByLabel(contact.message.email, { exact: true }).fill(`settings-prijava-${key}@test.si`);
      await form.getByLabel(contact.message.text, { exact: true }).fill(`Preizkus usmerjanja podpore ${key}.`);
      await form.locator('[name="privacyAccepted"]').check();
      await reporter.getByRole("button", { name: contact.message.submit, exact: true }).click();
      await expect(reporter.locator("[data-contact-success]")).toBeVisible();
      const reference = (await reporter.locator("[data-contact-reference]").textContent())!;
      ticketReferences.push(reference);
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { reference }, include: { deliveries: true } });
      expect(ticket.deliveries.find((delivery) => delivery.kind === "STAFF")?.recipient).toBe(supportEmail);
      const staffMail = await waitForMailMessage(supportEmail);
      expect(staffMail.Subject).toContain(reference);
    } finally {
      await reporterContext.close();
    }

    // Maintenance: the storefront locks behind the password for a new visitor while the admin stays open; the password unlocks it.
    await page.goto("/admin/nastavitve/trzenje");
    await page.locator("[data-maintenance-enabled]").check();
    await page.getByLabel("Geslo za dostop (najmanj 4 znaki)").fill(`geslo-${key}`);
    await page.getByLabel("Sporočilo obiskovalcem (neobvezno)").fill(`Vzdrževanje ${key}`);
    await saved(page, "maintenance");
    const lockedContext = await browser.newContext();
    const locked = await lockedContext.newPage();
    try {
      await locked.goto("/");
      await expect(locked.getByRole("heading", { level: 1 })).toHaveText("Trgovina se pripravlja");
      await expect(locked.locator("main")).toContainText(`Vzdrževanje ${key}`);
      await locked.getByLabel("Geslo za dostop").fill("napacno");
      await locked.getByRole("button", { name: "Vstopi" }).click();
      await expect(locked.getByText("Napačno geslo.")).toBeVisible();
      await locked.getByLabel("Geslo za dostop").fill(`geslo-${key}`);
      await locked.getByRole("button", { name: "Vstopi" }).click();
      await expect(locked.locator("[data-cart-link]")).toBeVisible();
    } finally {
      await lockedContext.close();
    }
    await page.goto("/admin/nastavitve/trzenje");
    await expect(page.locator("[data-maintenance-enabled]")).toBeChecked();
    await page.locator("[data-maintenance-enabled]").uncheck();
    await saved(page, "maintenance");
    expect(await prisma.setting.findUniqueOrThrow({ where: { key: "maintenance" } }).then((row) => row.value)).toMatchObject({ enabled: false });
  } finally {
    await shop.close();
    await prisma.ticket.deleteMany({ where: { reference: { in: ticketReferences } } });
    await prisma.order.deleteMany({ where: { OR: [{ id: order.id }, { email: `settings-kupec-${key}@test.si` }] } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
  }
});

test("a manager is refused at the settings screens and sees no settings link", async ({ page }) => {
  const key = randomUUID().slice(0, 8);
  const manager = await staff("MANAGER", key);
  try {
    await loginStaff(page, manager.email, PASSWORD, manager.secret);
    await expect(page.locator("a[href='/admin/nastavitve']")).toHaveCount(0);
    for (const href of ["/admin/nastavitve", "/admin/nastavitve/dostava", "/admin/nastavitve/davki-racuni", "/admin/nastavitve/trzenje", "/admin/nastavitve/podpora"]) {
      await page.goto(href);
      await page.waitForURL(/\/admin\?dostop=zavrnjen/);
      await expect(page.locator("[data-forbidden-notice]")).toBeVisible();
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: manager.id } });
  }
});

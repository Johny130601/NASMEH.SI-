import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { expect, test as base, type Page } from "@playwright/test";
import { saveAddressForUser, setDefaultAddressForUser, deleteAddressForUser } from "@/lib/account/addresses";
import { db } from "@/lib/db";
import { recordInitialPriceInTx } from "@/lib/price-history";
import { enrolledTotpFields, loginStaff, prisma } from "./helpers";

const password = "AccountAcceptance123!";
interface AccountFixture {
  owner: { id: string; email: string };
  other: { id: string; email: string };
  admin: { id: string; email: string; secret: string };
  number: string;
  pendingNumber: string;
  otherNumber: string;
  fourthTitle: string;
}

const test = base.extend<{ accountFixture: AccountFixture }>({
  accountFixture: async ({ page }, provide) => {
    void page;
    const id = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const fixture = await prisma.$transaction(async tx => {
      const owner = await tx.user.create({ data: { email: `account-${id}@test.si`, name: "Živa Ščuk", passwordHash: hash, emailVerified: new Date() } });
      const other = await tx.user.create({ data: { email: `account-other-${id}@test.si`, name: "Drugi Kupec", passwordHash: hash, emailVerified: new Date() } });
      const totp = enrolledTotpFields();
      const admin = { ...(await tx.user.create({ data: { email: `account-admin-${id}@test.si`, name: "Upravitelj", role: "OWNER", passwordHash: hash, emailVerified: new Date(), ...totp.data } })), secret: totp.secret };
      const product = await tx.product.create({ data: {
        title: "Account fixture", slug: `account-${id}`, status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
        variants: { create: [1, 2, 3, 4].map(n => ({ sku: `ACCOUNT-${id}-${n}`, priceCents: n * 1000, stock: 10 })) },
      }, include: { variants: { orderBy: { priceCents: "asc" } } } });
      for (const variant of product.variants) await recordInitialPriceInTx(tx, { variantId: variant.id, priceCents: variant.priceCents });
      const number = `NS-P5-${id}`;
      const paidAt = new Date("2026-09-01T12:00:00Z");
      await tx.order.create({ data: {
        number, userId: owner.id, email: owner.email, status: "DELIVERED", paidAt,
        deliveredAt: new Date("2026-09-02T12:00:00Z"), invoiceNumber: number, invoiceIssuedAt: paidAt,
        subtotalCents: 10000, discountCents: 1000, shippingCents: 390, totalCents: 9390,
        // A historical one-cent allocation difference proves VAT is not recomputed.
        vatCents: 1694, vatRatePercent: 22, couponCode: "HISTORICAL10", paymentProvider: "stripe",
        shippingAddress: { fullName: "Živa Ščuk", street: "Čopova", streetNumber: "12", postalCode: "1000", city: "Ljubljana", country: "SI" },
        billingAddress: { fullName: "Podjetje Primer", line1: "Dunajska 20", line2: "2. nadstropje", postalCode: "1000", city: "Ljubljana", country: "SI" },
        carrier: "Pošta Slovenije", trackingNumber: "SI123456789",
        items: { create: product.variants.map((variant, index) => ({ variantId: variant.id, sku: variant.sku, title: `Shranjena postavka ${index + 1}`, quantity: 1, unitPriceCents: variant.priceCents })) },
      } });
      const pendingNumber = `${number}-pending`;
      const otherNumber = `${number}-other`;
      for (const [orderNumber, user] of [[pendingNumber, owner], [otherNumber, other]] as const) {
        await tx.order.create({ data: {
          number: orderNumber, userId: user.id, email: user.email, subtotalCents: 1000, totalCents: 1390, shippingCents: 390, vatCents: 251,
          shippingAddress: { fullName: user.name }, items: { create: { variantId: product.variants[0].id, sku: product.variants[0].sku, title: "Pending fixture", quantity: 1, unitPriceCents: 1000 } },
        } });
      }
      return { owner, other, admin, number, pendingNumber, otherNumber, productId: product.id, fourthTitle: "Shranjena postavka 4" };
    });
    try { await provide(fixture); }
    finally {
      const userIds = [fixture.owner.id, fixture.other.id, fixture.admin.id];
      await prisma.$transaction(async tx => {
        await tx.order.deleteMany({ where: { userId: { in: userIds } } });
        await tx.consentLog.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
        await tx.product.delete({ where: { id: fixture.productId } });
      });
    }
  },
});

test.afterAll(async () => { await Promise.all([prisma.$disconnect(), db.$disconnect()]); });

async function login(page: Page, email: string) {
  await page.goto("/prijava");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
  await expect(banner).toBeHidden();
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.getByLabel("Geslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/racun$/, { timeout: 15_000 });
}

test("account order cards, snapshots, tracking, review entry points and invoice download", async ({ page, accountFixture: fixture }) => {
  await login(page, fixture.owner.email);
  await expect(page.getByRole("heading", { name: "Živjo, Živa" })).toBeVisible();
  await expect(page.locator(`[data-order-card="${fixture.otherNumber}"]`)).toHaveCount(0);
  const card = page.locator(`[data-order-card="${fixture.number}"]`);
  await expect(card).toContainText("Dostavljeno");
  await card.locator("summary").first().click();
  await expect(card.getByText(fixture.fourthTitle, { exact: false })).toBeHidden();
  await card.locator("[data-order-more] summary").click();
  await expect(card.getByText(fixture.fourthTitle, { exact: false })).toBeVisible();
  await expect(card).toContainText("Odposlano z Pošta Slovenije");
  await card.getByRole("link", { name: "Podrobnosti naročila" }).click();
  await expect(page.locator("[data-order-subtotal]")).toHaveText("100,00 €");
  await expect(page.locator("[data-order-discount]")).toHaveText("−10,00 €");
  await expect(page.locator("[data-order-shipping]")).toHaveText("3,90 €");
  await expect(page.locator("[data-order-total]")).toHaveText("93,90 €");
  await expect(page.locator("[data-order-vat]")).toHaveText("Vključen DDV (22 %): 16,94 €");
  await expect(page.locator("[data-order-addresses]")).toContainText("Čopova 12");
  await expect(page.locator("[data-order-addresses]")).toContainText("Podjetje Primer");
  await expect(page.locator("[data-order-addresses]")).toContainText("Dunajska 20");
  await expect(page.getByText("Plačilo: Kartica / Apple Pay / Google Pay", { exact: true })).toBeVisible();
  await expect(page.locator("[data-tracking-link]")).toHaveAttribute("href", "https://sledenje.posta.si/?q=SI123456789");
  await expect(page.locator("[data-review-cta]")).toHaveCount(4);

  const response = await page.request.get(`/racun/narocilo/${fixture.number}/racun.pdf`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("private, no-store");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const downloaded = page.waitForEvent("download");
  await page.locator("[data-invoice-download]").click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(`racun-${fixture.number}.pdf`);
  expect((await readFile((await download.path())!)).subarray(0, 5).toString()).toBe("%PDF-");

  await page.goto(`/racun/narocilo/${fixture.pendingNumber}`);
  await expect(page.locator("[data-invoice-download]")).toHaveCount(0);
  await expect(page.locator("[data-review-cta]")).toHaveCount(0);
  expect((await page.request.get(`/racun/narocilo/${fixture.pendingNumber}/racun.pdf`)).status()).toBe(404);
});

test("order detail and invoice require the owner or an administrator", async ({ page, browser, baseURL, accountFixture: fixture }) => {
  const path = `/racun/narocilo/${fixture.number}`;
  const anonymous = await page.request.get(`${path}/racun.pdf`, { maxRedirects: 0 });
  expect([302, 307]).toContain(anonymous.status());
  expect(anonymous.headers()["location"]).toContain("/prijava");
  await login(page, fixture.other.email);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: fixture.number, exact: true })).toHaveCount(0);
  await expect(page.locator("[data-order-addresses]")).toHaveCount(0);
  expect((await page.request.get(`${path}/racun.pdf`)).status()).toBe(404);

  const context = await browser.newContext({ baseURL });
  try {
    const adminPage = await context.newPage();
    await loginStaff(adminPage, fixture.admin.email, password, fixture.admin.secret);
    await adminPage.goto(path);
    await expect(adminPage.locator("[data-order-total]")).toHaveText("93,90 €");
    await expect(adminPage.locator("[data-review-cta]")).toHaveCount(0);
    expect((await context.request.get(`${path}/racun.pdf`)).status()).toBe(200);
  } finally { await context.close(); }
});

async function fillAddress(page: Page, data: { label: string; country: string; postalCode: string; city: string }) {
  const form = page.locator("[data-address-form]");
  await form.getByLabel("Oznaka (npr. Dom, Služba)", { exact: true }).fill(data.label);
  await form.getByLabel("Ime in priimek", { exact: true }).fill("Živa Ščuk");
  await form.getByLabel("Ulica in hišna številka", { exact: true }).fill("Čopova 12");
  await form.getByLabel("Poštna številka", { exact: true }).fill(data.postalCode);
  await form.getByLabel("Kraj", { exact: true }).fill(data.city);
  await form.getByLabel("Država", { exact: true }).selectOption(data.country);
}

async function saveAddress(page: Page) {
  await page.getByRole("button", { name: "Shrani naslov", exact: true }).click();
  await expect(page.locator("[data-address-form]")).toHaveCount(0);
}

test("address create/edit/default/delete and marketing withdrawal keep an audit history", async ({ page, accountFixture: fixture }) => {
  await login(page, fixture.owner.email);
  await page.getByRole("link", { name: "Moji podatki", exact: true }).click();
  await expect(page.locator("[data-marketing-toggle]")).not.toBeChecked();
  await page.getByRole("button", { name: "Dodaj naslov", exact: true }).click();
  await fillAddress(page, { label: "Dom", country: "SI", postalCode: "1000", city: "Ljubljana" });
  await saveAddress(page);
  const home = page.locator("[data-address-row]").filter({ hasText: "Dom" });
  await expect(home).toContainText("Privzeti");
  await home.getByRole("button", { name: "Uredi", exact: true }).click();
  await expect(page.getByLabel("Poštna številka", { exact: true })).toHaveValue("1000");
  await page.getByLabel("Ulica in hišna številka", { exact: true }).fill("Šmartinska 15");
  await saveAddress(page);
  await expect(home).toContainText("Šmartinska 15");

  await page.getByRole("button", { name: "Dodaj naslov", exact: true }).click();
  await fillAddress(page, { label: "Služba", country: "DE", postalCode: "1000", city: "Berlin" });
  await page.getByRole("button", { name: "Shrani naslov", exact: true }).click();
  await expect(page.locator("[data-address-form]").getByRole("alert")).toContainText("poštne številke");
  await page.getByLabel("Poštna številka", { exact: true }).fill("10115");
  await saveAddress(page);
  const work = page.locator("[data-address-row]").filter({ hasText: "Služba" });
  await work.getByRole("button", { name: "Nastavi kot privzeti", exact: true }).click();
  await expect(work).toContainText("Privzeti");
  await expect(home).not.toContainText("Privzeti");
  await work.getByRole("button", { name: "Izbriši", exact: true }).click();
  await expect(work).toHaveCount(0);
  await expect(home).toContainText("Privzeti");

  await page.locator("[data-marketing-toggle]").check();
  await expect(page.getByRole("status")).toHaveText("Nastavitve shranjene.");
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: fixture.owner.id } })).marketingOptIn).toBe(true);
  await expect(page.locator("[data-marketing-toggle]")).toBeChecked();
  await page.locator("[data-marketing-toggle]").uncheck();
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: fixture.owner.id } })).marketingOptIn).toBe(false);
  const log = await prisma.consentLog.findMany({ where: { userId: fixture.owner.id, kind: "marketing-preference" }, orderBy: { createdAt: "asc" } });
  expect(log.map(row => row.choices)).toEqual([{ marketing: true, previous: false }, { marketing: false, previous: true }]);
  await page.reload();
  await expect(page.locator("[data-marketing-toggle]")).not.toBeChecked();
  // Updating the address book did not rewrite the purchased order's address.
  await page.goto(`/racun/narocilo/${fixture.number}`);
  await expect(page.locator("[data-order-addresses]")).toContainText("Čopova 12");
  await expect(page.locator("[data-order-addresses]")).not.toContainText("Šmartinska 15");
});

test("concurrent address mutations preserve one default and cannot target another owner", async ({ accountFixture: fixture }) => {
  const address = { fullName: "Živa Ščuk", line1: "Čopova 12", postalCode: "1000", city: "Ljubljana", country: "SI", isDefault: true };
  const created = await Promise.all(["Dom", "Služba", "Drugo"].map(label => saveAddressForUser(fixture.owner.id, { ...address, label })));
  expect(created.every(result => result.ok)).toBe(true);
  let rows = await prisma.address.findMany({ where: { userId: fixture.owner.id } });
  expect(rows).toHaveLength(3);
  expect(rows.filter(row => row.isDefault)).toHaveLength(1);
  await Promise.all(rows.map(row => setDefaultAddressForUser(fixture.owner.id, { id: row.id })));
  rows = await prisma.address.findMany({ where: { userId: fixture.owner.id } });
  expect(rows.filter(row => row.isDefault)).toHaveLength(1);
  const originalDefault = rows.find(row => row.isDefault)!;
  await saveAddressForUser(fixture.other.id, { ...address, label: "Foreign" });
  const foreign = await prisma.address.findFirstOrThrow({ where: { userId: fixture.other.id } });
  for (const operation of [setDefaultAddressForUser, deleteAddressForUser]) expect((await operation(fixture.owner.id, { id: foreign.id })).ok).toBe(false);
  expect((await saveAddressForUser(fixture.owner.id, { ...address, id: foreign.id })).ok).toBe(false);
  expect((await prisma.address.findUniqueOrThrow({ where: { id: originalDefault.id } })).isDefault).toBe(true);
  expect((await prisma.address.findUniqueOrThrow({ where: { id: foreign.id } })).userId).toBe(fixture.other.id);
  await Promise.all(rows.slice(0, 2).map(row => deleteAddressForUser(fixture.owner.id, { id: row.id })));
  rows = await prisma.address.findMany({ where: { userId: fixture.owner.id } });
  expect(rows).toHaveLength(1);
  expect(rows[0].isDefault).toBe(true);
});

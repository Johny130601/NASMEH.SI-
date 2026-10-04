import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test as base, type Page } from "@playwright/test";
import { account as accountCopy } from "@/lib/copy/account";
import { checkout as checkoutCopy, orders as ordersCopy } from "@/lib/copy/checkout";
import { pdp as pdpCopy } from "@/lib/copy/pdp";
import { admin as adminCopy } from "@/lib/copy/admin";
import { catalog as catalogCopy } from "@/lib/copy/catalog";
import { dismissCookieBanner, enrolledTotpFields, freshTotpCode, loginStaff, prisma } from "./helpers";

/**
 * Exploratory QA 2026-10-03, the paths the lead fixed, re-tested in the browser: sign-out ends
 * every copy of the session (T3-01), an unpaid order is offered back on /checkout (T2-02), Back
 * steps within the checkout (T2-03), the first refused field is focused on a phone (T2-06), a
 * supplement is stored apart from the house number (T2-04), and the address book asks for the
 * house number the checkout needs (T3-03).
 */
base.describe.configure({ mode: "serial" });

const password = "QaFixes2026-10-03!";
const MOUTHWASH = "ustna-voda-globinsko-ciscenje";

const test = base.extend<{ customer: { id: string; email: string } }>({
  customer: async ({ page }, provide) => {
    void page;
    const user = await prisma.user.create({ data: {
      email: `qa-fixes-${randomUUID()}@test.si`, name: "Tea Testna", passwordHash: await bcrypt.hash(password, 10), emailVerified: new Date(),
    } });
    try { await provide({ id: user.id, email: user.email }); }
    finally {
      await prisma.$transaction(async (tx) => {
        await tx.order.deleteMany({ where: { userId: user.id } });
        await tx.address.deleteMany({ where: { userId: user.id } });
        await tx.cart.deleteMany({ where: { userId: user.id } });
        await tx.consentLog.deleteMany({ where: { userId: user.id } });
        await tx.user.delete({ where: { id: user.id } });
      });
    }
  },
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await page.goto("/prijava");
  await dismissCookieBanner(page);
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.getByLabel("Geslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/racun$/, { timeout: 15_000 });
}

/** "Kupi zdaj" on the mouthwash PDP: straight to the checkout with one line. */
async function buyNow(page: Page) {
  await page.goto(`/izdelek/${MOUTHWASH}`);
  await dismissCookieBanner(page);
  await page.locator("[data-buy-box]").getByRole("button", { name: pdpCopy.buyBox.buyNow }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

test("signing out ends the session for every copy of its cookie (T3-01)", async ({ page, browser, baseURL, customer }) => {
  await login(page, customer.email);
  const session = (await page.context().cookies()).find((cookie) => cookie.name.includes("session-token"));
  expect(session, "a session cookie after sign-in").toBeTruthy();

  await page.getByRole("button", { name: accountCopy.rows.logout, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/racun"));

  // a copy of the cookie taken before the sign-out is refused afterwards
  const replay = await browser.newContext({ baseURL });
  try {
    await replay.addCookies([session!]);
    const other = await replay.newPage();
    await other.goto("/racun/podatki");
    // refused, and sent to sign in with the way back to the page it asked for (V2-02)
    await expect(other).toHaveURL(/\/prijava\?callbackUrl=%2Fracun%2Fpodatki$/);
  } finally {
    await replay.close();
  }
  expect(await prisma.revokedSession.count({ where: { expiresAt: { gt: new Date() } } })).toBeGreaterThan(0);
});

test("Back steps within the checkout, and a phone focuses the first refused field (T2-03, T2-06)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await buyNow(page);
  const email = `qa-back-${Date.now()}@test.si`;
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.locator("[data-continue-contact]").click();
  await expect(page).toHaveURL(/\/checkout\?korak=2$/);
  await expect(page.locator("[data-step='1']")).toHaveAttribute("data-open", "true");

  // continuing with empty fields brings the first refused one into view and focus
  await page.locator("[data-continue-shipping]").click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("name"))).toBe("fullName");
  const box = await page.locator("[name='fullName']").boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);

  // the system Back returns to Kontakt with what was typed; Forward reopens Dostava
  await page.goBack();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("[data-step='0']")).toHaveAttribute("data-open", "true");
  await expect(page.getByLabel("E-pošta", { exact: true })).toHaveValue(email);
  await page.goForward();
  await expect(page.locator("[data-step='1']")).toHaveAttribute("data-open", "true");

  // a reload cannot open a step this visit never reached with its data
  await page.reload();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("[data-step='0']")).toHaveAttribute("data-open", "true");
});

test("an order left unpaid is offered back on /checkout, and its supplement is stored apart (T2-02, T2-04)", async ({ page }) => {
  await buyNow(page);
  const email = `qa-unpaid-${Date.now()}@test.si`;
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.locator("[data-continue-contact]").click();
  await page.getByLabel("Ime in priimek").fill("Test Kupec");
  await page.getByLabel(checkoutCopy.shipping.streetLineLabel).fill("Dunajska cesta 20, 2. nadstropje");
  await page.getByLabel("Kraj").fill("Ljubljana");
  await page.getByLabel("Poštna številka").fill("1000");
  await page.locator("[data-continue-shipping]").click();
  await page.locator("[data-continue-payment]").click();
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-pay-panel]")).toBeVisible({ timeout: 15_000 });

  const order = await prisma.order.findFirstOrThrow({ where: { email }, select: { number: true, shippingAddress: true } });
  expect(order.shippingAddress).toMatchObject({ street: "Dunajska cesta", streetNumber: "20", streetSupplement: "2. nadstropje" });

  // a reload during payment no longer loses the way back to the order
  await page.goto("/checkout");
  const notice = page.locator(`[data-checkout-unpaid-order='${order.number}']`);
  await expect(notice).toBeVisible();
  await notice.getByRole("link", { name: checkoutCopy.unpaidOrder.cta }).click();
  await expect(page).toHaveURL(new RegExp(`/potrditev/${order.number}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ordersCopy.confirmation.unpaidTitle);
});

test("the address book asks for the house number the checkout needs (T3-03)", async ({ page, customer }) => {
  await login(page, customer.email);
  await page.getByRole("link", { name: "Moji podatki", exact: true }).click();
  await page.getByRole("button", { name: "Dodaj naslov", exact: true }).click();
  const form = page.locator("[data-address-form]");
  await form.getByLabel("Ime in priimek", { exact: true }).fill("Tea Testna");
  await form.getByLabel("Ulica in hišna številka", { exact: true }).fill("Slovenska cesta");
  await form.getByLabel("Poštna številka", { exact: true }).fill("1000");
  await form.getByLabel("Kraj", { exact: true }).fill("Ljubljana");
  await page.getByRole("button", { name: "Shrani naslov", exact: true }).click();
  await expect(form.getByText(accountCopy.addresses.invalidLine1)).toBeVisible();
  expect(await prisma.address.count({ where: { userId: customer.id } })).toBe(0);

  await form.getByLabel("Ulica in hišna številka", { exact: true }).fill("Slovenska cesta 12");
  await page.getByRole("button", { name: "Shrani naslov", exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(await prisma.address.count({ where: { userId: customer.id } })).toBe(1);
});

/** A product of its own, so stock moves never touch the seeded catalog. */
async function stockFixture(stock: number) {
  const key = randomUUID().slice(0, 8);
  const product = await prisma.product.create({ data: {
    slug: `qa-zaloga-${key}`, title: `QA zaloga ${key}`, status: "ACTIVE",
    variants: { create: { sku: `QA-ZAL-${key.toUpperCase()}`, priceCents: 1990, stock } },
  }, include: { variants: true } });
  return { product, variant: product.variants[0] };
}

async function removeStockFixture(productId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.priceHistory.deleteMany({ where: { variant: { productId } } });
    await tx.variant.deleteMany({ where: { productId } });
    await tx.product.delete({ where: { id: productId } });
  });
}

test("a stock figure typed before a sale is refused even after another save refreshed the page (T5-01, V5-01)", async ({ page }) => {
  const key = randomUUID().slice(0, 8);
  const totp = enrolledTotpFields();
  const owner = await prisma.user.create({ data: {
    email: `qa-zaloga-${key}@test.si`, name: "QA Zaloga", role: "OWNER", emailVerified: new Date(),
    passwordHash: await bcrypt.hash(password, 4), ...totp.data,
  } });
  const { product, variant } = await stockFixture(10);
  const c = adminCopy.catalog.editor.variants;
  try {
    await loginStaff(page, owner.email, password, totp.secret);
    await page.goto(`/admin/izdelki/${product.id}`);
    const form = page.locator(`[data-variant-form='${variant.sku}']`);
    const stockField = form.getByLabel(`${c.stock} (${variant.sku})`, { exact: true });
    await stockField.fill("15");
    // a paid order takes a unit, then another save on the page refreshes it
    await prisma.variant.update({ where: { id: variant.id }, data: { stock: { decrement: 1 } } });
    await page.locator("[data-product-save]").click();
    await expect(page.locator("[data-product-message]")).toHaveText(adminCopy.catalog.editor.saved);
    await form.locator("[data-variant-save]").click();
    await expect(page.locator("[data-variant-message]")).toHaveText(c.stockChanged.replace("{stock}", "9"));
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(9);
    // told the current figure, a second save is a decision
    await form.locator("[data-variant-save]").click();
    await expect(page.locator("[data-variant-message]")).toHaveText(c.saved);
    await expect.poll(async () => (await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(15);

    // an untouched field follows the server: a sale, then a weight save writes no stock
    await prisma.variant.update({ where: { id: variant.id }, data: { stock: { decrement: 1 } } });
    await form.getByLabel(`${c.weight} (${variant.sku})`, { exact: true }).fill("120");
    await form.locator("[data-variant-save]").click();
    // the message reads as after the save before, so the row itself is what proves this one landed
    await expect.poll(async () => (await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).weightGrams).toBe(120);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(14);
    await expect(stockField).toHaveValue("14");
  } finally {
    await removeStockFixture(product.id);
    await prisma.user.delete({ where: { id: owner.id } });
  }
});

test("a product sold out since the page opened says so long enough to read, then shows its sold-out state (T5-07)", async ({ page }) => {
  const { product } = await stockFixture(2);
  try {
    await page.goto(`/izdelek/${product.slug}`);
    await dismissCookieBanner(page);
    await prisma.variant.updateMany({ where: { productId: product.id }, data: { stock: 0 } });
    await page.locator("[data-buy-now]").click();
    const notice = page.locator("[data-buy-now-notice]");
    await expect(notice).toHaveText(catalogCopy.card.soldOutNow);
    await page.waitForTimeout(1500);
    await expect(notice).toHaveText(catalogCopy.card.soldOutNow);
    // then the page itself turns to its sold-out state
    await expect(page.getByRole("button", { name: catalogCopy.card.notifyMe }).first()).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain(`/izdelek/${product.slug}`);
  } finally {
    await removeStockFixture(product.id);
  }
});

test("staff return to the admin page they asked for, through the second factor (QA 2026-10-03 w1)", async ({ page }) => {
  const key = randomUUID().slice(0, 8);
  const totp = enrolledTotpFields();
  const owner = await prisma.user.create({ data: {
    email: `qa-povratek-${key}@test.si`, name: "QA Povratek", role: "OWNER", emailVerified: new Date(),
    passwordHash: await bcrypt.hash(password, 4), ...totp.data,
  } });
  try {
    await page.goto("/admin/stranke?q=qa");
    await expect(page).toHaveURL(/\/prijava\?callbackUrl=%2Fadmin%2Fstranke%3Fq%3Dqa$/);
    await dismissCookieBanner(page);
    const form = page.locator("[data-login-form]");
    await form.getByLabel("E-pošta").fill(owner.email);
    await form.getByLabel("Geslo", { exact: true }).fill(password);
    await form.getByRole("button", { name: "Prijava", exact: true }).click();
    await expect(page).toHaveURL(/\/prijava\/2fa\?callbackUrl=%2Fadmin%2Fstranke%3Fq%3Dqa$/);
    const mfa = page.locator("[data-mfa-form]");
    await mfa.getByLabel("Koda").fill(await freshTotpCode(totp.secret));
    await mfa.getByRole("button", { name: "Potrdi prijavo" }).click();
    await page.waitForURL((url) => url.pathname === "/admin/stranke" && url.searchParams.get("q") === "qa");
  } finally {
    await prisma.user.delete({ where: { id: owner.id } });
  }
});

test("on its own policy page the cookie banner is not modal, keeps the page reachable and hands focus back (QA 2026-10-03 V1-02, W1-01, W1-02)", async ({ page }) => {
  await page.goto("/politika-piskotkov");
  const banner = page.locator("[data-cmp-banner]");
  await expect(banner).toBeVisible();
  await expect(banner).not.toHaveAttribute("aria-modal", "true");
  await expect(banner.locator("[data-cmp-policy-link]")).toHaveCount(0);
  await expect(banner.locator("[data-cmp-folded]")).toBeVisible();
  // the page keeps room for the banner, so the last footer link can scroll clear of it
  const reserved = await page.evaluate(() => document.body.style.paddingBottom);
  expect(Number.parseFloat(reserved)).toBeGreaterThan(0);
  // a choice closes it and hands focus back, never to <body>
  await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("skip-link");
  expect(await page.evaluate(() => document.body.style.paddingBottom)).toBe("");
  // elsewhere the banner is still a modal dialog
  const fresh = await page.context().browser()!.newContext();
  try {
    const other = await fresh.newPage();
    await other.goto("/kontakt");
    await expect(other.locator("[data-cmp-banner]")).toHaveAttribute("aria-modal", "true");
  } finally {
    await fresh.close();
  }
});

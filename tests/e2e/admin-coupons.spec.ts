import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { dismissCookieBanner, enrolledTotpFields, loginStaff, prisma } from "./helpers";

/** Phase 7 step 4 (§14.4, §14.9): coupons with the /koda link and QR, review moderation filters. */

const PASSWORD = "CouponAcceptance123!";

test.afterAll(async () => { await prisma.$disconnect(); });

async function staff(role: "MANAGER" | "SUPPORT", key: string) {
  const totp = enrolledTotpFields();
  const user = await prisma.user.create({ data: {
    email: `coupons-${role.toLowerCase()}-${key}@test.si`, name: `Staff ${role}`, role, emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4), ...totp.data,
  } });
  return { ...user, secret: totp.secret };
}

async function addStripsToCart(page: Page) {
  await page.goto("/trgovina");
  await dismissCookieBanner(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
}

async function placeAndPay(page: Page, email: string): Promise<string> {
  await page.goto("/checkout");
  await page.getByLabel("E-pošta").fill(email);
  await page.locator("[data-continue-contact]").click();
  await page.getByLabel("Ime in priimek").fill("Kupec Kupon");
  await page.getByLabel("Ulica").fill("Testna ulica");
  await page.getByLabel("Hišna številka").fill("12");
  await page.getByLabel("Kraj").fill("Ljubljana");
  await page.getByLabel("Poštna številka").fill("1000");
  await page.locator("[data-continue-shipping]").click();
  await page.locator("[data-continue-payment]").click();
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-pay-panel]")).toBeVisible({ timeout: 15_000 });
  await page.locator("[data-test-pay-success]").click();
  await page.waitForURL(/\/potrditev\/NS-/, { timeout: 20_000 });
  return page.locator("[data-order-number]").innerText();
}

test("manager creates a coupon; the /koda link applies it, the order carries it, the QR renders and deactivation stops it", async ({ page, browser }) => {
  const key = randomUUID().slice(0, 8);
  const manager = await staff("MANAGER", key);
  const code = `E2E-${key.toUpperCase()}`;
  const shopper = `kupon-${key}@test.si`;
  try {
    await loginStaff(page, manager.email, PASSWORD, manager.secret);
    await page.goto("/admin/kuponi");
    await expect(page.locator("[data-admin-coupons]")).toBeVisible();
    await expect(page.locator("[data-coupon-row='TEST10']")).toBeVisible();

    // Create: the code is normalised, the type value is required.
    const create = page.locator("[data-coupon-create]");
    await create.getByLabel("Koda", { exact: true }).fill(code.toLowerCase());
    await create.getByLabel("Popust (%)").fill("15");
    await create.getByRole("button", { name: "Ustvari kupon" }).click();
    await page.waitForURL(/\/admin\/kuponi\/[a-z0-9]+$/);
    const couponId = page.url().split("/").pop()!;
    await expect(page.locator(`[data-admin-coupon='${code}']`)).toBeVisible();

    // Limits and the auto-apply link with its QR code.
    const editor = page.locator("[data-coupon-editor]");
    await editor.getByLabel("Najmanjši znesek naročila (centi)").fill("2000");
    await editor.getByLabel("Največ uporab na kupca").fill("1");
    await editor.locator("[data-coupon-save]").click();
    await expect(page.locator("[data-coupon-message]")).toHaveText("Kupon je shranjen.");
    const stored = await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
    expect(stored).toMatchObject({ code, type: "PERCENT", percentOff: 15, minSpendCents: 2000, usageLimitPerCustomer: 1, active: true, eligibility: null, stackable: false });
    await expect(page.locator("[data-coupon-link]")).toHaveText(`http://127.0.0.1:4317/koda/${code}`);
    const qr = await page.request.get(`/admin/kuponi/${couponId}/qr.svg`);
    expect(qr.status()).toBe(200);
    expect(qr.headers()["content-type"]).toContain("image/svg+xml");
    expect(await qr.text()).toContain("<svg");
    await expect(page.locator("[data-coupon-delete]")).toBeVisible();

    // A guest follows the link: discount in the cart, snapshot and redemption on the order.
    const guest = await browser.newContext();
    const shop = await guest.newPage();
    let number: string;
    try {
      await addStripsToCart(shop);
      await shop.goto(`/koda/${code.toLowerCase()}`);
      await expect(shop).toHaveURL(/\/cart$/);
      await expect(shop.locator("[data-active-code]")).toHaveText(code);
      await expect(shop.locator("[data-discount-line]")).toContainText("5,25");
      number = await placeAndPay(shop, shopper);
    } finally {
      await guest.close();
    }
    const order = await prisma.order.findUniqueOrThrow({ where: { number } });
    expect(order).toMatchObject({ couponCode: code, discountCents: 525, subtotalCents: 3499 });
    expect(order.couponSnapshot).toMatchObject({ code, type: "PERCENT", percentOff: 15, discountCents: 525 });
    expect(await prisma.couponRedemption.count({ where: { couponId, orderId: order.id } })).toBe(1);

    // The editor lists the redemption; a used coupon can only be deactivated.
    await page.reload();
    await expect(page.locator(`[data-coupon-redemption='${number}']`)).toBeVisible();
    await expect(page.locator("[data-coupon-delete]")).toHaveCount(0);
    await page.locator("[data-coupon-active]").uncheck();
    await page.locator("[data-coupon-save]").click();
    await expect(page.locator("[data-coupon-message]")).toHaveText("Kupon je shranjen.");
    await page.goto("/admin/kuponi?stanje=neaktivni");
    await expect(page.locator(`[data-coupon-row='${code}'] [data-coupon-usage]`)).toHaveText("1");
    const later = await browser.newContext();
    try {
      const shop2 = await later.newPage();
      await shop2.goto(`/koda/${code}`);
      await expect(shop2).toHaveURL(/\/cart\?koda=neveljavna$/);
    } finally {
      await later.close();
    }

    // An unused coupon can be deleted outright.
    await page.goto("/admin/kuponi");
    await create.getByLabel("Koda", { exact: true }).fill(`${code}-X`);
    await create.locator("#coupon-new-type").selectOption("FREE_SHIPPING");
    await create.getByRole("button", { name: "Ustvari kupon" }).click();
    await page.waitForURL(/\/admin\/kuponi\/[a-z0-9]+$/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-coupon-delete]").click();
    await page.waitForURL(/\/admin\/kuponi$/);
    await expect(page.locator(`[data-coupon-row='${code}-X']`)).toHaveCount(0);
    expect(await prisma.coupon.count({ where: { code: `${code}-X` } })).toBe(0);
  } finally {
    await prisma.order.deleteMany({ where: { email: shopper } });
    await prisma.coupon.deleteMany({ where: { code: { in: [code, `${code}-X`] } } });
    await prisma.user.deleteMany({ where: { id: manager.id } });
  }
});

test("support is refused at the coupon screens and the QR route, but moderates reviews with filters and sees verified purchases", async ({ page }) => {
  const key = randomUUID().slice(0, 8);
  const support = await staff("SUPPORT", key);
  const seeded = await prisma.coupon.findUniqueOrThrow({ where: { code: "TEST10" } });
  const product = await prisma.product.create({ data: {
    title: `Ocene fixture ${key}`, slug: `ocene-${key}`, status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
    variants: { create: { sku: `OCN-${key.toUpperCase()}`, priceCents: 1999, stock: 5 } },
  }, include: { variants: true } });
  const number = `NS-2026-6${randomInt(1000, 9999)}`;
  const order = await prisma.order.create({ data: {
    number, email: `ocene-${key}@test.si`, status: "DELIVERED", paidAt: new Date(), stockDeducted: true, paymentProvider: "test",
    stripePaymentIntentId: `test_pi_${number}`, invoiceNumber: number, invoiceIssuedAt: new Date(), shippingMethod: "GLS — paketna dostava",
    shippingCents: 390, subtotalCents: 1999, totalCents: 2389, vatCents: 431, vatRatePercent: 22,
    shippingAddress: { fullName: "Ocenjevalec Test", line1: "Testna 5", postalCode: "1000", city: "Ljubljana", country: "SI" },
    items: { create: { variantId: product.variants[0].id, title: product.title, sku: `OCN-${key.toUpperCase()}`, unitPriceCents: 1999, quantity: 1 } },
    timeline: [],
  }, include: { items: true } });
  const [unverified, verified] = await Promise.all([
    prisma.review.create({ data: { productId: product.id, rating: 2, title: "Ni zame", text: `Nepreverjeno mnenje ${key}`, status: "PENDING" } }),
    prisma.review.create({ data: {
      productId: product.id, orderItemId: order.items[0].id, rating: 5, title: "Odlično", text: `Preverjeno mnenje ${key}`, status: "PENDING",
      photos: ["/uploads/reviews/0123456789abcdef01234567.webp"],
    } }),
  ]);
  try {
    await loginStaff(page, support.email, PASSWORD, support.secret);
    await page.goto("/admin/kuponi");
    await page.waitForURL(/\/admin\?dostop=zavrnjen/);
    await expect(page.locator("[data-forbidden-notice]")).toBeVisible();
    expect((await page.request.get(`/admin/kuponi/${seeded.id}/qr.svg`)).status()).toBe(404);

    await page.goto(`/admin/ocene?izdelek=${product.slug}`);
    await expect(page.locator("[data-admin-reviews]")).toBeVisible();
    await expect(page.locator("[data-mod-card]")).toHaveCount(2);
    await expect(page.locator(`[data-mod-card='${verified.id}'] [data-review-verified='yes']`)).toContainText(number);
    await expect(page.locator(`[data-mod-card='${unverified.id}'] [data-review-verified='no']`)).toHaveText("Nepreverjeno mnenje");
    await page.goto(`/admin/ocene?izdelek=${product.slug}&ocena=2`);
    await expect(page.locator("[data-mod-card]")).toHaveCount(1);
    await expect(page.locator(`[data-mod-card='${unverified.id}']`)).toBeVisible();
    await page.goto(`/admin/ocene?izdelek=${product.slug}&foto=1`);
    await expect(page.locator("[data-mod-card]")).toHaveCount(1);
    await expect(page.locator(`[data-mod-card='${verified.id}']`)).toBeVisible();

    // The filter form keeps the status and the queue links keep the filters.
    await page.goto(`/admin/ocene?status=PENDING&izdelek=${product.slug}`);
    await page.locator("[data-review-filters] select[name='ocena']").selectOption("5");
    await page.locator("[data-review-filters]").getByRole("button", { name: "Filtriraj" }).click();
    await expect(page).toHaveURL(new RegExp(`status=PENDING.*izdelek=${product.slug}.*ocena=5`));
    await expect(page.locator("[data-mod-card]")).toHaveCount(1);
    await page.locator(`[data-mod-card='${verified.id}'] [data-approve]`).click();
    await expect(page.locator(`[data-mod-card='${verified.id}']`)).toHaveCount(0);
    expect((await prisma.review.findUniqueOrThrow({ where: { id: verified.id } })).status).toBe("PUBLISHED");
    await page.locator("[data-review-status='PUBLISHED']").click();
    await expect(page).toHaveURL(/status=PUBLISHED.*ocena=5/);
    await expect(page.locator(`[data-mod-card='${verified.id}']`)).toBeVisible();
  } finally {
    await prisma.review.deleteMany({ where: { id: { in: [unverified.id, verified.id] } } });
    await prisma.order.deleteMany({ where: { id: order.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.user.deleteMany({ where: { id: support.id } });
  }
});

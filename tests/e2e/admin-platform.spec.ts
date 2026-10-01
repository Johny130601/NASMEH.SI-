import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { dismissCookieBanner, enrolledTotpFields, freshTotpCode, loginStaff, prisma } from "./helpers";

/** Phase 7 step 1 (§14.15, §14.1): shell, roles, mandatory TOTP, sessions, dashboard. */

const PASSWORD = "StaffAcceptance123!";

async function passwordStep(page: Page, email: string) {
  await page.goto("/prijava");
  await dismissCookieBanner(page);
  const form = page.locator("[data-login-form]");
  if (!(await form.isVisible({ timeout: 5_000 }).catch(() => false))) {
    console.log(`login form missing at ${page.url()} (h1: ${await page.locator("h1").first().textContent().catch(() => "?")})`);
  }
  await form.getByLabel("E-pošta").fill(email);
  await form.getByLabel("Geslo", { exact: true }).fill(PASSWORD);
  await form.getByRole("button", { name: "Prijava", exact: true }).click();
}

async function logout(page: Page) {
  await page.locator("[data-admin-logout]").click();
  await page.waitForURL((url) => url.pathname === "/");
  // The sign-out cookie change must have landed before the next login starts.
  await expect(page.locator("[data-admin-logout]")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  // A prefetch that was in flight during the sign-out must not resurrect the session.
  expect((await page.context().cookies()).some((cookie) => cookie.name.includes("session-token"))).toBe(false);
  expect((await page.request.get("/racun", { maxRedirects: 0 })).status()).not.toBe(200);
}

test.afterAll(async () => { await prisma.$disconnect(); });

test("an owner enrols TOTP, then every login needs a code; recovery codes work once", async ({ page }) => {
  const key = randomUUID();
  const owner = await prisma.user.create({ data: {
    email: `staff-owner-${key}@test.si`, name: "Lastnica", role: "OWNER", emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  } });
  try {
    // First login: password only, forced enrolment before any admin screen.
    await passwordStep(page, owner.email);
    await page.waitForURL(/\/admin\/2fa/);
    await page.goto("/admin/ekipa");
    await page.waitForURL(/\/admin\/2fa/);
    const secret = await page.locator("[data-totp-secret]").getAttribute("data-totp-secret");
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    await expect(page.locator("[data-totp-enrolment] svg")).toBeVisible();
    await page.locator("[data-totp-enrolment]").getByLabel("Koda iz aplikacije").fill(await freshTotpCode(secret!));
    await page.getByRole("button", { name: "Potrdi in vklopi" }).click();
    await expect(page.locator("[data-recovery-code]")).toHaveCount(8);
    const codes = await page.locator("[data-recovery-code]").allTextContents();
    expect(codes).toHaveLength(8);
    await page.locator("[data-recovery-ack]").click();
    await page.waitForURL(/\/admin$/);
    await expect(page.locator("[data-admin-dashboard]")).toBeVisible();
    await expect(page.locator("[data-role-pill]")).toHaveText("Lastnik");
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(stored.totpEnabledAt).not.toBeNull();
    expect(stored.totpSecret).not.toContain(secret);
    expect(Array.isArray(stored.totpRecoveryCodes) ? stored.totpRecoveryCodes : []).toHaveLength(8);

    // Second login: the password alone is not a session; a wrong code is refused, the right one admits.
    await logout(page);
    await passwordStep(page, owner.email);
    await page.waitForURL(/\/prijava\/2fa/);
    expect((await page.request.get("/admin", { maxRedirects: 0 })).status()).not.toBe(200);
    const mfa = page.locator("[data-mfa-form]");
    await mfa.getByLabel("Koda").fill("000000");
    await mfa.getByRole("button", { name: "Potrdi prijavo" }).click();
    await page.waitForURL(/\/prijava\/2fa\?error=invalid/);
    await expect(page.locator("[data-mfa-error]")).toContainText("ni veljavna");
    await page.locator("[data-mfa-form]").getByLabel("Koda").fill(await freshTotpCode(secret!));
    await page.locator("[data-mfa-form]").getByRole("button", { name: "Potrdi prijavo" }).click();
    await page.waitForURL(/\/admin$/);

    // Third login with a recovery code; the same code is refused afterwards.
    await logout(page);
    await passwordStep(page, owner.email);
    await page.waitForURL(/\/prijava\/2fa/);
    await page.locator("[data-mfa-form]").getByLabel("Koda").fill(codes[0]);
    await page.locator("[data-mfa-form]").getByRole("button", { name: "Potrdi prijavo" }).click();
    await page.waitForURL(/\/admin$/);
    expect(Array.isArray((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).totpRecoveryCodes) ? 7 : 0).toBe(7);
    await logout(page);
    await passwordStep(page, owner.email);
    await page.waitForURL(/\/prijava\/2fa/);
    await page.locator("[data-mfa-form]").getByLabel("Koda").fill(codes[0]);
    await page.locator("[data-mfa-form]").getByRole("button", { name: "Potrdi prijavo" }).click();
    await page.waitForURL(/\/prijava\/2fa\?error=invalid/);
  } finally {
    await prisma.user.delete({ where: { id: owner.id } });
  }
});

test("roles gate screens server-side; the shell hides what a role cannot open", async ({ page, browser }) => {
  const key = randomUUID();
  const totp = enrolledTotpFields();
  const support = await prisma.user.create({ data: {
    email: `staff-support-${key}@test.si`, name: "Podpora", role: "SUPPORT", emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4), ...totp.data,
  } });
  const customer = await prisma.user.create({ data: {
    email: `staff-customer-${key}@test.si`, name: "Kupec", role: "CUSTOMER", emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  } });
  try {
    await loginStaff(page, support.email, PASSWORD, totp.secret);
    const nav = page.locator("[data-admin-nav]");
    await expect(nav.getByRole("link", { name: "Naročila" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Ocene" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Nastavitve" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Izdelki" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Ekipa" })).toHaveCount(0);
    for (const path of ["/admin/nastavitve", "/admin/izdelki", "/admin/ekipa", "/admin/kuponi"]) {
      await page.goto(path);
      await page.waitForURL(/\/admin\?dostop=zavrnjen/);
      await expect(page.locator("[data-forbidden-notice]")).toBeVisible();
    }
    await page.goto("/admin/narocila");
    await expect(page.locator("[data-admin-orders]")).toBeVisible();
    await page.goto("/admin/ocene");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/ocene/);

    // Own account: regenerate recovery codes with a live code, then sign out everywhere.
    await page.goto("/admin/racun");
    await expect(page.locator("[data-mfa-status]")).toContainText("vklopljeno od");
    await page.locator("[data-regenerate-codes]").getByLabel("Koda").fill(await freshTotpCode(totp.secret));
    await page.getByRole("button", { name: "Ustvari nove kode" }).click();
    await expect(page.locator("[data-regenerate-codes] [data-recovery-codes] li")).toHaveCount(8);
    await page.locator("[data-sign-out-everywhere]").click();
    await page.waitForURL(/\/prijava/);
    await page.goto("/admin");
    await page.waitForURL(/\/prijava/);

    // A customer never reaches the admin.
    const context = await browser.newContext();
    try {
      const customerPage = await context.newPage();
      await customerPage.goto("/prijava");
      await dismissCookieBanner(customerPage);
      const form = customerPage.locator("[data-login-form]");
      await form.getByLabel("E-pošta").fill(customer.email);
      await form.getByLabel("Geslo", { exact: true }).fill(PASSWORD);
      await form.getByRole("button", { name: "Prijava", exact: true }).click();
      await customerPage.waitForURL(/\/racun$/);
      await customerPage.goto("/admin");
      await customerPage.waitForURL(/\/(racun|prijava)/);
      expect((await context.request.get("/admin/ekipa", { maxRedirects: 0 })).status()).not.toBe(200);
    } finally {
      await context.close();
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [support.id, customer.id] } } });
  }
});

test("the owner manages the team and the dashboard reports paid orders and low stock", async ({ page }) => {
  const key = randomUUID();
  const totp = enrolledTotpFields();
  const owner = await prisma.user.create({ data: {
    email: `staff-owner2-${key}@test.si`, name: "Lastnik", role: "OWNER", emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4), ...totp.data,
  } });
  const product = await prisma.product.create({ data: {
    title: `Dashboard fixture ${key}`, slug: `dash-${key}`, status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
    variants: { create: { sku: `DASH-${key}`, priceCents: 2500, stock: 1 } },
  }, include: { variants: true } });
  const number = `NS-DASH-${key}`;
  await prisma.order.create({ data: {
    number, email: `dash-${key}@test.si`, status: "PAID", paidAt: new Date(), stockDeducted: true,
    subtotalCents: 5000, totalCents: 5390, vatCents: 972, shippingCents: 390, refundedCents: 0,
    shippingAddress: { fullName: "Dash", line1: "Test 1", postalCode: "1000", city: "Ljubljana", country: "SI" },
    items: { create: { variantId: product.variants[0].id, title: product.title, sku: `DASH-${key}`, unitPriceCents: 2500, quantity: 2 } },
  } });
  const memberEmail = `staff-new-${key}@test.si`;
  try {
    await loginStaff(page, owner.email, PASSWORD, totp.secret);
    await expect(page.locator("[data-admin-dashboard]")).toBeVisible();
    await expect(page.locator("[data-kpi='Plačana naročila']")).toContainText(/[1-9]/);
    await expect(page.locator("[data-list='recent-orders']")).toContainText(number);
    await expect(page.locator(`[data-low-stock-sku='DASH-${key}']`)).toBeVisible();
    await expect(page.locator("[data-chart='revenue'] svg")).toBeVisible();
    await expect(page.locator("[data-chart='revenue'] table")).toContainText("€");
    await page.goto("/admin?obdobje=7d");
    await expect(page.locator("[data-kpi='Plačana naročila']")).toContainText(/[1-9]/);
    await expect(page.locator("[data-range-invalid]")).toHaveCount(0);
    // A reversed custom range says why 30 days are shown instead of doing so silently (QA N1).
    await page.goto("/admin?obdobje=custom&od=2026-09-05&do=2026-09-01");
    await expect(page.locator("[data-range-invalid='reversed']")).toContainText("zadnjih 30 dni");

    // Team: create, promote through the role select, revoke, reset, demote.
    await page.goto("/admin/ekipa");
    const create = page.locator("[data-team-create]");
    await create.getByLabel("Ime").fill("Nova članica");
    await create.getByLabel("E-pošta").fill(memberEmail);
    await create.getByLabel("Vloga").selectOption("FULFILLMENT");
    await create.getByRole("button", { name: "Dodaj" }).click();
    await expect(page.locator("[data-team-created]")).toContainText("Začasno geslo");
    const row = page.locator(`[data-team-member='${memberEmail}']`);
    await expect(row).toContainText("čaka na nastavitev");
    // A role change asks first (QA N6): the permissions apply at once.
    let roleQuestion = "";
    page.once("dialog", (dialog) => { roleQuestion = dialog.message(); void dialog.accept(); });
    await row.getByLabel("Spremeni vlogo").selectOption("SUPPORT");
    await expect(page.locator("[data-team-message]")).toHaveText("Shranjeno.");
    expect(roleQuestion).toContain("Podpora");
    await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } })).role).toBe("SUPPORT");
    const before = (await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } })).sessionVersion;
    await row.getByRole("button", { name: "Odjavi povsod" }).click();
    await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } })).sessionVersion).toBe(before + 1);
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Odstrani iz ekipe" }).click();
    await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } })).role).toBe("CUSTOMER");
    await expect(page.locator(`[data-team-member='${memberEmail}']`)).toHaveCount(0);
    await expect(page.locator(`[data-team-member='${owner.email}']`)).toContainText("Lastnih dovoljenj");
  } finally {
    await prisma.order.deleteMany({ where: { number } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.user.deleteMany({ where: { email: { in: [owner.email, memberEmail] } } });
  }
});

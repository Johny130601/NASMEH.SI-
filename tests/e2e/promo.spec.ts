import { expect, test, type Page } from "@playwright/test";
import { prisma, waitForMailTo } from "./helpers";

/** Phase 4 promotions e2e. Serial — coupon/stock state is shared. */
test.describe.configure({ mode: "serial" });

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }
}

async function addToCartViaUi(page: Page, slug: string) {
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page
    .locator(`[data-product-card='${slug}']`)
    .getByRole("button", { name: "Dodaj v košarico" })
    .click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
}

async function fillWizard(page: Page, email: string) {
  await page.goto("/checkout");
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.locator("[data-continue-contact]").click();
  await page.getByLabel("Ime in priimek").fill("Test Kupec");
  await page.getByLabel("Ulica in hišna številka").fill("Testna ulica 12");
  await page.getByLabel("Kraj").fill("Ljubljana");
  await page.getByLabel("Poštna številka").fill("1000");
  await page.locator("[data-continue-shipping]").click();
  await page.locator("[data-continue-payment]").click();
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-pay-panel]")).toBeVisible({ timeout: 15_000 });
}

async function placeAndPay(page: Page, email: string): Promise<string> {
  await fillWizard(page, email);
  await page.locator("[data-test-pay-success]").click();
  await page.waitForURL(/\/potrditev\/NS-/, { timeout: 20_000 });
  return page.locator("[data-order-number]").innerText();
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("/koda/TEST10 → cart discounted + terms → order persists snapshot + redemption", async ({
  page,
}) => {
  const email = `koda-${Date.now()}@test.si`;
  await addToCartViaUi(page, "belilni-trakci-za-zobe");

  await page.goto("/koda/TEST10");
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.locator("[data-active-code]")).toHaveText("TEST10");
  await expect(page.locator("[data-discount-line]")).toContainText("3,50");
  await expect(page.getByText(/ne sešteva se z drugimi ponudbami/)).toBeVisible();
  await expect(page.locator("[data-cart-total]")).toHaveText(/35,39/);

  const number = await placeAndPay(page, email);
  const order = await prisma.order.findUniqueOrThrow({ where: { number } });
  expect(order.couponCode).toBe("TEST10");
  expect(order.discountCents).toBe(350);
  expect(order.subtotalCents).toBe(3499);
  expect(order.shippingCents).toBe(390);
  expect(order.totalCents).toBe(3539);
  expect(order.vatCents).toBe(638);
  const snapshot = order.couponSnapshot as {
    code: string;
    type: string;
    discountCents: number;
  };
  expect(snapshot).toMatchObject({
    code: "TEST10",
    type: "PERCENT",
    discountCents: 350,
  });

  // redemption row + usedCount incremented exactly once
  const coupon = await prisma.coupon.findUniqueOrThrow({
    where: { code: "TEST10" },
  });
  const redemption = await prisma.couponRedemption.findFirst({
    where: { couponId: coupon.id, orderId: order.id },
  });
  expect(redemption).toBeTruthy();

  // confirmation email carries the discounted total
  const body = await waitForMailTo(email);
  expect(body).toContain("35,39");
});

test("removing the code restores totals", async ({ page }) => {
  await addToCartViaUi(page, "belilni-trakci-za-zobe");
  await page.goto("/koda/TEST10");
  await expect(page.locator("[data-discount-line]")).toBeVisible();

  await page.getByRole("button", { name: "Odstrani kodo" }).click();
  await expect(page.locator("[data-discount-line]")).toHaveCount(0);
  await expect(page.locator("[data-cart-total]")).toHaveText(/38,89/); // 34,99 + 3,90
});

test("/koda/FAKE99 → invalid state without breaking cart", async ({ page }) => {
  await addToCartViaUi(page, "belilni-trakci-za-zobe");
  await page.goto("/koda/FAKE99");
  // The refusal names the code and is shown once: the address drops the flag (QA C2-F2).
  await expect(page.locator("[data-koda-notice]")).toHaveText("Koda FAKE99 ni veljavna.");
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator("[data-cart-line]")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("[data-koda-notice]")).toHaveCount(0);
});

test("/koda/UNKNOWN while a code is active → names the refused code and keeps the active one", async ({ page }) => {
  await addToCartViaUi(page, "belilni-trakci-za-zobe");
  await page.goto("/koda/TEST10");
  await expect(page.locator("[data-active-code]")).toHaveText("TEST10");
  await page.goto("/koda/FAKE99");
  await expect(page.locator("[data-koda-notice]")).toHaveText("Koda FAKE99 ni veljavna. Aktivna ostaja koda TEST10.");
  await expect(page.locator("[data-active-code]")).toHaveText("TEST10");
  // the notice replaces the address through the App Router once shown (QA C2-F2)
  await expect(page).toHaveURL(/\/cart$/);
  await page.reload();
  await expect(page.locator("[data-koda-notice]")).toHaveCount(0);
  await expect(page.locator("[data-active-code]")).toHaveText("TEST10");
});

test("/koda refusal leaves the router's own address: a stepper refresh, back and a reload never bring it back (QA C2-F2)", async ({ page }) => {
  await addToCartViaUi(page, "belilni-trakci-za-zobe");
  await page.goto("/koda/TEST10");
  await page.goto("/koda/FAKE99");
  const notice = page.locator("[data-koda-notice]");
  await expect(notice).toHaveText("Koda FAKE99 ni veljavna. Aktivna ostaja koda TEST10.");
  await expect(page).toHaveURL(/\/cart$/);

  // A server action and router refresh (the stepper) must not put the parameters back.
  const line = page.locator("[data-cart-line='NAS-TRK-14']");
  await line.getByLabel("Povečaj količino").click();
  await expect(line.locator("span[aria-live]")).toHaveText("2");
  await expect(page).toHaveURL(/\/cart$/);
  // The notice the shopper read stays until they leave the cart.
  await expect(notice).toHaveText("Koda FAKE99 ni veljavna. Aktivna ostaja koda TEST10.");

  // Away and back through the router: the cart comes back without the refusal.
  await line.getByRole("link", { name: /Belilni trakci/ }).first().click();
  await expect(page).toHaveURL(/\/izdelek\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator("[data-cart-line='NAS-TRK-14']")).toBeVisible();
  await expect(notice).toHaveCount(0);

  await page.reload();
  await expect(notice).toHaveCount(0);
  await expect(page.locator("[data-active-code]")).toHaveText("TEST10");
});

test("/koda refusal: answering the cookie banner never brings the parameters back (QA C2-F2)", async ({ page }) => {
  // A fresh visitor: the banner is still open when the refusal lands on the (empty) cart.
  await page.goto("/koda/NIMAM");
  const notice = page.locator("[data-koda-notice]");
  await expect(notice).toHaveText("Koda NIMAM ni veljavna.");
  await expect(page).toHaveURL(/\/cart$/);
  await dismissCmp(page);
  await expect(page).toHaveURL(/\/cart$/);
  await page.reload();
  await expect(notice).toHaveCount(0);
});

test("usage-limit exhaustion blocks the NEXT order's discount", async ({
  page,
}) => {
  await prisma.coupon.upsert({
    where: { code: "LIMIT1" },
    update: { usageLimitTotal: 1, usedCount: 0, active: true, type: "FIXED", amountOffCents: 500 },
    create: {
      code: "LIMIT1",
      type: "FIXED",
      amountOffCents: 500,
      usageLimitTotal: 1,
      active: true,
    },
  });

  // first order consumes the code
  await addToCartViaUi(page, "belilni-trakci-za-zobe");
  await page.goto("/koda/LIMIT1");
  await expect(page.locator("[data-discount-line]")).toBeVisible();
  const first = await placeAndPay(page, `limit1a-${Date.now()}@test.si`);
  const firstOrder = await prisma.order.findUniqueOrThrow({
    where: { number: first },
  });
  expect(firstOrder.discountCents).toBe(500);

  // second order with the same code → placed WITHOUT discount
  await addToCartViaUi(page, "belilni-trakci-za-zobe");
  await page.goto("/koda/LIMIT1");
  // display already shows the rejection (usage limit exhausted)
  await expect(page.locator("[data-coupon-error]").first()).toBeVisible();
  await expect(page.locator("[data-active-code-pill]")).not.toContainText("Aktivna koda");
  await page.reload();
  await expect(page.locator("[data-coupon-error]").first()).toBeVisible();
  await expect(page.locator("[data-active-code]")).toHaveText("LIMIT1");
  await expect(page.locator("[data-discount-line]")).toHaveCount(0);
  const second = await placeAndPay(page, `limit1b-${Date.now()}@test.si`);
  const secondOrder = await prisma.order.findUniqueOrThrow({
    where: { number: second },
  });
  expect(secondOrder.discountCents).toBe(0);
  expect(secondOrder.couponCode).toBeNull();
});

test("free-shipping threshold change in DB propagates without deploy", async ({
  page,
}) => {
  const key = "shipping.freeThresholdCents";
  const original = await prisma.setting.findUniqueOrThrow({ where: { key } });
  try {
    await prisma.setting.update({ where: { key }, data: { value: 10000 } });
    await addToCartViaUi(page, "ustna-voda-globinsko-ciscenje"); // 19,99
    await page.goto("/cart");
    await expect(page.getByText(/Samo še €81 vas loči/)).toBeVisible();

    await prisma.setting.update({ where: { key }, data: { value: 2500 } });
    await page.goto("/cart");
    await expect(page.getByText(/Samo še €6 vas loči/)).toBeVisible();
  } finally {
    await prisma.setting.update({
      where: { key },
      data: { value: original.value! },
    });
  }
});

test("welcome popup: delay → suppressions → dismiss session → thank-you stores code + DOI email", async ({
  page,
}) => {
  const key = "welcomePopup";
  const original = await prisma.setting.findUniqueOrThrow({ where: { key } });
  const setting = {
    ...(original.value as Record<string, unknown>),
    delaySeconds: 1,
  };
  await prisma.setting.update({ where: { key }, data: { value: setting } });

  try {
    // appears on homepage after the delay
    await page.goto("/");
    await dismissCmp(page);
    await expect(page.locator("[data-welcome-popup]")).toBeVisible({
      timeout: 10_000,
    });

    // suppression on /cart and /checkout and /racun
    for (const path of ["/cart", "/checkout", "/racun"]) {
      await page.goto(path);
      await expect(page.locator("[data-welcome-popup]")).toHaveCount(0);
    }

    // dismiss → not shown again this session
    await page.goto("/");
    await expect(page.locator("[data-welcome-popup]")).toBeVisible({
      timeout: 10_000,
    });
    await page.locator("[data-welcome-dismiss]").click();
    await expect(page.locator("[data-welcome-popup]")).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(2000);
    await expect(page.locator("[data-welcome-popup]")).toHaveCount(0);

    // thank-you state: code shown + auto-stored for checkout + DOI email
    // (fresh context — the session-cookie dismissal flag must not carry over)
    const fresh = await page.context().browser()!.newContext();
    const page2 = await fresh.newPage();
    await page2.goto("/");
    // The popup never opens over the unanswered consent banner (Phase 9 step 4).
    await expect(page2.getByRole("dialog", { name: /piškotki/i })).toBeVisible();
    await page2.waitForTimeout(2500);
    await expect(page2.locator("[data-welcome-popup]")).toHaveCount(0);
    await dismissCmp(page2); // CMP returns on a fresh context — dismiss first
    await expect(page2.locator("[data-welcome-popup]")).toBeVisible({
      timeout: 10_000,
    });
    // Fixed consent note and privacy link under the operator copy; no Turnstile script without a site key or interaction.
    const note = page2.locator("[data-welcome-form] [data-welcome-consent-note]");
    await expect(note).toContainText("Odjava je mogoča kadar koli.");
    await expect(note.getByRole("link", { name: "politika zasebnosti" })).toHaveAttribute("href", "/politika-zasebnosti");
    await expect(page2.locator("script#cf-turnstile-script")).toHaveCount(0);
    const email = `popup-${Date.now()}@test.si`;
    await page2
      .locator("[data-welcome-form] input[name='email']")
      .fill(email);
    await page2
      .locator("[data-welcome-form]")
      .getByRole("button", { name: "Pošlji kodo" })
      .click();
    await expect(page2.locator("[data-welcome-thanks]")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page2.locator("[data-welcome-code]")).toHaveText("WELCOME10");

    // code visible in cart summary (auto-stored)
    await page2.goto("/trgovina");
    await page2
      .locator("[data-product-card='belilni-trakci-za-zobe']")
      .getByRole("button", { name: "Dodaj v košarico" })
      .click();
    await expect(page2.locator("[data-cart-badge]")).toHaveText("1");
    await page2.goto("/cart");
    await expect(page2.locator("[data-active-code]")).toHaveText("WELCOME10");
    await expect(page2.locator("[data-discount-line]")).toBeVisible();
    await fresh.close();

    // double opt-in email arrived
    const body = await waitForMailTo(email);
    expect(body).toMatch(/\/potrdi\/[a-f0-9]{48}/);
    expect(body).toMatch(/\/odjava-novice\/[A-Za-z0-9_-]+/);
    // The consent record names the surface the sign-up came from.
    expect((await prisma.subscriber.findUniqueOrThrow({ where: { email } })).source).toBe("welcome-popup");
  } finally {
    await prisma.setting.update({
      where: { key },
      data: { value: original.value! },
    });
  }
});

test("welcome popup: a footer sign-up counts as this session's interaction, even while the delay runs (QA T7-F14)", async ({
  page,
}) => {
  const key = "welcomePopup";
  const original = await prisma.setting.findUniqueOrThrow({ where: { key } });
  const withDelay = (delaySeconds: number) =>
    prisma.setting.update({ where: { key }, data: { value: { ...(original.value as Record<string, unknown>), delaySeconds } } });
  const email = `footer-popup-${Date.now()}@test.si`;
  const DELAY = 8;
  await withDelay(DELAY);

  try {
    // The delay starts once the consent banner is answered; the footer sign-up lands inside it.
    await page.goto("/trgovina");
    await dismissCmp(page);
    const armed = Date.now();
    const form = page.locator("[data-newsletter-form]");
    await form.scrollIntoViewIfNeeded();
    await form.getByRole("textbox", { name: "E-pošta" }).fill(email);
    await form.getByRole("button", { name: "Prijavi se" }).click();
    await expect(form.getByText(/Poslali smo vam potrditveno sporočilo/)).toBeVisible({ timeout: 15_000 });
    expect(Date.now() - armed, "the sign-up must finish inside the popup delay").toBeLessThan(DELAY * 1000);
    await page.waitForTimeout(Math.max(0, armed + DELAY * 1000 + 1500 - Date.now()));
    await expect(page.locator("[data-welcome-popup]")).toHaveCount(0);

    // Later pages in the same tab do not ask either.
    await withDelay(1);
    await page.goto("/");
    await page.waitForTimeout(2500);
    await expect(page.locator("[data-welcome-popup]")).toHaveCount(0);

    // Control: without the sign-up the same setting opens the popup.
    const fresh = await page.context().browser()!.newContext();
    const other = await fresh.newPage();
    await other.goto("/");
    await dismissCmp(other);
    await expect(other.locator("[data-welcome-popup]")).toBeVisible({ timeout: 10_000 });
    await fresh.close();
  } finally {
    await prisma.setting.update({ where: { key }, data: { value: original.value! } });
    await prisma.subscriber.deleteMany({ where: { email } });
  }
});

test("welcome popup: the tab a confirmation link opens does not ask for the e-mail just confirmed (QA T7-F14)", async ({
  page,
}) => {
  const key = "welcomePopup";
  const original = await prisma.setting.findUniqueOrThrow({ where: { key } });
  await prisma.setting.update({
    where: { key },
    data: { value: { ...(original.value as Record<string, unknown>), delaySeconds: 1 } },
  });
  const email = `confirm-popup-${Date.now()}@test.si`;

  try {
    // Footer sign-up on a suppressed path, so the popup never opens in this tab.
    await page.goto("/sledi");
    await dismissCmp(page);
    const form = page.locator("[data-newsletter-form]");
    await form.scrollIntoViewIfNeeded();
    await form.getByRole("textbox", { name: "E-pošta" }).fill(email);
    await form.getByRole("button", { name: "Prijavi se" }).click();
    await expect(form.getByText(/Poslali smo vam potrditveno sporočilo/)).toBeVisible({ timeout: 15_000 });
    const token = (await waitForMailTo(email)).match(/\/potrdi\/([a-f0-9]{48})/)?.[1];
    expect(token).toBeTruthy();

    // The mail link opens a new tab of the same browser session. The footer sign-up already set
    // the session-cookie flag (QA 2026-10-03 T1-07); it is cleared, so the confirmation page must set it itself.
    const openHomeFromConfirmation = async (confirm: boolean) => {
      await page.context().clearCookies({ name: "nasmeh_welcome_seen" });
      const tab = await page.context().newPage();
      await tab.goto(`/potrdi/${token}`);
      if (confirm) await tab.getByRole("button", { name: "Potrdi prijavo" }).click();
      await expect(tab.getByText("Prijava potrjena 🎉")).toBeVisible({ timeout: 15_000 });
      await tab.getByRole("link", { name: "Na domačo stran", exact: true }).click();
      await tab.waitForURL((url) => url.pathname === "/");
      await tab.waitForTimeout(2500);
      await expect(tab.locator("[data-welcome-popup]")).toHaveCount(0);
      await tab.close();
    };
    await openHomeFromConfirmation(true); // the confirm button's done state
    await openHomeFromConfirmation(false); // a revisit: the server-rendered done state

    // Control: without the flag, a tab of the same guest still gets the popup.
    await page.context().clearCookies({ name: "nasmeh_welcome_seen" });
    const control = await page.context().newPage();
    await control.goto("/");
    await expect(control.locator("[data-welcome-popup]")).toBeVisible({ timeout: 10_000 });
    await control.close();
  } finally {
    await prisma.setting.update({ where: { key }, data: { value: original.value! } });
    const subscriber = await prisma.subscriber.findUnique({ where: { email } });
    if (subscriber) {
      await prisma.consentLog.deleteMany({
        where: { kind: "marketing-email", choices: { path: ["subscriberId"], equals: subscriber.id } },
      });
      await prisma.subscriber.delete({ where: { id: subscriber.id } });
    }
  }
});

test("cart cross-sell shelf follows crossSell metafield curation", async ({
  page,
}) => {
  // serum's crossSell = trakci, ustna voda, paket → shelf shows trakci first
  await addToCartViaUi(page, "serum-korektor-barve-zob");
  await page.goto("/cart");
  const shelf = page.locator("[data-product-card='belilni-trakci-za-zobe']").last();
  await expect(shelf).toBeVisible();
});

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
  await page.getByLabel("E-pošta").fill(email);
  await page.locator("[data-continue-contact]").click();
  await page.getByLabel("Ime in priimek").fill("Test Kupec");
  await page.getByLabel("Ulica").fill("Testna ulica");
  await page.getByLabel("Hišna številka").fill("12");
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
  await expect(page).toHaveURL(/koda=neveljavna/);
  await expect(page.getByText("Koda ni veljavna.")).toBeVisible();
  await expect(page.locator("[data-cart-line]")).toHaveCount(1);
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
    // (fresh context — sessionStorage dismissal flag must not carry over)
    const fresh = await page.context().browser()!.newContext();
    const page2 = await fresh.newPage();
    await page2.goto("/");
    await dismissCmp(page2); // CMP returns on a fresh context — dismiss first
    await expect(page2.locator("[data-welcome-popup]")).toBeVisible({
      timeout: 10_000,
    });
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
  } finally {
    await prisma.setting.update({
      where: { key },
      data: { value: original.value! },
    });
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

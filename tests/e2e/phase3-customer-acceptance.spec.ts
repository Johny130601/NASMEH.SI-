import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { enrolledTotpFields, loginStaff, MAILPIT_URL, prisma } from "./helpers";

test.use({ trace: "retain-on-failure" });

// Phase 3 acceptance: assert the required behavior, without marking known
// defects as expected failures. Fixtures belong only to these tests.
async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible()) {
    await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
    await expect(banner).toBeHidden();
  }
}

// Since the bundle builder (2026-09-23) a clean add from the buy box no longer confirms in
// place: the shopper continues to the builder for that product (pdp.spec). The header badge
// counts the units the cart holds and is the proof the line landed.
async function addFromBuyBox(page: Page, slug: string, expectedBadge: string) {
  await page.goto(`/izdelek/${slug}`);
  await dismissCmp(page);
  await page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico", exact: true }).click();
  await expect(page).toHaveURL(`/sestavi-paket?izdelek=${slug}`);
  await expect(page.locator(`[data-bundle-builder='${slug}']`)).toBeVisible();
  await expect(page.locator("[data-cart-badge]")).toHaveText(expectedBadge);
}

async function guestOrder() {
  const key = randomUUID();
  return prisma.order.create({
    data: {
      number: `NS-AUDIT-${key}`,
      email: `phase3-access-${key}@test.si`,
      status: "PAID",
      subtotalCents: 1999,
      shippingCents: 390,
      totalCents: 2389,
      vatCents: 431,
      shippingAddress: { fullName: "Acceptance Fixture" },
      items: {
        create: {
          title: `Private order item ${key}`,
          sku: `AUDIT-${key}`,
          unitPriceCents: 1999,
          quantity: 1,
        },
      },
    },
    include: { items: true },
  });
}

test.afterAll(async () => prisma.$disconnect());

test("confirmation does not disclose another guest's order to an anonymous visitor", async ({ request }) => {
  const order = await guestOrder();
  try {
    // This request has neither the purchaser's cookie nor an access token.
    const response = await request.get(`/potrditev/${order.number}`);
    const html = await response.text();
    expect(html.includes(order.items[0].title), "Private order items must require proof of access").toBe(false);
  } finally {
    await prisma.order.delete({ where: { id: order.id } });
  }
});

test("an unrelated anonymous visitor cannot claim a guest order by choosing a password", async ({ page }) => {
  const order = await guestOrder();
  try {
    await page.goto(`/potrditev/${order.number}`);
    await dismissCmp(page);
    const form = page.locator("[data-create-account]");
    if (await form.isVisible()) {
      await form.getByLabel(/Geslo/).fill("Acceptance123!");
      await Promise.all([
        page.waitForResponse((response) =>
          response.request().method() === "POST" &&
          response.request().postData()?.includes("Acceptance123!") === true,
        ),
        form.getByRole("button", { name: "Ustvari račun", exact: true }).click(),
      ]);
    }
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect.soft(updated.userId, "An unrelated browser must not become the order owner").toBeNull();
    const created = await prisma.user.findUnique({ where: { email: order.email } });
    expect(created, "Account creation must require purchase/email ownership proof").toBeNull();
  } finally {
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.deleteMany({ where: { email: order.email } });
  }
});

test("adding the same item twice while signed in increments the stored quantity", async ({ page }) => {
  const key = randomUUID();
  const password = "Acceptance123!";
  const user = await prisma.user.create({
    data: {
      email: `phase3-cart-${key}@test.si`,
      passwordHash: await bcrypt.hash(password, 10),
      emailVerified: new Date(),
      role: "CUSTOMER",
    },
  });
  try {
    await page.goto("/prijava");
    await dismissCmp(page);
    const form = page.locator("[data-login-form]");
    await form.getByLabel("E-pošta").fill(user.email);
    await form.getByLabel("Geslo", { exact: true }).fill(password);
    await form.getByRole("button", { name: "Prijava", exact: true }).click();
    await page.waitForURL(/\/racun/);

    // A repeat add of one unit under the cap is a clean add too, so it hands off again;
    // the badge must climb with each add.
    for (let index = 0; index < 2; index++) {
      await addFromBuyBox(page, "belilni-trakci-za-zobe", String(index + 1));
    }
    const cart = await prisma.cart.findUniqueOrThrow({
      where: { userId: user.id }, include: { items: true },
    });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);
  } finally {
    await prisma.cart.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("confirmation permits its signed-in owner and admin, but denies another customer", async ({ browser }) => {
  const order = await guestOrder();
  const password = "Acceptance123!";
  const key = randomUUID();
  const staffTotp = enrolledTotpFields();
  const users = await Promise.all(([
    { tag: "owner", role: "CUSTOMER" },
    { tag: "other", role: "CUSTOMER" },
    { tag: "admin", role: "OWNER" },
  ] as const).map(async ({ tag, role }) => prisma.user.create({
    data: { email: `p3-${tag}-${key}@test.si`, role, passwordHash: await bcrypt.hash(password, 10), emailVerified: new Date(), ...(role === "OWNER" ? staffTotp.data : {}) },
  })));
  await prisma.order.update({ where: { id: order.id }, data: { userId: users[0].id } });
  try {
    for (const [index, user] of users.entries()) {
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:4317" });
      try {
        const page = await context.newPage();
        if (user.role === "OWNER") {
          // Staff sign in through the mandatory second factor and land in the admin.
          await loginStaff(page, user.email, password, staffTotp.secret);
        } else {
          await page.goto("/prijava");
          await dismissCmp(page);
          const form = page.locator("[data-login-form]");
          await form.getByLabel("E-pošta").fill(user.email);
          await form.getByLabel("Geslo", { exact: true }).fill(password);
          await form.getByRole("button", { name: "Prijava", exact: true }).click();
          await page.waitForURL(/\/racun/);
        }
        const response = await context.request.get(`/potrditev/${order.number}`);
        expect((await response.text()).includes(order.items[0].title)).toBe(index !== 1);
      } finally {
        await context.close();
      }
    }
  } finally {
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  }
});

test("guest purchaser receives private confirmation, can verify an account, and keeps a new cart on revisit", async ({ page, browser }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(15_000);
  const key = randomUUID();
  const email = `p3-purchaser-${key}@test.si`;
  const product = await prisma.product.create({
    data: {
      title: `Private purchase ${key}`, slug: `p3-purchase-${key}`, status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
      variants: { create: { sku: `P3-${key}`, priceCents: 5000, stock: 3 } },
    },
  });
  try {
    await addFromBuyBox(page, product.slug, "1");
    await page.goto("/checkout");
    await page.getByLabel("E-pošta", { exact: true }).fill(email);
    await page.locator("[data-continue-contact]").click();
    await page.getByLabel("Ime in priimek").fill("Test Kupec");
    await page.getByLabel("Ulica", { exact: true }).fill("Testna ulica");
    await page.getByLabel("Hišna številka").fill("12");
    await page.getByLabel("Kraj", { exact: true }).fill("Ljubljana");
    await page.getByLabel("Poštna številka").fill("1000");
    await page.locator("[data-continue-shipping]").click();
    await page.locator("[data-continue-payment]").click();
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-pay-panel]")).toBeVisible({ timeout: 15_000 });
    const receipt = (await page.context().cookies()).find(cookie => cookie.name.startsWith("nasmeh_order_"));
    expect(receipt?.httpOnly).toBe(true);
    expect(receipt?.sameSite).toBe("Lax");

    // Leaving checkout must not strand a legitimate purchaser's pending order.
    const unpaid = await prisma.order.findFirstOrThrow({ where: { email } });
    // Right after a submitted payment the page waits for the provider's confirmation and polls for it.
    await page.goto(`/potrditev/${unpaid.number}?placilo=oddano`);
    await expect(page.getByRole("heading", { name: "Čakamo na potrditev plačila" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Osveži stanje" })).toBeVisible();
    // Opened to pay (the account's "Dokončaj plačilo" links land here), the payment leads and
    // neither the heading nor the tab claims a confirmation (QA 2026-09-30).
    await page.goto(`/potrditev/${unpaid.number}`);
    await expect(page.getByRole("heading", { name: "Dokončajte plačilo" })).toBeVisible();
    await expect(page).toHaveTitle(/^Dokončajte plačilo/);
    await expect(page.getByRole("button", { name: "Osveži stanje" })).toHaveCount(0);
    await page.locator("[data-resume-payment]").click();
    await expect(page.locator("[data-pay-panel]")).toBeVisible();
    await page.locator("[data-test-pay-success]").click();
    await page.waitForURL(/\/potrditev\/NS-/);
    const number = await page.locator("[data-order-number]").innerText();
    await expect(page.getByRole("heading", { name: "Naročilo je potrjeno 🎉" })).toBeVisible();
    await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { number } })).cartClearedAt !== null).toBe(true);

    const stranger = await browser.newContext({ baseURL: "http://127.0.0.1:4317" });
    try {
      const response = await stranger.request.get(`/potrditev/${number}`);
      expect((await response.text()).includes(product.title)).toBe(false);
    } finally {
      await stranger.close();
    }

    // The old confirmation must never erase a cart assembled after purchase.
    await addFromBuyBox(page, product.slug, "1");
    const newCart = (await page.context().cookies()).find(cookie => cookie.name === "nasmeh_cart")?.value;
    await page.goto(`/potrditev/${number}`);
    const accountForm = page.locator("[data-create-account]");
    await accountForm.getByLabel(/Geslo/).fill("Acceptance123!");
    await accountForm.getByRole("button", { name: "Ustvari račun", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Poslali smo vam povezavo" })).toBeVisible();
    expect((await page.context().cookies()).find(cookie => cookie.name === "nasmeh_cart")?.value).toBe(newCart);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBeNull();
    expect((await prisma.order.findUniqueOrThrow({ where: { number } })).userId).toBe(user.id);
    expect(await prisma.consentLog.findFirst({ where: { userId: user.id, kind: "marketing-register" } })).toMatchObject({ choices: expect.objectContaining({ marketing: false }) });

    const messages = await (await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`, { signal: AbortSignal.timeout(10_000) })).json() as {
      messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
    };
    const verification = messages.messages.find(message => message.Subject.includes("Potrdite svoj račun") && message.To.some(to => to.Address === email));
    expect(verification).toBeTruthy();
    const mail = await (await fetch(`${MAILPIT_URL}/api/v1/message/${verification!.ID}`, { signal: AbortSignal.timeout(10_000) })).json() as { Text?: string; HTML?: string };
    const token = `${mail.Text ?? ""}\n${mail.HTML ?? ""}`.match(/\/potrdi-racun\/([a-f0-9]{64})/)?.[1];
    expect(token).toBeTruthy();
    await page.goto(`/potrdi-racun/${token}`);
    await page.getByRole("button", { name: "Potrdi e-pošto", exact: true }).click();
    await expect(page.getByText("Račun je aktiven 🎉")).toBeVisible();
    await page.goto("/prijava");
    const login = page.locator("[data-login-form]");
    await login.getByLabel("E-pošta").fill(email);
    await login.getByLabel("Geslo", { exact: true }).fill("Acceptance123!");
    await login.getByRole("button", { name: "Prijava", exact: true }).click();
    await page.waitForURL(/\/racun/);
  } finally {
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.order.deleteMany({ where: { email } });
    await prisma.abandonedCheckout.deleteMany({ where: { email } });
    if (user) {
      await prisma.consentLog.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.product.delete({ where: { id: product.id } });
  }
});

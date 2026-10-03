import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import {
  prisma,
  signWebhook,
  waitForMailMessage,
  WEBHOOK_SECRETS,
} from "./helpers";

/** Full purchase flow e2e (§8) via the test driver. Serial — shared stock state. */
test.describe.configure({ mode: "serial" });

const BASE = "http://127.0.0.1:4317";

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }
}

async function addToCartViaUi(page: Page, slug: string, times = 1) {
  await page.goto("/trgovina");
  await dismissCmp(page);
  const card = page.locator(`[data-product-card='${slug}']`);
  for (let i = 0; i < times; i++) {
    await card.getByRole("button", { name: "Dodaj v košarico" }).click();
    await page.waitForTimeout(400);
  }
  await expect(page.locator("[data-cart-badge]")).toHaveText(String(times));
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

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("full guest purchase: checkout → pay → confirmation → email+invoice → lookup", async ({
  page,
}) => {
  const email = `kupi-${Date.now()}@test.si`;
  await addToCartViaUi(page, "belilni-trakci-za-zobe", 2);

  // stock before
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { sku: "NAS-TRK-14" },
  });
  const stockBefore = variant.stock;

  await fillWizard(page, email);

  // abandoned capture happened at step 1
  const abandoned = await prisma.abandonedCheckout.findFirst({
    where: { email },
  });
  expect(abandoned).toBeTruthy();
  expect(abandonnedCartSnapshotHasItems(abandoned!.cartSnapshot)).toBe(true);

  await page.locator("[data-test-pay-success]").click();
  await page.waitForURL(/\/potrditev\/NS-/, { timeout: 20_000 });

  // NS number + paid state on confirmation
  const number = await page.locator("[data-order-number]").innerText();
  expect(number).toMatch(/^NS-\d{4}-\d{5}$/);
  await expect(
    page.getByRole("heading", { name: "Naročilo je potrjeno 🎉" }),
  ).toBeVisible();

  // order in DB: PAID, snapshot totals exact, stock decremented ONCE
  const order = await prisma.order.findUniqueOrThrow({
    where: { number },
    include: { items: true },
  });
  expect(order.status).toBe("PAID");
  expect(order.subtotalCents).toBe(6998);
  // 69,98 € ≥ 45 € threshold → free shipping
  expect(order.shippingCents).toBe(0);
  expect(order.totalCents).toBe(6998);
  expect(order.vatCents).toBe(1262);
  expect(order.invoiceNumber).toBe(number);
  expect(order.stockDeducted).toBe(true);
  const after = await prisma.variant.findUniqueOrThrow({
    where: { sku: "NAS-TRK-14" },
  });
  expect(after.stock).toBe(stockBefore - 2);

  // Phase 9 step 4: the invoice is frozen as issued, and the abandoned-checkout capture is gone once paid.
  const company = await prisma.setting.findUniqueOrThrow({ where: { key: "company" } });
  const companyValue = company.value as { name: string; email: string };
  expect(order.invoiceSnapshot).toMatchObject({
    issuedAt: order.invoiceIssuedAt?.toISOString(),
    seller: { name: companyValue.name, email: companyValue.email },
    buyer: { name: "Test Kupec", email },
  });
  expect(await prisma.abandonedCheckout.count({ where: { recoveryToken: order.checkoutKey ?? "" } })).toBe(0);
  await expect(page.locator("[data-delivery-estimate]")).toContainText("Predviden rok dostave:");

  // confirmation email on a durable medium: legal block + invoice, model withdrawal form and legal texts in Mailpit
  const message = await waitForMailMessage(email);
  expect(message.Subject).toContain(number);
  expect(message.Attachments?.map((a) => a.FileName)).toEqual([
    `racun-${number}.pdf`, "obrazec-odstop-od-pogodbe-nasmeh.pdf", `pogoji-in-odstop-${number}.pdf`,
  ]);
  expect(message.HTML).toContain("data-order-legal");
  expect(message.HTML).toContain(`mailto:${companyValue.email}`);
  expect(message.HTML).toContain("Pravica do odstopa od pogodbe");
  expect(message.HTML).toContain("/odstop-od-pogodbe");
  // The delivery time is the standard method's estimate from the shipping Setting (seed: "2–4 delovne dni"),
  // never the pre-step-4 hard-coded sentence.
  expect(message.HTML).toContain("Predviden rok dostave: 2–4 delovne dni.");
  expect(message.HTML).not.toContain("Predviden rok dostave je");

  // guest lookup finds the order (tracking page, e-mail + order-number mode)
  await page.goto(`/sledi?email=${encodeURIComponent(email)}&narocilo=${number}`);
  await expect(page.locator('[data-track-form="order"] input[name="orderNumber"]')).toHaveValue(number);
  await page.locator('[data-track-form="order"] button[type="submit"]').click();
  await expect(page.locator("[data-lookup-result]")).toBeVisible();
  await expect(page.locator("[data-lookup-status]")).toHaveText("Plačano");
});

function abandonnedCartSnapshotHasItems(snapshot: unknown): boolean {
  return Array.isArray(snapshot) && snapshot.length > 0;
}

test("SCA failure → retry path → success", async ({ page }) => {
  const email = `sca-${Date.now()}@test.si`;
  await addToCartViaUi(page, "ustna-voda-globinsko-ciscenje", 1);
  await fillWizard(page, email);

  await page.locator("[data-test-pay-sca]").click();
  await expect(page.getByText("Plačilo ni uspelo. Poskusite znova.")).toBeVisible();

  // order stays PENDING after a failed attempt
  const pending = await prisma.order.findFirstOrThrow({
    where: { email },
    orderBy: { createdAt: "desc" },
  });
  expect(pending.status).toBe("PENDING");

  // A "payment submitted" marker left in the address bar or the history does not outlive the
  // attempt: the order records the failure, so the page leads with the payment and does not poll.
  const revisit = await page.context().newPage();
  await revisit.goto(`/potrditev/${pending.number}?placilo=oddano`);
  await expect(revisit.getByRole("heading", { name: "Dokončajte plačilo" })).toBeVisible();
  await expect(revisit).toHaveTitle(/^Dokončajte plačilo/);
  await expect(revisit.getByRole("button", { name: "Osveži stanje" })).toHaveCount(0);
  await expect(revisit.locator("[data-resume-payment]")).toBeVisible();
  await revisit.close();

  await page.locator("[data-test-pay-success]").click();
  await page.waitForURL(/\/potrditev\/NS-/, { timeout: 20_000 });
  const number = await page.locator("[data-order-number]").innerText();
  const order = await prisma.order.findUniqueOrThrow({ where: { number } });
  expect(order.status).toBe("PAID");
});

test("webhook idempotency: same event twice → ONE transition/decrement/email; invalid signature → 400", async ({
  page,
  request,
}) => {
  const email = `idem-${Date.now()}@test.si`;
  await addToCartViaUi(page, "belilni-trakci-za-zobe", 1);
  await fillWizard(page, email);
  await page.locator("[data-test-pay-success]").click();
  await page.waitForURL(/\/potrditev\/NS-/, { timeout: 20_000 });
  const number = await page.locator("[data-order-number]").innerText();
  const order = await prisma.order.findUniqueOrThrow({ where: { number } });
  const stockAfterPay = (
    await prisma.variant.findUniqueOrThrow({ where: { sku: "NAS-TRK-14" } })
  ).stock;

  // replay the SAME event (same id) → already_processed, nothing changes
  const intentId = order.stripePaymentIntentId!;
  const body = JSON.stringify({
    id: "evt_replay_same",
    type: "payment_intent.succeeded",
    data: { object: { id: intentId } },
  });
  // first manual delivery to establish the event id (the test driver used its own id)
  await request.post(`${BASE}/api/webhooks/stripe`, {
    data: body,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signWebhook(body, WEBHOOK_SECRETS.stripe),
    },
  });
  // second delivery of the SAME event id
  const replay = await request.post(`${BASE}/api/webhooks/stripe`, {
    data: body,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signWebhook(body, WEBHOOK_SECRETS.stripe),
    },
  });
  const replayJson = await replay.json();
  expect(replayJson.result.outcome).toBe("already_processed");

  const events = await prisma.processedEvent.count({
    where: { eventId: "evt_replay_same" },
  });
  expect(events).toBe(1);
  expect(
    (await prisma.variant.findUniqueOrThrow({ where: { sku: "NAS-TRK-14" } }))
      .stock,
  ).toBe(stockAfterPay);

  // exactly ONE confirmation email to this address
  await page.waitForTimeout(1000);
  const list = (await (
    await fetch(`http://127.0.0.1:18025/api/v1/messages?limit=50`)
  ).json()) as { messages?: Array<{ To: Array<{ Address: string }> }> };
  const toAddress = (list.messages ?? []).filter((m) =>
    m.To.some((t) => t.Address === email),
  );
  expect(toAddress).toHaveLength(1);

  // invalid signature → 400, no state change
  const bad = await request.post(`${BASE}/api/webhooks/stripe`, {
    data: body,
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=1,v1=garbage",
    },
  });
  expect(bad.status()).toBe(400);
  const unchanged = await prisma.order.findUniqueOrThrow({ where: { number } });
  expect(unchanged.status).toBe("PAID");
});

test("stock-out at payment confirm → CANCELLED with clear error, no decrement", async ({
  page,
}) => {
  const email = `stock-${Date.now()}@test.si`;
  await addToCartViaUi(page, "ustna-voda-globinsko-ciscenje", 1);
  await fillWizard(page, email);

  // zero the stock between order creation and payment
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { sku: "NAS-UST-500" },
  });
  const stockBefore = variant.stock;
  await prisma.variant.update({
    where: { id: variant.id },
    data: { stock: 0 },
  });

  await page.locator("[data-test-pay-success]").click();
  await page.waitForURL(/\/potrditev\/NS-/, { timeout: 20_000 });
  await expect(page.getByText("Naročilo je preklicano")).toBeVisible();

  const number = await page.locator("[data-order-number]").innerText();
  const order = await prisma.order.findUniqueOrThrow({ where: { number } });
  expect(order.status).toBe("CANCELLED");
  expect(order.stockDeducted).toBe(false);

  // restore stock
  await prisma.variant.update({
    where: { id: variant.id },
    data: { stock: stockBefore },
  });
});

test("paypal webhook path: signed CAPTURE.COMPLETED → PAID; duplicate → already_processed", async ({
  request,
}) => {
  // fixture order via the test driver path is stripe-flavored; for PayPal we
  // create the order row directly (provider paypal)
  const number = `NS-2026-${String(Math.floor(Math.random() * 90000) + 10000)}`;
  const paypalVariant = await prisma.variant.findUniqueOrThrow({ where: { sku: "NAS-UST-500" } });
  const order = await prisma.order.create({
    data: {
      number,
      status: "PENDING",
      email: "paypal-e2e@test.si",
      subtotalCents: 1999,
      shippingCents: 390,
      totalCents: 2389,
      vatCents: 431,
      shippingAddress: { fullName: "Pay Pal" },
      paymentProvider: "paypal",
      paypalOrderId: `PAYPAL-TEST-${number}`,
      items: {
        create: {
          title: "Ustna voda",
          variantId: paypalVariant.id,
          sku: "NAS-UST-500",
          unitPriceCents: 1999,
          quantity: 1,
        },
      },
    },
  });

  const body = JSON.stringify({
    id: `evt_pp_${Date.now()}`,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: order.paypalOrderId },
  });
  const first = await request.post(`${BASE}/api/webhooks/paypal`, {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": signWebhook(body, WEBHOOK_SECRETS.paypal),
    },
  });
  expect((await first.json()).result.outcome).toBe("paid");

  const second = await request.post(`${BASE}/api/webhooks/paypal`, {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": signWebhook(body, WEBHOOK_SECRETS.paypal),
    },
  });
  expect((await second.json()).result.outcome).toBe("already_processed");

  const bad = await request.post(`${BASE}/api/webhooks/paypal`, {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": "t=1,v1=garbage",
    },
  });
  expect(bad.status()).toBe(400);
});

test("checkout validation never dead-ends: fields say what to fix, the rail keeps its totals, free shipping reads free on every method (QA M11, C2-F7, C2-F10)", async ({ page }) => {
  await addToCartViaUi(page, "belilni-trakci-za-zobe", 2); // 69,98 € ≥ the free-shipping threshold
  await page.goto("/checkout");
  const contact = page.locator("[data-step='0']");
  await expect(page.locator("[data-checkout-total]")).toBeVisible();

  // An address without a top-level domain: the rail keeps its totals while typing, and continuing marks the field.
  await page.getByLabel("E-pošta", { exact: true }).fill("qa2@x");
  await expect(page.locator("[data-checkout-summary]")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-checkout-total]")).toBeVisible();
  await page.locator("[data-continue-contact]").click();
  await expect(contact.getByRole("alert")).toContainText("Vnesite veljaven e-poštni naslov");
  await expect(contact).toHaveAttribute("data-open", "true");
  await page.getByLabel("E-pošta", { exact: true }).fill(`m11-${Date.now()}@test.si`);
  await expect(contact.getByRole("alert")).toHaveCount(0);
  await page.locator("[data-continue-contact]").click();

  const shipping = page.locator("[data-step='1']");
  await expect(shipping).toHaveAttribute("data-open", "true");
  for (const price of await shipping.locator("[data-method-price]").all()) await expect(price).toHaveText("Brezplačna");

  await page.getByLabel("Telefon (za kurirja)").fill("abc");
  await page.getByLabel("Ime in priimek").fill("   ");
  await page.getByLabel("Ulica in hišna številka").fill("Testna ulica 12");
  await page.getByLabel("Kraj").fill("Ljubljana");
  await page.getByLabel("Poštna številka").fill("0999");
  // A blank-after-trim name is marked on continue, never a silently disabled button.
  await expect(page.locator("[data-continue-shipping]")).toBeEnabled();
  await page.locator("[data-continue-shipping]").click();
  await expect(shipping.getByText("To polje je obvezno.")).toBeVisible();
  await expect(shipping.getByText("Vnesite veljavno telefonsko številko", { exact: false })).toBeVisible();
  await expect(shipping.getByText("Preverite obliko poštne številke", { exact: false })).toBeVisible();
  await expect(shipping).toHaveAttribute("data-open", "true");
  await page.getByLabel("Ime in priimek").fill("Test Kupec");
  await expect(shipping.getByText("To polje je obvezno.")).toHaveCount(0);

  await page.getByLabel("Telefon (za kurirja)").fill("+386 40 123 456");
  await page.getByLabel("Poštna številka").fill("1000");
  await expect(shipping.getByRole("alert")).toHaveCount(0);
  await page.locator("[data-continue-shipping]").click();
  await expect(page.locator("[data-step='2']")).toHaveAttribute("data-open", "true");
});

test("\"Vnesite nov naslov\" empties the delivery fields a saved address filled (QA 2026-09-30)", async ({ page }) => {
  const key = randomUUID();
  const password = "Checkout123!";
  const user = await prisma.user.create({
    data: {
      email: `novi-naslov-${key}@test.si`, name: "Veronika Beta", role: "CUSTOMER", emailVerified: new Date(),
      passwordHash: await bcrypt.hash(password, 10),
      addresses: { create: {
        label: "Dom", fullName: "Veronika Beta", line1: "Slovenska cesta 12", postalCode: "1000",
        city: "Ljubljana", country: "SI", phone: "+386 41 222 333", isDefault: true,
      } },
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

    await addToCartViaUi(page, "ustna-voda-globinsko-ciscenje");
    await page.goto("/checkout");
    await page.locator("[data-continue-contact]").click();
    const picker = page.locator("[data-saved-addresses]");
    await expect(page.getByLabel("Ulica in hišna številka", { exact: true })).toHaveValue("Slovenska cesta 12");

    await picker.selectOption({ label: "Vnesite nov naslov" });
    // Nothing of the saved address may ride along with a half-typed new one; the recipient is the account name.
    for (const label of ["Telefon (za kurirja)", "Ulica in hišna številka", "Kraj", "Poštna številka"]) {
      await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
    }
    await expect(page.getByLabel("Ime in priimek", { exact: true })).toHaveValue("Veronika Beta");
    // The wizard's country <select> sits inside its <label>, whose text includes every <option>,
    // so an exact label match cannot find it; the field name is the stable handle.
    await expect(page.locator("[data-checkout-wizard] select[name='country']")).toHaveValue("SI");
    // Picking the saved row again fills it back in.
    await picker.selectOption({ label: "Dom — Slovenska cesta 12, 1000 Ljubljana" });
    await expect(page.getByLabel("Ulica in hišna številka", { exact: true })).toHaveValue("Slovenska cesta 12");
  } finally {
    await prisma.cart.deleteMany({ where: { userId: user.id } });
    await prisma.abandonedCheckout.deleteMany({ where: { email: user.email } });
    await prisma.address.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

import { expect, test, type Page } from "@playwright/test";
import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { markOrderDelivered, markOrderShipped } from "@/lib/orders/transitions";
import { db } from "@/lib/db";
import { prisma, waitForMailMessage } from "./helpers";

/** Phase 6 step 3 (§12.3): shipment transitions, shipped email, public tracking. */

const PASSWORD = "TrackTest123!";
const NOT_FOUND = "Pošiljke oziroma naročila s temi podatki ni mogoče najti.";
const GLS_TEMPLATE = "https://gls-group.eu/SI/sl/sledenje-paketom?match=";
const POSTA_TEMPLATE = "https://sledenje.posta.si/?q=";

test.afterAll(async () => { await Promise.all([prisma.$disconnect(), db.$disconnect()]); });

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }
}

/** A paid, stock-deducted order on the seeded GLS method (label snapshot, as checkout stores it). */
async function paidOrder(email: string, userId: string | null) {
  const variant = await prisma.variant.findUniqueOrThrow({ where: { sku: "NAS-TRK-14" } });
  return prisma.order.create({
    data: {
      number: `NS-2026-9${randomInt(1000, 9999)}`, email, userId, status: "PAID", paidAt: new Date(), stockDeducted: true,
      paymentProvider: "test", shippingMethod: "GLS — paketna dostava", shippingCents: 490,
      subtotalCents: 3499, totalCents: 3989, vatCents: 719,
      shippingAddress: { fullName: "Track Test", line1: "Testna 1", postalCode: "1000", city: "Ljubljana", country: "SI" },
      items: { create: { variantId: variant.id, title: variant.title, sku: variant.sku, unitPriceCents: 3499, quantity: 1 } },
    },
  });
}

const numberForm = (page: Page) => ({
  input: page.locator('[data-track-form="number"] input[name="trackingNumber"]'),
  submit: page.locator('[data-track-form="number"] button[type="submit"]'),
});
const orderForm = (page: Page) => ({
  email: page.locator('[data-track-form="order"] input[name="email"]'),
  number: page.locator('[data-track-form="order"] input[name="orderNumber"]'),
  submit: page.locator('[data-track-form="order"] button[type="submit"]'),
});

test("shipping emails the carrier link; tracking page, account and email agree; delivery follows", async ({ page }) => {
  const id = randomUUID();
  const email = `track-${id}@test.si`;
  const user = await prisma.user.create({ data: {
    email, name: "Track Test", passwordHash: await bcrypt.hash(PASSWORD, 4), emailVerified: new Date(),
  } });
  const order = await paidOrder(email, user.id);
  const rawNumber = ` gls e2e ${id.slice(0, 8)} `;
  const number = rawNumber.replace(/\s+/g, "").toUpperCase();
  const expectedLink = `${GLS_TEMPLATE}${encodeURIComponent(number)}`;
  try {
    // Invalid transitions never touch the order.
    expect(await markOrderShipped(order.id, { carrier: "DHL", trackingNumber: rawNumber, actor: "e2e" })).toEqual({ ok: false, reason: "unknown_carrier" });
    expect(await markOrderShipped(order.id, { carrier: "GLS", trackingNumber: "12", actor: "e2e" })).toEqual({ ok: false, reason: "missing_tracking" });
    expect(await markOrderDelivered(order.id, { actor: "e2e" })).toEqual({ ok: false, reason: "invalid_transition" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");

    expect(await markOrderShipped(order.id, { carrier: "GLS", trackingNumber: rawNumber, actor: "e2e" }))
      .toEqual({ ok: true, orderNumber: order.number, status: "SHIPPED" });
    const shipped = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(shipped).toMatchObject({ status: "SHIPPED", carrier: "GLS", trackingNumber: number, shippedEmailPending: false });
    expect(shipped.shippedAt).not.toBeNull();
    expect(shipped.shippedEmailSentAt).not.toBeNull();
    expect((shipped.timeline as Array<{ event: string }>).at(-1)?.event).toBe("shipped");
    expect(await markOrderShipped(order.id, { carrier: "GLS", trackingNumber: rawNumber, actor: "e2e" })).toEqual({ ok: false, reason: "invalid_transition" });

    const mail = await waitForMailMessage(email);
    expect(mail.Subject).toContain(order.number);
    const body = `${mail.HTML ?? ""}\n${mail.Text ?? ""}`;
    expect(body).toContain(expectedLink);
    expect(body).toContain(`/sledi?sledenje=${encodeURIComponent(number)}`);
    expect(body).toContain("2–3 delovni dnevi");

    // Tracking-number mode: the email link prefills; typing it lowercase with spaces still resolves.
    await page.goto(`/sledi?sledenje=${encodeURIComponent(number)}`);
    await dismissCmp(page);
    await expect(numberForm(page).input).toHaveValue(number);
    await numberForm(page).input.fill(rawNumber);
    await numberForm(page).submit.click();
    const result = page.locator("[data-lookup-result]");
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("data-lookup-mode", "number");
    await expect(page.locator("[data-lookup-status]")).toHaveText("Odposlano");
    await expect(page.locator("[data-tracking-link]")).toHaveAttribute("href", expectedLink);
    await expect(page.locator("[data-lookup-estimate]")).toHaveText("2–3 delovni dnevi");
    await expect(page.locator("[data-lookup-shipped]")).toBeVisible();
    for (const secret of ["Track Test", "Testna 1", order.number, "39,89"]) await expect(result).not.toContainText(secret);

    // Order mode: the purchaser's fuller view, case-insensitive inputs, same link.
    await orderForm(page).email.fill(email.toUpperCase());
    await orderForm(page).number.fill(order.number.toLowerCase());
    await orderForm(page).submit.click();
    await expect(result).toHaveAttribute("data-lookup-mode", "order");
    await expect(page.locator("[data-lookup-number]")).toHaveText(order.number);
    await expect(page.locator("[data-lookup-status]")).toHaveText("Odposlano");
    await expect(page.locator("[data-tracking-link]")).toHaveAttribute("href", expectedLink);
    await expect(result).toContainText("39,89");

    // The account order detail derives the identical carrier link.
    await page.goto("/prijava");
    await dismissCmp(page);
    await page.getByLabel("E-pošta").fill(email);
    await page.getByLabel("Geslo", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Prijava", exact: true }).click();
    await page.waitForURL(/\/racun/);
    await page.goto(`/racun/narocilo/${order.number}`);
    await expect(page.locator("[data-tracking-link]")).toHaveAttribute("href", expectedLink);

    // Delivery stamps its own date and keeps the shipment date.
    expect(await markOrderDelivered(order.id, { actor: "e2e" })).toEqual({ ok: true, orderNumber: order.number, status: "DELIVERED" });
    const delivered = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(delivered.deliveredAt).not.toBeNull();
    expect(delivered.shippedAt?.getTime()).toBe(shipped.shippedAt?.getTime());
    expect(await markOrderDelivered(order.id, { actor: "e2e" })).toEqual({ ok: false, reason: "invalid_transition" });
    await page.goto("/sledi");
    await numberForm(page).input.fill(number);
    await numberForm(page).submit.click();
    await expect(page.locator("[data-lookup-status]")).toHaveText("Dostavljeno");
    await expect(page.locator("[data-lookup-delivered]")).toBeVisible();
    await expect(page.locator("[data-lookup-estimate]")).toHaveCount(0);
  } finally {
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("unknown inputs give one uniform answer and the rate limit is per client and mode", async ({ browser }) => {
  const limited = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${randomInt(1, 254)}` } });
  const page = await limited.newPage();
  const email = `track-limit-${randomUUID()}@test.si`;
  const order = await paidOrder(email, null);
  const number = `RR${randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase()}SI`;
  try {
    expect((await markOrderShipped(order.id, { carrier: "Pošta Slovenije", trackingNumber: number, actor: "e2e" })).ok).toBe(true);
    await page.goto("/sledi");
    await dismissCmp(page);
    const error = page.locator("[data-lookup-error]");

    await numberForm(page).input.fill("NOSUCHNUMBER1");
    await numberForm(page).submit.click();
    await expect(error).toHaveText(NOT_FOUND);
    await orderForm(page).email.fill("nobody@test.si");
    await orderForm(page).number.fill(order.number);
    await orderForm(page).submit.click();
    await expect(error).toHaveText(NOT_FOUND);

    await numberForm(page).input.fill(number);
    await numberForm(page).submit.click();
    await expect(page.locator("[data-lookup-status]")).toHaveText("Odposlano");
    await expect(page.locator("[data-tracking-link]")).toHaveAttribute("href", `${POSTA_TEMPLATE}${number}`);

    // Exhaust this client's tracking-number budget (20 per 10 minutes).
    for (let attempt = 0; attempt < 19; attempt++) {
      await numberForm(page).input.fill(`NOPE${attempt}XXXXXX`);
      await numberForm(page).submit.click();
      await expect(error).toHaveText(NOT_FOUND);
    }
    await numberForm(page).input.fill(number);
    await numberForm(page).submit.click();
    await expect(error).toHaveText(NOT_FOUND);

    // The order mode keeps its own budget for the same client.
    await orderForm(page).email.fill(email);
    await orderForm(page).number.fill(order.number);
    await orderForm(page).submit.click();
    await expect(page.locator("[data-lookup-number]")).toHaveText(order.number);

    // Another client is unaffected.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/sledi");
    await dismissCmp(otherPage);
    await numberForm(otherPage).input.fill(number);
    await numberForm(otherPage).submit.click();
    await expect(otherPage.locator("[data-lookup-status]")).toHaveText("Odposlano");
    await other.close();
  } finally {
    await limited.close();
    await prisma.order.delete({ where: { id: order.id } });
  }
});

test("tracking page is server-rendered with both modes and stays noindex", async ({ request }) => {
  const response = await request.get("/sledi");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("Po številki sledenja");
  expect(html).toContain("Po e-pošti in številki naročila");
  expect(html).toContain('name="robots" content="noindex');
});

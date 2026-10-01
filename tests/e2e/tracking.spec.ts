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
    // The answer sits right under the form that asked and takes focus (QA M14).
    await expect(page.locator('[data-track-form="number"] + [data-lookup-result]')).toBeVisible();
    await expect(result.getByRole("heading", { name: "Stanje pošiljke" })).toBeFocused();
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
    await expect(page.locator('[data-track-form="order"] + [data-lookup-result]')).toBeVisible();
    await expect(page.locator("[data-lookup-number]")).toHaveText(order.number);
    await expect(page.locator("[data-lookup-status]")).toHaveText("Odposlano");
    await expect(page.locator("[data-tracking-link]")).toHaveAttribute("href", expectedLink);
    await expect(result).toContainText("39,89");

    // The account order detail derives the identical carrier link.
    await page.goto("/prijava");
    await dismissCmp(page);
    await page.getByLabel("E-pošta", { exact: true }).fill(email);
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

test("on a phone the pending line and the error under the order form come into view, and focus never drops to the page (QA M14)", async ({ browser }) => {
  // A fresh phone page puts the order form's button at the fold: its feedback renders below it.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${randomInt(1, 254)}` },
  });
  const page = await phone.newPage();
  try {
    await page.goto("/sledi");
    await dismissCmp(page);
    // Hold the lookup (a Server Action POST to this page) until the pending state has been checked.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = () => resolve(); });
    await page.route("**/sledi*", async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });

    const form = orderForm(page);
    await form.email.fill("nobody@test.si");
    await form.number.fill("NS-2026-00002");
    await form.submit.click();
    const pendingLine = page.locator('[data-track-form="order"] + [data-lookup-pending]');
    await expect(pendingLine).toHaveText("Preverjamo …");
    await expect(pendingLine).toBeInViewport({ ratio: 1 });
    // aria-disabled, not disabled: the pressed button keeps focus while the lookup runs.
    await expect(form.submit).toHaveAttribute("aria-disabled", "true");
    await expect(form.submit).toBeFocused();
    release();

    const error = page.locator('[data-track-form="order"] + [data-lookup-error]');
    await expect(error).toHaveText(NOT_FOUND);
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toBeFocused();
    await expect(error).toBeInViewport({ ratio: 1 });
    // Clear of the sticky header, with the form's button still in view for the correction.
    await expect.poll(async () => {
      const headerBottom = await page.locator("header.ui-header").evaluate((element) => element.getBoundingClientRect().bottom);
      const errorTop = await error.evaluate((element) => element.getBoundingClientRect().top);
      return errorTop >= headerBottom;
    }).toBe(true);
    await expect(form.submit).toBeInViewport();

    // The same answer again is a new alert: revealed and focused again.
    await page.unroute("**/sledi*");
    await page.evaluate(() => window.scrollTo(0, 0));
    await form.submit.click();
    await expect(error).toHaveText(NOT_FOUND);
    await expect(error).toBeFocused();
    await expect(error).toBeInViewport({ ratio: 1 });
  } finally {
    await phone.close();
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

test("without JavaScript the forms reload the page with their values and say the lookup needs JavaScript (QA T4-F9)", async ({ request }) => {
  // What a GET submit of the forms sends: their own field names are prefilled like the mail links' parameters.
  const response = await request.get("/sledi?trackingNumber=GLS123&email=kupec%40test.si&orderNumber=NS-2026-00001");
  const html = await response.text();
  expect(html).toMatch(/name="trackingNumber"[^>]*value="GLS123"|value="GLS123"[^>]*name="trackingNumber"/);
  expect(html).toMatch(/name="orderNumber"[^>]*value="NS-2026-00001"|value="NS-2026-00001"[^>]*name="orderNumber"/);
  expect(html).toContain("data-tracking-noscript");
  expect(html).toContain("potrebujete JavaScript");
  // The way forward works without JavaScript too: the seller's e-mail, not the (scripted) contact form.
  expect(html).toMatch(/data-tracking-noscript[\s\S]*href="mailto:[^"]+@[^"]+"/);
});

import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { dismissCookieBanner, enrolledTotpFields, loginStaff, MAILPIT_URL, prisma, waitForMailMessage } from "./helpers";

/** Phase 7 step 2 (§14.7, §14.8, ticket inbox): orders, refunds, customers, tickets. */

const PASSWORD = "OrdersAcceptance123!";
const GLS_TEMPLATE = "https://gls-group.eu/SI/sl/sledenje-paketom?match=";

test.afterAll(async () => { await prisma.$disconnect(); });

async function messagesTo(address: string) {
  const list = await (await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`, { signal: AbortSignal.timeout(5000) })).json() as
    { messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }> };
  return list.messages.filter((message) => message.To.some((to) => to.Address === address));
}

async function staff(role: "OWNER" | "SUPPORT" | "FULFILLMENT", key: string) {
  const totp = enrolledTotpFields();
  const user = await prisma.user.create({ data: {
    email: `orders-${role.toLowerCase()}-${key}@test.si`, name: `Staff ${role}`, role, emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4), ...totp.data,
  } });
  return { ...user, secret: totp.secret };
}

/** A paid, stock-deducted order of 2 × 15,00 € plus 4,90 € shipping on the seeded GLS method. */
async function paidOrder(key: string, options: { email: string; userId?: string | null; stock?: number; fullName?: string }) {
  const product = await prisma.product.create({ data: {
    title: `Orders fixture ${key}`, slug: `orders-${key}`, status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
    variants: { create: { sku: `ORD-${key}`, priceCents: 1500, stock: options.stock ?? 3 } },
  }, include: { variants: true } });
  const number = `NS-2026-7${randomInt(1000, 9999)}`;
  const order = await prisma.order.create({ data: {
    number, email: options.email, userId: options.userId ?? null, status: "PAID", paidAt: new Date(), stockDeducted: true,
    paymentProvider: "test", stripePaymentIntentId: `test_pi_${number}`, invoiceNumber: number, invoiceIssuedAt: new Date(),
    shippingMethod: "GLS — paketna dostava", shippingCents: 490, subtotalCents: 3000, totalCents: 3490, vatCents: 629, vatRatePercent: 22,
    shippingAddress: { fullName: options.fullName ?? "Naročnik Test", line1: "Testna 5", postalCode: "1000", city: "Ljubljana", country: "SI" },
    items: { create: { variantId: product.variants[0].id, title: product.title, sku: `ORD-${key}`, unitPriceCents: 1500, quantity: 2 } },
    timeline: [{ at: new Date().toISOString(), event: "created", detail: "provider:test" }, { at: new Date().toISOString(), event: "paid", detail: "provider:test" }],
  }, include: { items: true } });
  return { product, variant: product.variants[0], order };
}

async function cleanupOrder(fixture: Awaited<ReturnType<typeof paidOrder>>) {
  await prisma.order.deleteMany({ where: { id: fixture.order.id } });
  await prisma.product.deleteMany({ where: { id: fixture.product.id } });
}

async function customerLogin(page: Page, email: string) {
  await page.goto("/prijava");
  await dismissCookieBanner(page);
  const form = page.locator("[data-login-form]");
  await form.getByLabel("E-pošta").fill(email);
  await form.getByLabel("Geslo", { exact: true }).fill(PASSWORD);
  await form.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/racun/);
}

test("owner processes, ships, annotates, partially refunds with restock, exports and delivers an order", async ({ page, browser }) => {
  const key = randomUUID();
  const owner = await staff("OWNER", key);
  const customer = await prisma.user.create({ data: { email: `orders-customer-${key}@test.si`, name: "Naročnik Test", emailVerified: new Date(), passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const fixture = await paidOrder(key, { email: customer.email, userId: customer.id });
  const { order, variant } = fixture;
  const tracking = `GLSE2E${key.slice(0, 8).toUpperCase()}`;
  try {
    await loginStaff(page, owner.email, PASSWORD, owner.secret);
    await page.goto(`/admin/narocila?q=${encodeURIComponent(order.number)}`);
    await expect(page.locator(`[data-order-row='${order.number}']`)).toBeVisible();
    await page.locator(`[data-order-row='${order.number}'] a`).first().click();
    await page.waitForURL(new RegExp(`/admin/narocila/${order.number}$`));
    await expect(page.locator("[data-order-total]")).toHaveText("34,90 €");

    // PAID → PROCESSING, then ship with the seeded carrier.
    await page.locator("[data-action='processing']").click();
    await expect(page.locator("[data-order-action-message]")).toHaveText("Naročilo je v obdelavi.");
    await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PROCESSING");
    const ship = page.locator("[data-ship-form]");
    await ship.getByLabel("Prevoznik").selectOption("GLS");
    await ship.getByLabel("Številka sledenja").fill(tracking.toLowerCase());
    await ship.locator("[data-action='ship']").click();
    await expect(page.locator("[data-order-action-message]")).toContainText("odposlano");
    const shippedMail = await waitForMailMessage(customer.email);
    expect(`${shippedMail.HTML ?? ""}`).toContain(`${GLS_TEMPLATE}${encodeURIComponent(tracking)}`);
    await expect(page.locator("[data-tracking-link]")).toHaveText(tracking);

    // Notes: one internal, one for the customer.
    const noteForm = page.locator("[data-note-form]");
    await noteForm.locator("textarea[name='body']").fill("Interni klic: stranka želi dostavo popoldne.");
    await noteForm.locator("[data-action='note']").click();
    await expect(page.locator("[data-order-note='internal']")).toHaveCount(1);
    await noteForm.locator("textarea[name='body']").fill("Paket je pri sosedu na št. 7.");
    await noteForm.locator("[data-note-visible]").check();
    await noteForm.locator("[data-action='note']").click();
    await expect(page.locator("[data-order-note='customer']")).toHaveCount(1);

    // Partial refund of one unit with restock.
    const refund = page.locator("[data-refund-form]");
    await refund.locator(`[data-refund-qty='ORD-${key}']`).fill("1");
    await refund.getByLabel("Razlog vračila").fill("Poškodovan kos");
    await expect(refund.locator("[data-refund-preview]")).toContainText("15,00 €");
    page.once("dialog", (dialog) => dialog.accept());
    await refund.locator("[data-action='refund']").click();
    await expect(page.locator("[data-order-action-message]")).toHaveText("Vračilo je izvedeno.");
    await expect(page.locator("[data-order-refunded]")).toHaveText("15,00 €");
    await expect(page.locator("[data-order-refund='COMPLETED']")).toHaveCount(1);
    const afterRefund = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { refunds: true } });
    expect(afterRefund).toMatchObject({ status: "SHIPPED", refundedCents: 1500 });
    expect(afterRefund.refunds[0]).toMatchObject({ status: "COMPLETED", amountCents: 1500, vatCents: 270, restock: true, providerRefundId: `test_refund_${afterRefund.refunds[0].id}` });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(4);
    expect(JSON.stringify(afterRefund.timeline)).toContain("partially_refunded");
    await expect.poll(async () => (await messagesTo(customer.email)).some((message) => message.Subject.startsWith("Vračilo denarja"))).toBe(true);

    // Documents and export.
    const csv = await page.request.get(`/admin/narocila/export.csv?q=${encodeURIComponent(order.number)}`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain(order.number);
    const slip = await page.request.get(`/admin/narocila/${order.number}/dobavnica.pdf`);
    expect(slip.status()).toBe(200);
    expect(slip.headers()["content-type"]).toBe("application/pdf");
    expect((await slip.body()).subarray(0, 5).toString()).toBe("%PDF-");
    const invoice = await page.request.get(`/racun/narocilo/${order.number}/racun.pdf`);
    expect(invoice.status()).toBe(200);

    // Deliver; the customer sees only the visible note.
    await page.locator("[data-action='deliver']").click();
    await expect(page.locator("[data-order-action-message]")).toContainText("dostavljeno");
    await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("DELIVERED");
    const context = await browser.newContext();
    try {
      const customerPage = await context.newPage();
      await customerLogin(customerPage, customer.email);
      await customerPage.goto(`/racun/narocilo/${order.number}`);
      await expect(customerPage.locator("[data-order-notes]")).toContainText("Paket je pri sosedu");
      await expect(customerPage.locator("[data-order-notes]")).not.toContainText("Interni klic");
    } finally {
      await context.close();
    }
  } finally {
    await cleanupOrder(fixture);
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, customer.id] } } });
  }
});

test("cancelling a paid order refunds it in full, restocks and mails the customer; roles see their own controls", async ({ page, browser }) => {
  const key = randomUUID();
  const support = await staff("SUPPORT", key);
  const fulfillment = await staff("FULFILLMENT", key);
  const email = `orders-guest-${key}@test.si`;
  const fixture = await paidOrder(key, { email, stock: 3 });
  const { order, variant } = fixture;
  try {
    await loginStaff(page, fulfillment.email, PASSWORD, fulfillment.secret);
    await page.goto(`/admin/narocila/${order.number}`);
    await expect(page.locator("[data-ship-form]")).toBeVisible();
    await expect(page.locator("[data-refund-form]")).toHaveCount(0);
    await expect(page.locator("[data-cancel-form]")).toHaveCount(0);

    const context = await browser.newContext();
    try {
      const supportPage = await context.newPage();
      await loginStaff(supportPage, support.email, PASSWORD, support.secret);
      await supportPage.goto(`/admin/narocila/${order.number}`);
      await expect(supportPage.locator("[data-ship-form]")).toHaveCount(0);
      await expect(supportPage.locator("[data-refund-form]")).toBeVisible();
      const cancel = supportPage.locator("[data-cancel-form]");
      await cancel.getByLabel("Razlog preklica").fill("Stranka je preklicala po telefonu");
      supportPage.once("dialog", (dialog) => dialog.accept());
      await cancel.locator("[data-action='cancel']").click();
      await expect(supportPage.locator("[data-order-action-message]")).toHaveText("Naročilo je preklicano.");
      // The guest purchaser appears in the customer list (Support may view customers).
      await supportPage.goto(`/admin/stranke?q=${encodeURIComponent(email)}`);
      await expect(supportPage.locator(`[data-customer-row='${email}']`)).toContainText("Gost");
    } finally {
      await context.close();
    }
    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { refunds: true } });
    expect(cancelled).toMatchObject({ status: "CANCELLED", refundedCents: 3490 });
    expect(cancelled.refunds).toHaveLength(1);
    expect(cancelled.refunds[0]).toMatchObject({ status: "COMPLETED", amountCents: 3490, shippingRefunded: true, restock: true });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(5);
    await expect.poll(async () => (await messagesTo(email)).some((message) => message.Subject.startsWith("Naročilo je preklicano"))).toBe(true);
    // Fulfillment has no customer permission: the list redirects with the notice.
    await page.goto(`/admin/stranke?q=${encodeURIComponent(email)}`);
    await page.waitForURL(/\/admin\?dostop=zavrnjen/);
  } finally {
    await cleanupOrder(fixture);
    await prisma.user.deleteMany({ where: { id: { in: [support.id, fulfillment.id] } } });
  }
});

test("support exports and anonymises a customer, and handles a ticket", async ({ page }) => {
  const key = randomUUID();
  const support = await staff("SUPPORT", key);
  const customer = await prisma.user.create({ data: {
    email: `orders-gdpr-${key}@test.si`, name: "Živa Zasebna", emailVerified: new Date(), passwordHash: await bcrypt.hash(PASSWORD, 4), marketingOptIn: true,
    addresses: { create: { fullName: "Živa Zasebna", line1: "Skrita 1", postalCode: "1000", city: "Ljubljana", country: "SI", isDefault: true } },
  } });
  const fixture = await paidOrder(key, { email: customer.email, userId: customer.id, fullName: "Živa Zasebna" });
  const ticket = await prisma.ticket.create({ data: {
    reference: `NP-${key.slice(0, 12).toUpperCase()}`, submissionKey: `k-${key}`, payloadHash: "h", userId: customer.id, orderId: fixture.order.id, orderNumber: fixture.order.number, orderProof: "ACCOUNT",
    topic: "DAMAGED", reason: "PRODUCT_DAMAGED", name: "Živa Zasebna", email: customer.email, message: "Paket je prišel poškodovan.",
    privacyAcceptedAt: new Date(), privacyVersion: "1",
    deliveries: { create: [{ kind: "STAFF", recipient: "podpora@nasmeh.test", sentAt: new Date() }, { kind: "CUSTOMER", recipient: customer.email, sentAt: new Date() }] },
  } });
  try {
    await loginStaff(page, support.email, PASSWORD, support.secret);
    // Ticket inbox → detail → status, assignee, note.
    await page.goto("/admin/podpora?status=OPEN&tema=DAMAGED");
    await expect(page.locator(`[data-ticket-row='${ticket.reference}']`)).toBeVisible();
    await page.goto(`/admin/podpora/${ticket.id}`);
    await expect(page.locator("[data-ticket-message-body]")).toHaveText("Paket je prišel poškodovan.");
    const actions = page.locator("[data-ticket-actions]");
    await actions.getByLabel("Status").selectOption("IN_PROGRESS");
    await actions.getByLabel("Dodeljen").selectOption(support.id);
    await actions.locator("textarea[name='internalNote']").fill("Zahtevati fotografije.");
    await actions.locator("[data-ticket-save]").click();
    await expect(page.locator("[data-ticket-message]")).toHaveText("Shranjeno.");
    await expect.poll(async () => (await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))).toMatchObject({ status: "IN_PROGRESS", assigneeId: support.id, internalNote: "Zahtevati fotografije." });

    // Customer detail, export, anonymisation.
    await page.goto(`/admin/stranke/${customer.id}`);
    await expect(page.locator("[data-customer-name]")).toHaveText("Živa Zasebna");
    await expect(page.locator("[data-customer-addresses]")).toContainText("Skrita 1");
    await expect(page.locator("[data-customer-orders]")).toContainText(fixture.order.number);
    const exported = await page.request.get(`/admin/stranke/${customer.id}/izvoz.json`);
    expect(exported.status()).toBe(200);
    const json = await exported.json() as { profile: { email: string; passwordHash?: string }; orders: Array<{ number: string }>; addresses: unknown[] };
    expect(json.profile.email).toBe(customer.email);
    expect(json.profile.passwordHash).toBeUndefined();
    expect(json.orders.map((order) => order.number)).toContain(fixture.order.number);
    expect(json.addresses).toHaveLength(1);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-customer-anonymise]").click();
    await expect(page.locator("[data-customer-anonymised]")).toBeVisible();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: customer.id }, include: { addresses: true } });
    expect(user.email).toBe(`anonymised-${customer.id}@invalid`);
    expect(user.name).toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.addresses).toHaveLength(0);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
    expect(order).toMatchObject({ email: `anonymised-${customer.id}@invalid`, totalCents: 3490, status: "PAID", anonymizedAt: expect.any(Date) });
    expect(order.shippingAddress).toEqual({ country: "SI", anonymized: true });
    const scrubbed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(scrubbed).toMatchObject({ message: "[anonimizirano]", name: "—" });
    await page.goto(`/admin/narocila/${fixture.order.number}`);
    await expect(page.locator("[data-order-total]")).toHaveText("34,90 €");
    await expect(page.getByText("anonymised-")).toHaveCount(1);
  } finally {
    await prisma.ticket.deleteMany({ where: { id: ticket.id } });
    await cleanupOrder(fixture);
    await prisma.user.deleteMany({ where: { id: { in: [support.id, customer.id] } } });
  }
});

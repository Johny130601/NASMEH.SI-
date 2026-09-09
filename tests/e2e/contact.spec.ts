import { randomInt, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { expect, test as base, type Page } from "@playwright/test";
import { contact } from "@/lib/copy/contact";
import { TOPIC_CODES, topicReasons, type TopicCode } from "@/lib/support/topics";
import { prisma, TURNSTILE_TEST_TOKEN, waitForMailMessage } from "./helpers";

const PASSWORD = "ContactAcceptance123!";
interface ContactFixture {
  id: string;
  email: (tag: string) => string;
  supportEmail: string;
  complianceEmail: string;
  userIds: string[];
  orderIds: string[];
}

const test = base.extend<{ contactFixture: ContactFixture }>({
  contactFixture: async ({ page }, provide) => {
    void page;
    const id = `contact-${randomUUID()}`;
    const emails = new Set<string>();
    const fixture: ContactFixture = {
      id,
      email: tag => { const email = `${tag}-${id}@test.si`; emails.add(email); return email; },
      supportEmail: `staff-${id}@test.si`,
      complianceEmail: `compliance-${id}@test.si`,
      userIds: [], orderIds: [],
    };
    const previous = await prisma.setting.findUnique({ where: { key: "support.contact" } });
    const value = { supportEmail: fixture.supportEmail, complianceEmail: fixture.complianceEmail, hours: "Pon.–pet. 9.00–16.00 (preizkus)", responseTime: "Odgovor po e-pošti (preizkus)." };
    await prisma.setting.upsert({ where: { key: "support.contact" }, create: { key: "support.contact", value }, update: { value } });
    try { await provide(fixture); }
    finally {
      const tickets = await prisma.ticket.findMany({ where: { email: { in: [...emails] } }, include: { attachments: true } });
      await prisma.ticket.deleteMany({ where: { id: { in: tickets.map(ticket => ticket.id) } } });
      for (const attachment of tickets.flatMap(ticket => ticket.attachments)) {
        if (!/^[a-f0-9]{24}\.webp$/.test(attachment.filename)) continue;
        await unlink(path.join(process.cwd(), "support-uploads", attachment.filename)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      }
      await prisma.order.deleteMany({ where: { id: { in: fixture.orderIds } } });
      await prisma.user.deleteMany({ where: { id: { in: fixture.userIds } } });
      if (previous) await prisma.setting.update({ where: { key: previous.key }, data: { value: previous.value === null ? Prisma.JsonNull : previous.value } });
      else await prisma.setting.deleteMany({ where: { key: "support.contact" } });
    }
  },
});

test.afterAll(async () => { await prisma.$disconnect(); });

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
  await expect(banner).toBeHidden();
}

async function openContact(page: Page) {
  await page.goto("/kontakt");
  await dismissCmp(page);
  await expect(page.getByRole("heading", { level: 1, name: contact.title })).toBeVisible();
}

async function chooseTopic(page: Page, topic: TopicCode) {
  const radio = page.locator(`input[name="contact-topic"][value="${topic}"]`);
  await radio.locator("..").click();
  await expect(radio).toBeChecked();
}

async function fillMessage(page: Page, email: string, message: string) {
  const form = page.locator("[data-contact-form]");
  await form.getByLabel(contact.message.name, { exact: true }).fill("Živa Ščuk");
  await form.getByLabel(contact.message.email, { exact: true }).fill(email);
  await form.getByLabel(contact.message.text, { exact: true }).fill(message);
  await form.locator('[name="privacyAccepted"]').check();
}

async function submit(page: Page) {
  await page.getByRole("button", { name: contact.message.submit, exact: true }).click();
  await expect(page.locator("[data-contact-success]")).toBeVisible();
  return (await page.locator("[data-contact-reference]").textContent())!;
}

async function createOrders(fixture: ContactFixture) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const owner = await prisma.user.create({ data: { email: fixture.email("owner"), name: "Živa Ščuk", emailVerified: new Date(), passwordHash: hash } });
  fixture.userIds.push(owner.id);
  const other = await prisma.user.create({ data: { email: fixture.email("other"), name: "Drug Kupec", emailVerified: new Date(), passwordHash: hash } });
  fixture.userIds.push(other.id);
  const empty = await prisma.user.create({ data: { email: fixture.email("empty"), name: "Nov Kupec", emailVerified: new Date(), passwordHash: hash } });
  fixture.userIds.push(empty.id);
  const orders = [];
  for (const userId of [owner.id, owner.id, other.id]) {
    const number = `NS-${randomInt(3000, 9999)}-${String(randomInt(0, 100000)).padStart(5, "0")}`;
    // The foreign order deliberately has the owner's checkout email: the
    // signed-in list must use userId, not enumerate by that email address.
    const order = await prisma.order.create({ data: {
      number, userId, email: owner.email, status: "SHIPPED", paidAt: new Date(),
      subtotalCents: 1999, shippingCents: 390, totalCents: 2389, vatCents: 431,
      shippingAddress: { fullName: "Private Recipient", line1: "Private Street 12", city: "Ljubljana", postalCode: "1000", country: "SI" },
    } });
    fixture.orderIds.push(order.id);
    orders.push(order);
  }
  return { owner, other, empty, order: orders[0], second: orders[1], foreign: orders[2] };
}

async function login(page: Page, email: string) {
  await page.goto("/prijava");
  await dismissCmp(page);
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.getByLabel("Geslo", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/racun$/);
  await page.goto("/kontakt");
}

test("all nine guided topics persist basic requests, route staff mail, acknowledge the reference, and never submit on refresh", async ({ page, contactFixture: fixture }) => {
  test.setTimeout(90_000);
  await openContact(page);
  await expect(page.getByRole("radio")).toHaveCount(9);
  await expect(page.locator('[name="privacyAccepted"]')).not.toBeChecked();
  for (const topic of TOPIC_CODES) {
    const email = fixture.email(topic.toLowerCase());
    if (topic !== TOPIC_CODES[0]) await page.goto("/kontakt");
    await chooseTopic(page, topic);
    const reason = topicReasons[topic].at(-1)!;
    if (topicReasons[topic].length > 1) await page.getByLabel(contact.reasonLabel, { exact: true }).selectOption(reason);
    const message = `Sporočilo za temo ${topic}, preizkus ${fixture.id}.`;
    await fillMessage(page, email, message);
    const reference = await submit(page);
    expect(reference).toMatch(/^NP-[A-F0-9]{12}$/);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { reference }, include: { deliveries: true, attachments: true } });
    expect(ticket).toMatchObject({ email, topic, reason, message, name: "Živa Ščuk", userId: null, orderId: null, orderNumber: null, status: "OPEN", privacyVersion: "contact-v1" });
    expect(ticket.privacyAcceptedAt).toBeInstanceOf(Date);
    // WRONG/DAMAGED also accept an untouched optional file input.
    expect(ticket.attachments).toHaveLength(0);
    expect(ticket.deliveries).toHaveLength(2);
    expect(ticket.deliveries.find(delivery => delivery.kind === "STAFF")?.recipient).toBe(topic === "ADVERSE" ? fixture.complianceEmail : fixture.supportEmail);
    expect(ticket.deliveries.every(delivery => delivery.sentAt !== null)).toBe(true);
    const acknowledgement = await waitForMailMessage(email);
    expect(`${acknowledgement.Text} ${acknowledgement.HTML}`).toContain(reference);
    expect(`${acknowledgement.Text} ${acknowledgement.HTML}`).not.toContain(message);
    await page.reload();
    await expect(page.locator("[data-contact-form]")).toBeVisible();
    expect(await prisma.ticket.count({ where: { email } })).toBe(1);
  }
});

test("guest lookup exposes one proven order, resets changed proof, and leaves the final challenge independent", async ({ page, contactFixture: fixture }) => {
  const { owner, order, second, foreign } = await createOrders(fixture);
  await openContact(page);
  await chooseTopic(page, "TRACKING");
  await page.locator("[data-contact-order-details] summary").click();
  const lookup = page.locator("[data-contact-lookup]");
  const form = page.locator("[data-contact-form]");
  await lookup.getByLabel(contact.order.email, { exact: true }).fill(fixture.email("incorrect"));
  await lookup.getByLabel(contact.order.number, { exact: true }).fill(order.number.toLowerCase());
  await lookup.getByRole("button", { name: contact.order.lookup, exact: true }).click();
  await expect(lookup.getByRole("alert")).toHaveText(contact.errors.orderNotFound);
  await lookup.getByLabel(contact.order.email, { exact: true }).fill(owner.email);
  await lookup.getByRole("button", { name: contact.order.lookup, exact: true }).click();
  await expect(page.locator("[data-contact-proven-order]")).toContainText(order.number);
  await expect(page.locator("main")).not.toContainText(second.number);
  await expect(page.locator("main")).not.toContainText(foreign.number);
  await expect(page.locator("main")).not.toContainText("Private Street");
  await expect(form.locator('[name="orderNumber"]')).toHaveValue(order.number);
  await lookup.getByLabel(contact.order.number, { exact: true }).fill(second.number);
  await expect(page.locator("[data-contact-proven-order]")).toHaveCount(0);
  await expect(form.locator('[name="orderNumber"]')).toHaveValue("");
  await expect(form.locator('[name="orderEmail"]')).toHaveValue("");
  await lookup.getByRole("button", { name: contact.order.lookup, exact: true }).click();
  await expect(page.locator("[data-contact-proven-order]")).toContainText(second.number);
  await lookup.getByLabel(contact.order.email, { exact: true }).fill(fixture.email("changed"));
  await expect(page.locator("[data-contact-proven-order]")).toHaveCount(0);
  await lookup.getByLabel(contact.order.email, { exact: true }).fill(owner.email);
  await lookup.getByRole("button", { name: contact.order.lookup, exact: true }).click();
  await expect(page.locator("[data-contact-proven-order]")).toContainText(second.number);

  const replyEmail = fixture.email("guest-reply");
  await fillMessage(page, replyEmail, `Kdaj bo dostavljeno naročilo? ${fixture.id}`);
  await form.locator('[name="turnstileToken"]').evaluate((element: HTMLInputElement) => { element.value = "invalid-final-challenge"; });
  await form.getByRole("button", { name: contact.message.submit, exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText(contact.errors.challenge);
  await expect(form.locator('[name="turnstileToken"]')).toHaveValue(TURNSTILE_TEST_TOKEN);
  expect(await prisma.ticket.count({ where: { email: replyEmail } })).toBe(0);
  const reference = await submit(page);
  expect(await prisma.ticket.findUniqueOrThrow({ where: { reference } })).toMatchObject({ orderId: second.id, orderNumber: second.number, orderProof: "EMAIL_NUMBER", userId: null });
});

test("signed-in contact lists only owned orders and supports a customer with no orders", async ({ page, browser, baseURL, contactFixture: fixture }) => {
  const { owner, empty, order, second, foreign } = await createOrders(fixture);
  await login(page, owner.email);
  await expect(page.locator("[data-contact-lookup]")).toHaveCount(0);
  const select = page.locator("[data-contact-account-orders]");
  expect(await select.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(expect.arrayContaining(["", order.number, second.number]));
  await expect(select.locator("option")).toHaveCount(3);
  await expect(select).not.toContainText(foreign.number);
  await expect(page.getByLabel(contact.message.name, { exact: true })).toHaveValue("Živa Ščuk");
  await expect(page.getByLabel(contact.message.email, { exact: true })).toHaveValue(owner.email);
  await select.selectOption(order.number);
  await chooseTopic(page, "CHANGE");
  await fillMessage(page, owner.email, `Prosim za spremembo kontaktnih podatkov. ${fixture.id}`);
  const reference = await submit(page);
  expect(await prisma.ticket.findUniqueOrThrow({ where: { reference } })).toMatchObject({ userId: owner.id, orderId: order.id, orderProof: "ACCOUNT" });

  const context = await browser.newContext({ baseURL });
  try {
    const emptyPage = await context.newPage();
    await login(emptyPage, empty.email);
    await expect(emptyPage.getByText(contact.order.accountEmpty, { exact: true })).toBeVisible();
    await expect(emptyPage.locator("[data-contact-lookup]")).toHaveCount(0);
    await expect(emptyPage.locator("[data-contact-account-orders]")).toHaveCount(0);
    await chooseTopic(emptyPage, "ADVICE");
    await fillMessage(emptyPage, empty.email, `Prosim za pomoč pri izbiri izdelka. ${fixture.id}`);
    const emptyReference = await submit(emptyPage);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { reference: emptyReference } })).toMatchObject({ userId: empty.id, orderId: null });
  } finally { await context.close(); }
});

test("photo guidance enforces count, size and image content; accepted evidence remains private", async ({ page, contactFixture: fixture }) => {
  await openContact(page);
  await chooseTopic(page, "DAMAGED");
  const email = fixture.email("photos");
  await fillMessage(page, email, `Poškodovana embalaža pri dostavi. ${fixture.id}`);
  await expect(page.getByText(contact.message.photosHint, { exact: true })).toBeVisible();
  const form = page.locator("[data-contact-form]");
  const input = page.getByLabel(contact.message.photos, { exact: true });
  const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  const file = { name: "parcel.png", mimeType: "image/png", buffer: png };
  for (const files of [Array.from({ length: 5 }, () => file), [{ name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) }], [{ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) }], [{ name: "not-image.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") }], [{ name: "pretend.png", mimeType: "image/png", buffer: Buffer.from("<script>not a photo</script>") }]]) {
    await input.setInputFiles(files);
    await form.getByRole("button", { name: contact.message.submit, exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText(contact.errors.photos);
    expect(await prisma.ticket.count({ where: { email } })).toBe(0);
  }
  await input.setInputFiles([file, { ...file, name: "contents.png" }]);
  const reference = await submit(page);
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { reference }, include: { attachments: true } });
  expect(ticket.attachments).toHaveLength(2);
  for (const attachment of ticket.attachments) {
    expect(attachment.filename).toMatch(/^[a-f0-9]{24}\.webp$/);
    expect((await page.request.get(`/uploads/support/${attachment.filename}`)).status()).toBe(404);
    expect((await page.request.get(`/support-uploads/${attachment.filename}`)).status()).toBe(404);
  }
});

test("retrying after a lost response reuses the same request and reference", async ({ page, contactFixture: fixture }) => {
  await openContact(page);
  await chooseTopic(page, "OTHER");
  const email = fixture.email("retry");
  await fillMessage(page, email, `Preizkus ponovitve istega sporočila. ${fixture.id}`);
  const key = await page.locator('[name="requestKey"]').inputValue();
  let aborted = false;
  await page.route("**/kontakt", async route => {
    if (!aborted && route.request().method() === "POST" && route.request().postData()?.includes(key)) {
      aborted = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: contact.message.submit, exact: true }).click();
  await expect(page.locator("[data-contact-form]").getByRole("alert")).toHaveText(contact.errors.failed);
  const created = await prisma.ticket.findUniqueOrThrow({ where: { submissionKey: key } });
  expect(await submit(page)).toBe(created.reference);
  expect(await prisma.ticket.count({ where: { email } })).toBe(1);
  expect(await prisma.ticketEmailDelivery.count({ where: { ticketId: created.id } })).toBe(2);
});

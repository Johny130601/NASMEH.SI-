import { randomInt, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { expect, test as base, type Page } from "@playwright/test";
import { PRIVACY_NOTICE_VERSIONS } from "@/lib/support/validation";
import { prisma, waitForMailMessage } from "./helpers";

/** Phase 6 step 4 (§12.4, §12.6): withdrawal, PDF, guarantee, complaints CTAs, adverse events. */

interface Fixture { id: string; supportEmail: string; complianceEmail: string; emails: Set<string>; orderIds: string[] }

const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, provide) => {
    void page;
    const id = `returns-${randomUUID()}`;
    const fixture: Fixture = { id, supportEmail: `staff-${id}@test.si`, complianceEmail: `compliance-${id}@test.si`, emails: new Set(), orderIds: [] };
    const previous = await prisma.setting.findUnique({ where: { key: "support.contact" } });
    const value = { supportEmail: fixture.supportEmail, complianceEmail: fixture.complianceEmail, hours: "Pon.–pet. (preizkus)", responseTime: "Odgovor po e-pošti (preizkus)." };
    await prisma.setting.upsert({ where: { key: "support.contact" }, create: { key: "support.contact", value }, update: { value } });
    try { await provide(fixture); }
    finally {
      const tickets = await prisma.ticket.findMany({ where: { email: { in: [...fixture.emails] } }, include: { attachments: true } });
      await prisma.ticket.deleteMany({ where: { id: { in: tickets.map(ticket => ticket.id) } } });
      for (const attachment of tickets.flatMap(ticket => ticket.attachments)) {
        if (!/^[a-f0-9]{24}\.webp$/.test(attachment.filename)) continue;
        await unlink(path.join(process.cwd(), "support-uploads", attachment.filename)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      }
      await prisma.order.deleteMany({ where: { id: { in: fixture.orderIds } } });
      if (previous) await prisma.setting.update({ where: { key: previous.key }, data: { value: previous.value === null ? Prisma.JsonNull : previous.value } });
      else await prisma.setting.deleteMany({ where: { key: "support.contact" } });
    }
  },
});

test.afterAll(async () => { await prisma.$disconnect(); });

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
    await expect(banner).toBeHidden();
  }
}

async function paidOrder(fixture: Fixture, email: string) {
  const order = await prisma.order.create({ data: {
    number: `NS-2026-7${randomInt(1000, 9999)}`, email, status: "PAID", paidAt: new Date(), stockDeducted: true,
    paymentProvider: "test", shippingMethod: "Pošta Slovenije — standard", shippingCents: 390,
    subtotalCents: 3499, totalCents: 3889, vatCents: 701,
    shippingAddress: { fullName: "Živa Ščuk", line1: "Testna ulica 1", postalCode: "1000", city: "Ljubljana", country: "SI" },
  } });
  fixture.orderIds.push(order.id);
  return order;
}

async function fillWithdrawal(page: Page, input: { email: string; orderNumber: string; received: string | null }) {
  const form = page.locator("[data-withdrawal-form]");
  await form.getByLabel("Ime in priimek", { exact: true }).fill("Živa Ščuk");
  await form.getByLabel("E-pošta ob naročilu", { exact: true }).fill(input.email);
  await form.getByLabel("Naslov potrošnika", { exact: true }).fill("Testna ulica 1, 1000 Ljubljana");
  await form.getByLabel("Številka naročila", { exact: true }).fill(input.orderNumber);
  // The receipt date is asked only once the consumer says the goods have arrived.
  await expect(form.locator('[name="receivedAt"]')).toHaveCount(0);
  await form.locator(`input[name="deliveryStatus"][value="${input.received ? "received" : "not_received"}"]`).check();
  if (input.received) await form.locator('[name="receivedAt"]').fill(input.received);
  else await expect(form.locator('[name="receivedAt"]')).toHaveCount(0);
  await form.getByLabel("Blago, od katerega odstopate", { exact: true }).fill("1 × Belilni trakci za zobe");
  await form.locator('[name="privacyAccepted"]').check();
  await form.getByRole("button", { name: "Pošlji odstop od pogodbe" }).click();
  await expect(page.locator("[data-withdrawal-success]")).toBeVisible();
  // The confirmation with its reference is brought into view and focused (QA M14).
  await expect(page.locator("[data-withdrawal-success] h3")).toBeFocused();
  await expect(page.locator("[data-withdrawal-reference]")).toBeInViewport();
  return (await page.locator("[data-withdrawal-reference]").textContent())!;
}

test("online withdrawal links the order by its e-mail, files a RETURN/WITHDRAWAL ticket and mails statutory content only to staff", async ({ page, fixture }) => {
  const email = `withdraw-${fixture.id}@test.si`;
  fixture.emails.add(email);
  const order = await paidOrder(fixture, email);

  await page.goto("/odstop-od-pogodbe");
  await dismissCmp(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Odstop od pogodbe");
  await expect(page.locator("[data-withdrawal-pdf]")).toHaveAttribute("href", "/odstop-od-pogodbe/obrazec.pdf");
  await expect(page.locator("[data-withdrawal-section] [data-guarantee-link]")).toHaveAttribute("href", "/garancija-vracila-denarja");
  // Phase 9 step 4 draft fixes: ZVPot-1, refund counted from the notice, §4 only points to the guarantee page.
  const body = page.locator(".content-prose");
  await expect(body).toContainText("(ZVPot-1)");
  await expect(body).toContainText("najpozneje pa v 14 dneh od dne, ko prejmemo vaše obvestilo o odstopu od pogodbe");
  await expect(body).not.toContainText("od prejema vrnjenega blaga");
  await expect(body).not.toContainText("Podrobnosti posredujemo ob prijavi");
  await expect(body.locator('a[href="/garancija-vracila-denarja"]')).toHaveCount(1);
  await expect(page.locator("[data-withdrawal-form]").getByRole("link", { name: "Preberite politiko zasebnosti" })).toHaveAttribute("href", "/politika-zasebnosti");

  const reference = await fillWithdrawal(page, { email, orderNumber: order.number.toLowerCase(), received: "2026-09-01" });
  await expect(page.locator("[data-withdrawal-success]")).toContainText("14 dneh od prejema vašega obvestila o odstopu");
  await expect(page.locator("[data-withdrawal-unlinked]")).toHaveCount(0);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { reference } });
  expect(ticket).toMatchObject({ topic: "RETURN", reason: "WITHDRAWAL", orderId: order.id, orderProof: "EMAIL_NUMBER", email, privacyVersion: PRIVACY_NOTICE_VERSIONS.withdrawal });
  expect(ticket.details).toMatchObject({ kind: "withdrawal", items: "1 × Belilni trakci za zobe", goodsReceived: true, receivedAt: "2026-09-01", address: "Testna ulica 1, 1000 Ljubljana" });
  // The composed message staff read carries the date in the Slovenian form, like the rows (QA T4-F11).
  expect(ticket.message).toContain("Blago prejeto dne: 1. 9. 2026");
  expect(ticket.message).not.toContain("2026-09-01");
  expect(ticket.details).not.toHaveProperty("claimedOrderNumber");
  expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");

  const staff = await waitForMailMessage(fixture.supportEmail);
  const staffBody = `${staff.Text ?? ""}\n${staff.HTML ?? ""}`;
  expect(staff.Subject).toContain(reference);
  expect(staff.Subject.startsWith("[ODSTOP]")).toBe(true);
  expect(staffBody).toContain("ZVPot-1");
  expect(staffBody).toContain("Odstop od pogodbe (14 dni)");
  expect(staffBody).toContain("Testna ulica 1, 1000 Ljubljana");
  expect(staffBody).toContain(order.number);
  expect(staffBody).toContain("Blago prejeto dne: 1. 9. 2026");
  expect(staffBody).not.toContain("Blago prejeto dne: 2026-09-01");
  expect(staffBody).toContain("učinkuje z obvestilom potrošnika");
  expect(staffBody).not.toContain("ne prekliče naročila");
  const customer = await waitForMailMessage(email);
  const customerBody = `${customer.Text ?? ""}\n${customer.HTML ?? ""}`;
  expect(customerBody).toContain(reference);
  expect(customerBody).toContain("14 dneh od prejema vašega obvestila o odstopu");
  expect(customerBody).not.toContain("Testna ulica");
});

test("a withdrawal that matches no order, sent before delivery, is still recorded without an order link", async ({ page, fixture }) => {
  const email = `withdraw-unmatched-${fixture.id}@test.si`;
  fixture.emails.add(email);
  const order = await paidOrder(fixture, `buyer-${fixture.id}@test.si`);

  await page.goto("/odstop-od-pogodbe");
  await dismissCmp(page);
  const reference = await fillWithdrawal(page, { email, orderNumber: order.number, received: null });
  await expect(page.locator("[data-withdrawal-unlinked]")).toBeVisible();

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { reference } });
  expect(ticket).toMatchObject({ topic: "RETURN", reason: "WITHDRAWAL", orderId: null, orderNumber: null, orderProof: null, email });
  expect(ticket.details).toMatchObject({ kind: "withdrawal", goodsReceived: false, receivedAt: "", claimedOrderNumber: order.number });
  expect(ticket.message).toContain("Blago še ni prejeto");

  const staff = await waitForMailMessage(fixture.supportEmail);
  const staffBody = `${staff.Text ?? ""}\n${staff.HTML ?? ""}`;
  expect(staff.Subject).toContain(reference);
  expect(staffBody).toContain(order.number);
  expect(staffBody).toContain("ni samodejno povezana z naročilom");
  expect(staffBody).toContain("Potrošnik je blago že prejel: Ne");
  const customer = await waitForMailMessage(email);
  expect(`${customer.Text ?? ""}\n${customer.HTML ?? ""}`).toContain(reference);
});

test("model form PDF downloads; guarantee page is linked from PDP and footer; complaint CTAs prefill the contact topic", async ({ page, request }) => {
  const pdf = await request.get("/odstop-od-pogodbe/obrazec.pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect(pdf.headers()["content-disposition"]).toContain("attachment");
  expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  const guarantee = await request.get("/garancija-vracila-denarja");
  expect(guarantee.status()).toBe(200);
  const guaranteeHtml = await guarantee.text();
  expect(guaranteeHtml).toContain("Jamstvo vračila denarja");
  expect(guaranteeHtml).toContain("Osnutek dokumenta");
  expect(guaranteeHtml).toContain("ne vpliva na zakonske pravice potrošnika");
  // Phase 9 step 4: the EU ODR platform closed on 20 July 2025; the terms list no fixed payment methods.
  const complaintsHtml = await (await request.get("/reklamacije")).text();
  expect(complaintsHtml).toContain("izvensodno reševanje potrošniških sporov (IRPS)");
  expect(complaintsHtml).not.toContain("consumers/odr");
  const termsHtml = await (await request.get("/pogoji-poslovanja")).text();
  expect(termsHtml).toContain("Načini plačila, ki so na voljo, so prikazani na blagajni pred oddajo naročila.");
  expect(termsHtml).not.toContain("Google Pay in Klarna");
  expect(await (await request.get("/izdelek/belilni-trakci-za-zobe")).text()).toContain('href="/garancija-vracila-denarja"');
  const home = await (await request.get("/")).text();
  expect(home).toContain('href="/garancija-vracila-denarja"');
  expect(home).toContain('href="/prijava-nezelenega-ucinka"');
  expect(await (await request.get("/sitemap.xml")).text()).toContain("garancija-vracila-denarja");

  await page.goto("/reklamacije");
  await dismissCmp(page);
  await expect(page.locator("[data-complaint-ctas]")).toBeVisible();
  await expect(page.locator("[data-complaint-cta]")).toHaveCount(5);
  await page.locator('[data-complaint-cta="damaged"]').click();
  await expect(page).toHaveURL(/\/kontakt\?tema=DAMAGED/);
  await expect(page.locator('input[name="contact-topic"][value="DAMAGED"]')).toBeChecked();
  await expect(page.locator("#contact-photos")).toBeVisible();
  await page.goto("/kontakt?tema=NOPE");
  await expect(page.locator('input[name="contact-topic"]:checked')).toHaveCount(0);
});

test("adverse-event report validates a given batch number, routes structured fields and a private photo to compliance", async ({ page, request, fixture }) => {
  const email = `adverse-${fixture.id}@test.si`;
  fixture.emails.add(email);
  await page.goto("/prijava-nezelenega-ucinka");
  await dismissCmp(page);
  await expect(page.getByRole("heading", { level: 1, name: "Prijava neželenega učinka" })).toBeVisible();
  const adverseHtml = await (await request.get("/prijava-nezelenega-ucinka")).text();
  expect(adverseHtml).toContain("Natisnjena na embalaži");
  expect(adverseHtml).not.toContain("Brez nje prijave ne moremo obravnavati");
  expect(adverseHtml).not.toContain("obveznosti proizvajalca");

  const form = page.locator("[data-adverse-form]");
  await expect(form.getByRole("link", { name: "Preberite politiko zasebnosti" })).toHaveAttribute("href", "/politika-zasebnosti");
  await form.getByLabel("Ime in priimek", { exact: true }).fill("Živa Ščuk");
  await form.getByLabel("E-pošta za odgovor", { exact: true }).fill(email);
  await form.getByLabel("Kdo prijavlja?", { exact: true }).selectOption("PROFESSIONAL");
  await form.getByLabel("Izdelek", { exact: true }).selectOption("serum-korektor-barve-zob");
  await form.getByLabel("Kje ste izdelek kupili?", { exact: true }).fill("nasmeh.si");
  await form.getByLabel("Opis učinka", { exact: true }).fill("Po prvi uporabi je bilo dlesni rdeče in pekoče približno eno uro.");
  await form.locator('input[name="ongoing"][value="no"]').check();
  await form.locator('input[name="medicalTreatment"][value="yes"]').check();
  await form.getByLabel("Podrobnosti zdravniške pomoči (neobvezno)", { exact: true }).fill("Posvet z zobozdravnikom.");
  await form.locator('[name="privacyAccepted"]').check();
  await form.locator('[name="contactPermission"]').check();

  // A batch number is required unless the reporter states it is unknown; a given one must be valid.
  const batch = form.getByLabel("Številka serije", { exact: true });
  await batch.fill("12");
  await form.getByRole("button", { name: "Pošlji prijavo" }).click();
  expect(await batch.evaluate(element => (element as HTMLInputElement).checkValidity())).toBe(false);
  await expect(page.locator("[data-adverse-success]")).toHaveCount(0);

  await batch.fill("LOT 2026-09A");
  const photo = await sharp({ create: { width: 24, height: 24, channels: 3, background: "red" } }).png().toBuffer();
  await form.locator("#adverse-photos").setInputFiles({ name: "reakcija.png", mimeType: "image/png", buffer: photo });
  await form.getByRole("button", { name: "Pošlji prijavo" }).click();
  await expect(page.locator("[data-adverse-success]")).toBeVisible();
  // The confirmation with its reference is brought into view and focused (QA M14).
  await expect(page.locator("[data-adverse-success] h2")).toBeFocused();
  await expect(page.locator("[data-adverse-reference]")).toBeInViewport();
  const reference = (await page.locator("[data-adverse-reference]").textContent())!;

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { reference }, include: { attachments: true } });
  expect(ticket).toMatchObject({ topic: "ADVERSE", reason: "REACTION", email, orderId: null });
  expect(ticket.details).toMatchObject({
    kind: "adverse", reporterType: "PROFESSIONAL", batchNumber: "LOT 2026-09A", batchUnknown: false,
    product: { slug: "serum-korektor-barve-zob" }, ongoing: false, medicalTreatment: true, contactPermission: true,
  });
  expect(ticket.privacyVersion).toBe(PRIVACY_NOTICE_VERSIONS.adverse);
  expect(ticket.attachments).toHaveLength(1);
  expect((await request.get(`/api/support/attachments/${ticket.attachments[0].id}`)).status()).toBe(404);

  const staff = await waitForMailMessage(fixture.complianceEmail);
  const staffBody = `${staff.Text ?? ""}\n${staff.HTML ?? ""}`;
  expect(staffBody).toContain("LOT 2026-09A");
  expect(staffBody).toContain("Serum korektor barve zob");
  expect(staffBody).toContain("Zdravstveni delavec");
  expect(staffBody).toContain("Poiskana zdravniška pomoč: Da");
  expect(staffBody).toContain(`/api/support/attachments/${ticket.attachments[0].id}`);
  const customer = await waitForMailMessage(email);
  const customerBody = `${customer.Text ?? ""}\n${customer.HTML ?? ""}`;
  expect(customerBody).toContain(reference);
  expect(customerBody).toContain("varnost izdelkov");
  expect(customerBody).not.toContain("LOT 2026-09A");
});

test("an adverse-event report without the packaging is accepted once the batch number is stated as unknown", async ({ page, fixture }) => {
  const email = `adverse-nobatch-${fixture.id}@test.si`;
  fixture.emails.add(email);
  await page.goto("/prijava-nezelenega-ucinka");
  await dismissCmp(page);

  const form = page.locator("[data-adverse-form]");
  await form.getByLabel("Ime in priimek", { exact: true }).fill("Živa Ščuk");
  await form.getByLabel("E-pošta za odgovor", { exact: true }).fill(email);
  await form.getByLabel("Izdelek", { exact: true }).selectOption("serum-korektor-barve-zob");
  await form.getByLabel("Kje ste izdelek kupili?", { exact: true }).fill("nasmeh.si");
  await form.getByLabel("Opis učinka", { exact: true }).fill("Po uporabi je bilo dlesni rdeče; embalaže nimam več.");
  await form.locator('input[name="ongoing"][value="no"]').check();
  await form.locator('input[name="medicalTreatment"][value="no"]').check();
  await form.locator('[name="privacyAccepted"]').check();

  const batch = form.getByLabel("Številka serije", { exact: true });
  await form.getByRole("button", { name: "Pošlji prijavo" }).click();
  expect(await batch.evaluate(element => (element as HTMLInputElement).checkValidity())).toBe(false);
  await form.locator('[name="batchUnknown"]').check();
  await expect(batch).toBeDisabled();
  await form.getByRole("button", { name: "Pošlji prijavo" }).click();
  await expect(page.locator("[data-adverse-success]")).toBeVisible();
  const reference = (await page.locator("[data-adverse-reference]").textContent())!;

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { reference } });
  expect(ticket).toMatchObject({ topic: "ADVERSE", email, privacyVersion: PRIVACY_NOTICE_VERSIONS.adverse });
  expect(ticket.details).toMatchObject({ kind: "adverse", batchNumber: "", batchUnknown: true });
  const staff = await waitForMailMessage(fixture.complianceEmail);
  expect(`${staff.Text ?? ""}\n${staff.HTML ?? ""}`).toContain("Prijavitelj številke serije ne pozna (npr. embalaže nima več): Da");
});

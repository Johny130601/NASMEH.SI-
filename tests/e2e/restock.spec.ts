import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { subscribeBackInStockAction } from "@/app/(storefront)/actions/backInStock";
import { setVariantStock } from "@/lib/inventory/restock";
import { db } from "@/lib/db";
import { prisma, MAILPIT_URL, waitForMailMessage } from "./helpers";

/** Phase 6 step 5 (§13.1–13.2): restock alerts end to end. */

const JOB_HEADERS = { authorization: "Bearer jobs_e2e_secret" };

test.afterAll(async () => { await Promise.all([prisma.$disconnect(), db.$disconnect()]); });

async function messagesTo(address: string) {
  const list = await (await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`, { signal: AbortSignal.timeout(5000) })).json() as
    { messages: Array<{ To: Array<{ Address: string }> }> };
  return list.messages.filter((message) => message.To.some((to) => to.Address === address));
}

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
    await expect(banner).toBeHidden();
  }
}

test("restock arms only confirmed, un-notified subscribers, mails once with PDP and unsubscribe links, and the job never duplicates", async ({ page, request }) => {
  const key = randomUUID();
  const product = await prisma.product.create({
    data: {
      title: `Restock fixture ${key}`, slug: `restock-${key}`, status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
      variants: { create: { sku: `RS-${key}`, priceCents: 2499, stock: 0 } },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];
  const emails = {
    confirmed: `restock-a-${key}@test.si`, pending: `restock-b-${key}@test.si`,
    unsubscribed: `restock-c-${key}@test.si`, notified: `restock-d-${key}@test.si`,
  };
  const where = (email: string) => ({ email_productId: { email, productId: product.id } });
  await prisma.backInStockSubscription.createMany({ data: [
    { email: emails.confirmed, productId: product.id, variantId: variant.id, status: "CONFIRMED", confirmToken: `a-${key}`, confirmedAt: new Date() },
    { email: emails.pending, productId: product.id, variantId: variant.id, status: "PENDING", confirmToken: `b-${key}` },
    { email: emails.unsubscribed, productId: product.id, variantId: variant.id, status: "UNSUBSCRIBED", confirmToken: `c-${key}`, confirmedAt: new Date() },
    { email: emails.notified, productId: product.id, variantId: variant.id, status: "CONFIRMED", confirmToken: `d-${key}`, confirmedAt: new Date(), notifiedAt: new Date() },
  ] });
  try {
    expect(await setVariantStock(variant.id, 3)).toEqual({ variantId: variant.id, before: 0, after: 3, armedAlerts: 1 });
    const mail = await waitForMailMessage(emails.confirmed);
    const body = `${mail.Text ?? ""}\n${mail.HTML ?? ""}`;
    expect(mail.Subject).toContain(product.title);
    expect(body).toContain(`/izdelek/${product.slug}`);
    expect(body).toContain("24,99");
    const unsubscribe = body.match(/\/odjava-zaloga\/[A-Za-z0-9_.-]+/)![0];
    const row = await prisma.backInStockSubscription.findUniqueOrThrow({ where: where(emails.confirmed) });
    expect(row.notifiedAt).not.toBeNull();
    expect(row.alertPendingSince).toBeNull();
    expect(row.alertLeaseToken).toBeNull();
    expect(row.alertAttempts).toBe(1);

    // The scheduled job finds nothing left and never duplicates the mail.
    const job = await request.post("/api/jobs/daily", { headers: JOB_HEADERS });
    expect(job.status()).toBe(200);
    expect(((await job.json()) as { restockAlerts: { sent: number; processed: number } }).restockAlerts).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 0 });
    expect(await messagesTo(emails.confirmed)).toHaveLength(1);
    for (const other of [emails.pending, emails.unsubscribed, emails.notified]) expect(await messagesTo(other)).toHaveLength(0);

    // A later sell-out and restock does not mail the notified subscriber again...
    await setVariantStock(variant.id, 0);
    expect((await setVariantStock(variant.id, 5)).armedAlerts).toBe(0);
    // ...until they ask again: a confirmed address re-arms without a new confirmation mail.
    expect(await subscribeBackInStockAction({ email: emails.confirmed, productSlug: product.slug, turnstileToken: "e2e-turnstile-token" }))
      .toEqual({ ok: true, message: expect.stringContaining("že aktivno") });
    const rearmed = await prisma.backInStockSubscription.findUniqueOrThrow({ where: where(emails.confirmed) });
    expect(rearmed).toMatchObject({ status: "CONFIRMED", notifiedAt: null, confirmToken: `a-${key}` });
    expect(await messagesTo(emails.confirmed)).toHaveLength(1);
    await setVariantStock(variant.id, 0);
    expect((await setVariantStock(variant.id, 2)).armedAlerts).toBe(1);
    await expect.poll(async () => (await messagesTo(emails.confirmed)).length).toBe(2);

    // One-click unsubscribe: idempotent, logged, tamper-proof.
    await page.goto(unsubscribe);
    await dismissCmp(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Odjava je uspela");
    expect((await prisma.backInStockSubscription.findUniqueOrThrow({ where: where(emails.confirmed) })).status).toBe("UNSUBSCRIBED");
    expect(await prisma.consentLog.count({ where: { kind: "back-in-stock", choices: { path: ["productSlug"], equals: product.slug } } })).toBe(1);
    await page.goto(unsubscribe);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Odjava je uspela");
    expect(await prisma.consentLog.count({ where: { kind: "back-in-stock", choices: { path: ["productSlug"], equals: product.slug } } })).toBe(1);
    await page.goto(`${unsubscribe.slice(0, -2)}xx`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Povezava ni veljavna");
    await setVariantStock(variant.id, 0);
    expect((await setVariantStock(variant.id, 1)).armedAlerts).toBe(0);
  } finally {
    await prisma.consentLog.deleteMany({ where: { kind: "back-in-stock", choices: { path: ["productSlug"], equals: product.slug } } });
    await prisma.backInStockSubscription.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  }
});

test("an already-confirmed address re-arms from the sold-out PDP without a new confirmation mail", async ({ page }) => {
  const seeded = await prisma.product.findUniqueOrThrow({ where: { slug: "belilni-trakci-potovalni-7" }, include: { variants: true } });
  const email = `restock-ui-${randomUUID()}@test.si`;
  await prisma.backInStockSubscription.create({ data: {
    email, productId: seeded.id, variantId: seeded.variants[0].id, status: "CONFIRMED",
    confirmToken: `ui-${email}`, confirmedAt: new Date(), notifiedAt: new Date(),
  } });
  try {
    await page.goto("/izdelek/belilni-trakci-potovalni-7");
    await dismissCmp(page);
    await page.locator("[data-buy-box]").getByRole("button", { name: "Obvestite me" }).click();
    const dialog = page.getByRole("dialog", { name: "Obvestite me, ko bo spet na zalogi" });
    await dialog.getByLabel("E-pošta").fill(email);
    await dialog.getByRole("button", { name: "Obvestite me" }).click();
    await expect(dialog.getByText(/že aktivno/)).toBeVisible();
    const row = await prisma.backInStockSubscription.findUniqueOrThrow({ where: { email_productId: { email, productId: seeded.id } } });
    expect(row.status).toBe("CONFIRMED");
    expect(row.notifiedAt).toBeNull();
    expect(await messagesTo(email)).toHaveLength(0);
  } finally {
    await prisma.backInStockSubscription.deleteMany({ where: { email } });
  }
});

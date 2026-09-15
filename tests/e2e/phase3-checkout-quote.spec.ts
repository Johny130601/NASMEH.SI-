import { createHash, randomUUID } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";
import { changeVariantPriceInTx, recordInitialPriceInTx } from "@/lib/price-history";
import { checkout } from "@/lib/copy";
import { marketingVersion } from "@/lib/consent-log";
import { prisma, waitForMailTo } from "./helpers";

interface QuoteFixture {
  slug: string;
  variantId: string;
  email: string;
}

// Private, unlisted mouthwash-price fixtures avoid changing the launch catalog,
// its stock or its immutable price history. Only these tests' rows are removed.
const test = base.extend<{ quoteFixture: QuoteFixture }>({
  quoteFixture: async ({ page }, provide) => {
    void page;
    const id = randomUUID();
    const email = `checkout-quote-${id}@test.si`;
    const product = await prisma.$transaction(async tx => {
      const created = await tx.product.create({
        data: {
          title: "Ustna voda — preizkus povzetka", slug: `quote-mouthwash-${id}`,
          status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
          variants: { create: { sku: `QUOTE-${id}`, priceCents: 1999, stock: 10 } },
        },
        include: { variants: true },
      });
      await recordInitialPriceInTx(tx, { variantId: created.variants[0].id, priceCents: 1999 });
      return created;
    });
    try {
      await provide({ slug: product.slug, variantId: product.variants[0].id, email });
    } finally {
      await prisma.$transaction(async tx => {
        const orders = await tx.order.findMany({ where: { email }, select: { number: true } });
        const redemptions = await tx.couponRedemption.findMany({ where: { email }, select: { couponId: true } });
        for (const redemption of redemptions) {
          await tx.coupon.update({ where: { id: redemption.couponId }, data: { usedCount: { decrement: 1 } } });
        }
        if (orders.length) await tx.consentLog.deleteMany({
          where: { kind: "marketing-checkout", OR: orders.map(order => ({ choices: { path: ["orderNumber"], equals: order.number } })) },
        });
        await tx.order.deleteMany({ where: { email } });
        await tx.abandonedCheckout.deleteMany({ where: { email } });
        await tx.subscriber.deleteMany({ where: { email } });
        await tx.product.delete({ where: { id: product.id } });
      });
    }
  },
});

test.afterAll(async () => { await prisma.$disconnect(); });

async function startCheckout(page: Page, fixture: QuoteFixture) {
  await page.goto(`/izdelek/${fixture.slug}`);
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
  await expect(banner).toBeHidden();
  const add = page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico", exact: true });
  await add.click();
  await expect(page.locator("[data-buy-box]")).toContainText("Dodano ✓");
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
  await page.goto("/checkout");
  await expect(page.locator("[data-checkout-wizard]")).toBeVisible();
}

async function expectTotals(page: Page, total: string, shipping: string, vat: string) {
  await expect(page.locator("[data-checkout-summary]")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-checkout-total]")).toHaveText(`${total} €`);
  await expect(page.locator("[data-checkout-shipping]")).toHaveText(`${shipping} €`);
  await expect(page.locator("[data-checkout-vat]")).toHaveText(`${vat} €`);
}

async function contactAndAddress(page: Page, email: string) {
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.locator("[data-continue-contact]").click();
  await page.getByLabel("Ime in priimek", { exact: true }).fill("Živa Ščuk");
  await page.getByLabel("Ulica", { exact: true }).fill("Čopova ulica");
  await page.getByLabel("Hišna številka", { exact: true }).fill("12");
  await page.getByLabel("Kraj", { exact: true }).fill("Ljubljana");
  await page.getByLabel("Poštna številka", { exact: true }).fill("1000");
}

async function review(page: Page) {
  await page.locator("[data-continue-shipping]").click();
  await page.locator('input[name="provider"][value="test"]').check();
  // The terms note belongs next to the order button, not on the payment step.
  await expect(page.locator("[data-legal-terms]")).toHaveCount(0);
  await page.locator("[data-continue-payment]").click();
  await expect(page.locator("[data-place-order]")).toBeEnabled();
  const legalNote = page.locator("[data-review-legal]");
  await expect(legalNote).toContainText(`${checkout.review.legal.termsLead} ${checkout.review.legal.termsLink}.`);
  await expect(legalNote).toContainText(`${checkout.review.legal.withdrawalLead} ${checkout.review.legal.withdrawalLink} ${checkout.review.legal.withdrawalTail}`);
  await expect(page.locator("[data-legal-terms]")).toHaveCount(1);
  await expect(page.locator("[data-legal-withdrawal]")).toHaveCount(1);
  // S6: the legal texts open in a new tab, so the filled-in checkout is never left behind
  for (const selector of ["[data-legal-terms]", "[data-legal-withdrawal]"]) {
    await expect(page.locator(selector)).toHaveAttribute("target", "_blank");
    await expect(page.locator(selector)).toHaveAttribute("rel", "noopener noreferrer");
  }
}

async function expectLegalAcceptance(orderNumber: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { number: orderNumber } });
  // Each accepted page is stored with its published title and body HTML next to the body's SHA-256,
  // so the confirmation can print the accepted text even after the page is edited.
  const page = async (key: string, slug: string) => {
    const row = await prisma.contentPage.findFirstOrThrow({ where: { slug, published: true }, select: { title: true, body: true, updatedAt: true } });
    return {
      key, path: `/${slug}`, slug, updatedAt: row.updatedAt.toISOString(),
      sha256: createHash("sha256").update(row.body, "utf8").digest("hex"), title: row.title, body: row.body,
    };
  };
  expect(order.legalAcceptance).toEqual({
    acceptedAt: expect.any(String), noticeVersion: expect.stringMatching(/^t-[0-9a-f]{12}$/),
    pages: [await page("terms", "pogoji-poslovanja"), await page("withdrawal", "odstop-od-pogodbe")],
  });
}

test("guest quote keeps shipping, TEST10, VAT and the accepted order in sync", async ({ page, quoteFixture }) => {
  await startCheckout(page, quoteFixture);
  // €19.99 merchandise + €3.90 standard delivery, including €4.31 VAT.
  await expectTotals(page, "23,89", "3,90", "4,31");
  await contactAndAddress(page, quoteFixture.email);
  await page.locator('input[name="shippingMethod"][value="ps-express"]').check();
  await expectTotals(page, "26,89", "6,90", "4,85");

  await page.getByLabel("Koda za popust", { exact: true }).fill("TEST10");
  await page.locator("[data-discount-field]").getByRole("button", { name: "Uporabi", exact: true }).click();
  await expect(page.locator("[data-active-code]")).toHaveText("TEST10");
  await expect(page.locator("[data-checkout-summary]")).toContainText("Popust ne velja za pakete, že znižane izdelke in dostavo; ne sešteva se z drugimi ponudbami.");
  // Ten percent rounds to €2.00; the current express selection must survive refresh.
  await expect(page.locator('input[name="shippingMethod"][value="ps-express"]')).toBeChecked();
  await expect(page.locator("[data-discount-line]")).toContainText("2,00");
  await expectTotals(page, "24,89", "6,90", "4,49");
  await review(page);
  await expect(page.locator("[data-review-total]")).toHaveText("Skupaj: 24,89 €");
  // The recap above the button repeats the itemisation, so a phone user does not scroll past the button to see it.
  const recap = page.locator("[data-review-recap]");
  await expect(recap.locator(`[data-review-line='${quoteFixture.variantId}']`)).toContainText("1 × Ustna voda — preizkus povzetka");
  await expect(recap.locator(`[data-review-line='${quoteFixture.variantId}']`)).toContainText("19,99 €");
  await expect(recap.locator("[data-review-subtotal]")).toHaveText("19,99 €");
  await expect(recap.locator("[data-review-discount]")).toHaveText("−2,00 €");
  await expect(recap).toContainText(`${checkout.summary.shipping} (Pošta Slovenije — express)`);
  await expect(recap.locator("[data-review-shipping]")).toHaveText("6,90 €");
  await expect(recap).toContainText(`${checkout.summary.vat} (22 %)`);
  await expect(recap.locator("[data-review-vat]")).toHaveText("4,49 €");

  const submitted = page.waitForRequest(request => request.method() === "POST"
    && !!request.headers()["next-action"] && !!request.postData()?.includes('"quoteToken"'));
  await page.locator("[data-place-order]").click();
  const request = await submitted;
  const [intent] = request.postDataJSON() as Array<Record<string, unknown>>;
  expect(intent).toMatchObject({ email: quoteFixture.email, shippingMethodId: "ps-express", country: "SI", provider: "test" });
  expect(intent.quoteToken).toMatch(/^[a-f0-9]{64}$/);
  expect(intent.checkoutKey).toMatch(/^[a-f0-9]{32}$/);
  expect(Object.keys(intent).filter(key => /price|total|cents|discount|amount|vat/i.test(key))).toEqual([]);
  await expect(page.locator("[data-pay-panel]")).toBeVisible();
  await expect(page.locator("[data-pay-panel]")).toContainText("Skupaj: 24,89 €");
  const orders = await prisma.order.findMany({ where: { email: quoteFixture.email }, include: { items: true } });
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    status: "PENDING", userId: null, subtotalCents: 1999, discountCents: 200,
    shippingCents: 690, totalCents: 2489, vatCents: 449, vatRatePercent: 22,
    currency: "EUR", couponCode: "TEST10", shippingMethod: "Pošta Slovenije — express",
  });
  expect(orders[0].items).toHaveLength(1);
  expect(orders[0].items[0]).toMatchObject({ variantId: quoteFixture.variantId, quantity: 1, unitPriceCents: 1999 });
  await expectLegalAcceptance(orders[0].number);
  // An unticked box is recorded as not given, never as a withdrawal, and enrols nobody.
  const consent = await prisma.consentLog.findFirstOrThrow({ where: { kind: "marketing-checkout", choices: { path: ["orderNumber"], equals: orders[0].number } } });
  expect(consent).toMatchObject({ version: marketingVersion("marketing-checkout"), choices: { marketing: false, action: "not-given", orderNumber: orders[0].number } });
  expect(await prisma.subscriber.count({ where: { email: quoteFixture.email } })).toBe(0);
});

test("a ticked checkout opt-in starts the newsletter double opt-in", async ({ page, quoteFixture }) => {
  await startCheckout(page, quoteFixture);
  await expect(page.locator("[data-checkout-email-notice]")).toContainText(checkout.contact.emailNotice);
  const optIn = page.locator("[data-marketing-optin]");
  await expect(optIn).not.toBeChecked();
  await optIn.check();
  await contactAndAddress(page, quoteFixture.email);
  await review(page);
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-pay-panel]")).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ where: { email: quoteFixture.email } });
  expect(order.marketingOptIn).toBe(true);
  await expectLegalAcceptance(order.number);
  const subscriber = await prisma.subscriber.findUniqueOrThrow({ where: { email: quoteFixture.email } });
  expect(subscriber).toMatchObject({ status: "PENDING", source: "checkout", confirmedAt: null });
  const consent = await prisma.consentLog.findFirstOrThrow({ where: { kind: "marketing-checkout", choices: { path: ["orderNumber"], equals: order.number } } });
  expect(consent).toMatchObject({
    version: marketingVersion("marketing-checkout"),
    choices: { marketing: true, action: "pending-confirmation", orderNumber: order.number, subscriberId: subscriber.id },
  });
  expect(await waitForMailTo(quoteFixture.email)).toContain(`/potrdi/${subscriber.confirmToken}`);
});

test("a price changed after review requires explicit confirmation of a refreshed quote", async ({ page, quoteFixture }) => {
  await startCheckout(page, quoteFixture);
  await contactAndAddress(page, quoteFixture.email);
  await review(page);
  await expectTotals(page, "23,89", "3,90", "4,31");
  await expect(page.locator("[data-review-total]")).toHaveText("Skupaj: 23,89 €");

  // Append history and update only this private variant. No browser refresh:
  // the shopper still holds the earlier, validly signed €23.89 quote.
  await prisma.$transaction(tx => changeVariantPriceInTx(tx, { variantId: quoteFixture.variantId, priceCents: 2499 }));
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-checkout-wizard]").getByRole("alert")).toHaveText("Znesek naročila se je spremenil. Preverite novi povzetek in ponovno potrdite.");
  await expect(page.locator("[data-pay-panel]")).toHaveCount(0);
  expect(await prisma.order.count({ where: { email: quoteFixture.email } })).toBe(0);
  await expectTotals(page, "28,89", "3,90", "5,21");
  await expect(page.locator("[data-review-total]")).toHaveText("Skupaj: 28,89 €");

  await expect(page.locator("[data-place-order]")).toBeEnabled();
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-pay-panel]")).toBeVisible();
  const orders = await prisma.order.findMany({ where: { email: quoteFixture.email }, include: { items: true } });
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({ status: "PENDING", subtotalCents: 2499, shippingCents: 390, totalCents: 2889, vatCents: 521 });
  expect(orders[0].items[0]).toMatchObject({ variantId: quoteFixture.variantId, unitPriceCents: 2499 });
  expect(await prisma.priceHistory.count({ where: { variantId: quoteFixture.variantId } })).toBe(2);
});

import { expect, test, type Page } from "@playwright/test";
import { cart as cartCopy } from "@/lib/copy/cart";
import { catalog } from "@/lib/copy/catalog";
import { checkout as checkoutCopy } from "@/lib/copy/checkout";
import { pdp as pdpCopy } from "@/lib/copy/pdp";
import { dismissCookieBanner, prisma } from "./helpers";

/**
 * Fewer clicks to a purchase (2026-10-03): "Kupi zdaj" on the PDP and "Na
 * blagajno" on the add-to-cart card skip the cart page, `begin_checkout` fires
 * on the checkout for every way in, and the one "Ulica in hišna številka"
 * field — what browser autofill fills — reaches the order as street + number.
 */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

const MOUTHWASH = { slug: "ustna-voda-globinsko-ciscenje", sku: "NAS-UST-500" };

type PushedEvent = { event: string; ecommerce: { items: Array<{ item_id: string; quantity: number }> } };

/** The ecommerce events on this page's dataLayer (consent and gtag entries carry no `ecommerce`). */
async function ecommerceEvents(page: Page): Promise<PushedEvent[]> {
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []).filter(
      (entry) => typeof entry === "object" && entry !== null && "ecommerce" in entry,
    ),
  ) as Promise<PushedEvent[]>;
}

test("Kupi zdaj takes the quantity shown straight to the checkout and never doubles the line", async ({ page }) => {
  await page.goto(`/izdelek/${MOUTHWASH.slug}`);
  // analytics consent, so the events the shorter paths must keep can be read
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await banner.getByRole("button", { name: "Sprejmi vse" }).click();
  await expect(banner).toBeHidden();
  await page.reload();

  const buyBox = page.locator("[data-buy-box]");
  const buyNow = buyBox.getByRole("button", { name: pdpCopy.buyBox.buyNow });
  await buyNow.click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("[data-checkout-wizard]")).toBeVisible();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
  // the checkout is the next screen: no confirmation card on the way
  await expect(page.locator("[data-cart-toast]")).toHaveCount(0);
  await expect.poll(async () => (await ecommerceEvents(page)).map((entry) => entry.event)).toEqual(
    expect.arrayContaining(["add_to_cart", "begin_checkout"]),
  );
  const begin = (await ecommerceEvents(page)).find((entry) => entry.event === "begin_checkout")!;
  expect(begin.ecommerce.items).toEqual([expect.objectContaining({ item_id: MOUTHWASH.sku, quantity: 1 })]);

  // a second click — a product already in the cart — is absorbed, not doubled
  await page.goto(`/izdelek/${MOUTHWASH.slug}`);
  await buyNow.click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
  await expect.poll(async () => (await ecommerceEvents(page)).map((entry) => entry.event)).toContain("begin_checkout");
  // nothing was added, so nothing is reported as added
  expect((await ecommerceEvents(page)).filter((entry) => entry.event === "add_to_cart")).toHaveLength(0);

  // the stepper's quantity is the quantity checked out
  await page.goto(`/izdelek/${MOUTHWASH.slug}`);
  await buyBox.getByLabel(pdpCopy.buyBox.increase).click();
  await buyNow.click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");
});

test("the add-to-cart card goes straight to the checkout as well as to the cart", async ({ page }) => {
  await page.goto("/trgovina");
  await dismissCookieBanner(page);
  await page.locator(`[data-product-card='${MOUTHWASH.slug}']`).getByRole("button", { name: catalog.card.addToCart }).click();
  const toast = page.locator("[data-cart-toast]");
  await expect(toast).toBeVisible();
  await expect(toast.locator("[data-cart-toast-view]")).toHaveAttribute("href", "/cart");
  const toCheckout = toast.locator("[data-cart-toast-checkout]");
  await expect(toCheckout).toHaveText(cartCopy.checkout.cta);
  await toCheckout.click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("[data-checkout-wizard]")).toBeVisible();
  await expect(toast).toHaveCount(0);
});

test("on a 360px phone the card's two buttons sit side by side inside the card", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  // a bundle PDP confirms in place; the other PDPs hand a clean add to the bundle builder
  await page.goto("/izdelek/paket-popolna-rutina");
  await dismissCookieBanner(page);
  await page.locator("[data-sticky-buy-bar]").getByRole("button", { name: pdpCopy.buyBox.addToCart }).click();
  await expect(page.locator("[data-cart-toast]")).toBeVisible();
  // measured once the card's arrival animation (≤ .5 s, AGENTS §8.23) has settled
  await page.waitForTimeout(600);
  const card = await page.locator("[data-cart-toast]").boundingBox();
  const view = await page.locator("[data-cart-toast-view]").boundingBox();
  const toCheckout = await page.locator("[data-cart-toast-checkout]").boundingBox();
  expect(card && view && toCheckout).toBeTruthy();
  expect(view!.x).toBeGreaterThanOrEqual(card!.x);
  expect(toCheckout!.x).toBeGreaterThan(view!.x + view!.width);
  expect(toCheckout!.x + toCheckout!.width).toBeLessThanOrEqual(card!.x + card!.width);
  expect(Math.abs(toCheckout!.y - view!.y)).toBeLessThan(1);
  // the labels fit their halves: nothing overflows a button or the page
  for (const selector of ["[data-cart-toast-view]", "[data-cart-toast-checkout]"]) {
    expect(await page.locator(selector).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("one street field: a line without a house number asks for it, the order keeps street and number apart", async ({ page }) => {
  const email = `ulica-${Date.now()}@test.si`;
  await page.goto(`/izdelek/${MOUTHWASH.slug}`);
  await dismissCookieBanner(page);
  await page.locator("[data-buy-box]").getByRole("button", { name: pdpCopy.buyBox.buyNow }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.locator("[data-continue-contact]").click();
  await page.getByLabel("Ime in priimek").fill("Test Kupec");
  const line = page.getByLabel(checkoutCopy.shipping.streetLineLabel);
  // what browser autofill fills in one go
  await expect(line).toHaveAttribute("autocomplete", "address-line1");
  await expect(page.getByLabel("Hišna številka", { exact: true })).toHaveCount(0);
  await line.fill("Tržaška cesta");
  await page.getByLabel("Kraj").fill("Ljubljana");
  await page.getByLabel("Poštna številka").fill("1000");
  await page.locator("[data-continue-shipping]").click();
  await expect(page.getByText(checkoutCopy.fields.streetLine)).toBeVisible();
  await expect(page.locator("[data-step='1']")).toHaveAttribute("data-open", "true");

  await line.fill("Tržaška cesta 12 a");
  await page.locator("[data-continue-shipping]").click();
  await page.locator("[data-continue-payment]").click();
  await expect(page.locator("[data-step='3']")).toContainText("Tržaška cesta 12 a");
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-pay-panel]")).toBeVisible({ timeout: 15_000 });

  const order = await prisma.order.findFirstOrThrow({ where: { email }, select: { shippingAddress: true } });
  expect(order.shippingAddress).toMatchObject({ street: "Tržaška cesta", streetNumber: "12 a", city: "Ljubljana", postalCode: "1000" });
});

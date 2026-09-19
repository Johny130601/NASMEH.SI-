import { expect, test } from "@playwright/test";
import { setVariantStock } from "@/lib/inventory/restock";
import { db } from "@/lib/db";
import { formatEUR, priceReduction, standardShippingMethod } from "@/lib/pricing";
import { getLowStockThreshold, getShippingSettings } from "@/lib/settings";
import { cart as cartCopy } from "@/lib/copy/cart";
import { catalog } from "@/lib/copy/catalog";
import { trust as trustCopy } from "@/lib/copy/pdp";
import { dismissCookieBanner, prisma } from "./helpers";

/**
 * UI motion + sales hooks (2026-09-16): every hook on a card or a PDP is
 * computed from live data — the history-backed reduction, the bundle's
 * component prices, the real stock under the admin's threshold, the shipping
 * Setting — and the add-to-cart confirmation card leads to the cart.
 *
 * Every figure below is derived from the stored rows and the Settings the page
 * itself reads, never typed into the spec: a seed or Setting change must move
 * the expectation with it, not fail the spec for the wrong reason.
 */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await Promise.all([prisma.$disconnect(), db.$disconnect()]);
});

/** Money and copy carry non-breaking spaces; compare on one kind of space. */
const flat = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim();

/** The reduction the stored price history announces — the figures the surfaces must show. */
async function announcedReduction(sku: string) {
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { sku },
    select: { id: true, priceCents: true, compareAtPriceCents: true },
  });
  const history = await prisma.priceHistory.findMany({
    where: { variantId: variant.id },
    select: { priceCents: true, compareAtPriceCents: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return priceReduction(variant, history, new Date());
}

/** The bundle's value line: its components' current prices against the price the card shows. */
async function bundleValue(slug: string) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { slug },
    select: {
      variants: { orderBy: { priceCents: "asc" }, select: { priceCents: true } },
      bundle: {
        select: { items: { select: { quantity: true, variant: { select: { priceCents: true } } } } },
      },
    },
  });
  const priceCents = product.variants[0].priceCents;
  const valueCents = (product.bundle?.items ?? []).reduce(
    (sum, item) => sum + item.quantity * item.variant.priceCents,
    0,
  );
  return {
    priceCents,
    valueCents,
    savingsPercent: Math.floor(((valueCents - priceCents) * 100) / valueCents),
  };
}

/** Delivery estimate and free-shipping threshold exactly as the pages read them. */
async function trustFigures() {
  const shipping = await getShippingSettings();
  return {
    estimate: standardShippingMethod(shipping.methods, shipping.standardCostCents)?.estimate.trim() || null,
    freeThreshold: shipping.freeThresholdCents > 0 ? formatEUR(shipping.freeThresholdCents) : null,
  };
}

test("cards: −X % on the reduced serum, the value line on the bundle, nothing invented elsewhere", async ({ page }) => {
  const reduction = await announcedReduction("NAS-SER-30");
  expect(reduction, "the seeded serum announces a reduction").not.toBeNull();
  const bundle = await bundleValue("paket-popolna-rutina");
  expect(bundle.valueCents, "the seeded bundle costs less than its parts").toBeGreaterThan(bundle.priceCents);
  // the value line and the "−X %" pill never share a card: the reduction wins
  expect(await announcedReduction("NAS-PAK-RUTINA"), "the seeded bundle announces no reduction").toBeNull();

  await page.goto("/trgovina");
  await dismissCookieBanner(page);

  const serum = page.locator("[data-product-card='serum-korektor-barve-zob']");
  expect(flat(await serum.locator("[data-percent-off]").textContent())).toBe(
    flat(catalog.card.percentOff(reduction!.percentOff)),
  );
  // the pill states the same reduction the strikethrough and the 30-day line do
  expect(flat(await serum.locator("span.line-through").first().textContent())).toBe(
    flat(formatEUR(reduction!.priorPriceCents)),
  );

  const bundleCard = page.locator("[data-product-card='paket-popolna-rutina']");
  expect(flat(await bundleCard.locator("[data-bundle-savings]").textContent())).toBe(
    flat(catalog.card.bundleValue(formatEUR(bundle.valueCents), bundle.savingsPercent)),
  );
  await expect(bundleCard.locator("span.line-through")).toHaveCount(0); // value math is not a reduction
  await expect(bundleCard.locator("[data-percent-off]")).toHaveCount(0);

  for (const slug of ["belilni-trakci-za-zobe", "ustna-voda-globinsko-ciscenje", "belilni-trakci-potovalni-7"]) {
    const card = page.locator(`[data-product-card='${slug}']`);
    await expect(card.locator("[data-percent-off]"), slug).toHaveCount(0);
    await expect(card.locator("[data-bundle-savings]"), slug).toHaveCount(0);
    await expect(card.locator("[data-low-stock]"), slug).toHaveCount(0);
  }

  // hover view: the first gallery image that differs from the card image, decorative
  const strips = page.locator("[data-product-card='belilni-trakci-za-zobe']");
  const hover = strips.locator("[data-hover-image]");
  await expect(hover).toHaveAttribute("src", "/uploads/placeholder-gallery-detail.svg");
  await expect(hover).toHaveAttribute("aria-hidden", "true");
  await expect(hover).toHaveCSS("opacity", "0");
  await strips.hover();
  await expect(hover).toHaveCSS("opacity", "1");
});

test("PDP: the −X % pill sits by the price, the trust row reads the shipping Setting", async ({ page, request }) => {
  const reduction = await announcedReduction("NAS-SER-30");
  expect(reduction).not.toBeNull();
  const { estimate, freeThreshold } = await trustFigures();

  await page.goto("/izdelek/serum-korektor-barve-zob");
  const priceBox = page.locator("[data-pdp-price-box]");
  expect(flat(await priceBox.locator("[data-percent-off]").textContent())).toBe(
    flat(catalog.card.percentOff(reduction!.percentOff)),
  );
  expect(flat(await priceBox.locator("[data-omnibus-line]").textContent())).toContain(
    flat(formatEUR(reduction!.priorPriceCents)),
  );

  const trustText = flat(await priceBox.locator("[data-trust-row]").textContent());
  expect(trustText).toContain(flat(trustCopy.delivery(estimate)));
  expect(trustText).toContain(flat(trustCopy.freeShipping(freeThreshold)));
  expect(trustText).toContain(trustCopy.securePayment);
  // the guarantee is the green pill above the row (linked to its terms page), stated once
  expect(trustText).not.toContain("jamstvo");
  const guarantee = priceBox.locator("[data-guarantee-link]");
  await expect(guarantee).toHaveText(trustCopy.guarantee);
  await expect(guarantee).toHaveAttribute("href", trustCopy.guaranteeHref);

  // a plain-price product carries no pill in its price box (the rails may still show the serum's), and the row is server-rendered
  const html = await (await request.get("/izdelek/ustna-voda-globinsko-ciscenje")).text();
  const priceBoxHtml = html.slice(html.indexOf("data-pdp-price-box"), html.indexOf("data-trust-row"));
  expect(priceBoxHtml.length).toBeGreaterThan(0);
  expect(priceBoxHtml).not.toContain("data-percent-off");
  expect(priceBoxHtml).not.toContain("line-through");
  expect(flat(html)).toContain(flat(trustCopy.delivery(estimate)));
});

test("low-stock line: the real count at or under the admin threshold, nothing above it", async ({ page }) => {
  const variant = await prisma.variant.findUniqueOrThrow({ where: { sku: "NAS-UST-500" }, select: { id: true, stock: true } });
  const threshold = await getLowStockThreshold();
  expect(threshold, "the low-stock line is switched on").toBeGreaterThan(0);
  try {
    // stock writes go through the helper (AGENTS §8.13); the line states the stock itself
    await setVariantStock(variant.id, threshold);
    await page.goto("/trgovina");
    const card = page.locator("[data-product-card='ustna-voda-globinsko-ciscenje']");
    await expect(card.locator("[data-low-stock]")).toHaveText(catalog.card.lowStock(threshold));
    await page.goto("/izdelek/ustna-voda-globinsko-ciscenje");
    await expect(page.locator("[data-pdp-price-box] [data-low-stock]")).toHaveText(catalog.card.lowStock(threshold));
    await page.goto("/iskanje?q=ustna");
    await expect(page.locator("[data-product-card='ustna-voda-globinsko-ciscenje'] [data-low-stock]")).toHaveText(
      catalog.card.lowStock(threshold),
    );

    await setVariantStock(variant.id, 1);
    await page.goto("/trgovina");
    await expect(card.locator("[data-low-stock]")).toHaveText(catalog.card.lowStock(1));

    await setVariantStock(variant.id, threshold + 1);
    await page.goto("/trgovina");
    await expect(card.locator("[data-low-stock]")).toHaveCount(0);
    await page.goto("/izdelek/ustna-voda-globinsko-ciscenje");
    await expect(page.locator("[data-low-stock]")).toHaveCount(0);
  } finally {
    await setVariantStock(variant.id, variant.stock);
  }
});

test("add to cart: the button confirms, the card names the item and leads to the cart, Esc dismisses", async ({ page }) => {
  const strips = await prisma.variant.findUniqueOrThrow({
    where: { sku: "NAS-TRK-14" },
    select: { priceCents: true, product: { select: { title: true } } },
  });
  const mouthwash = await prisma.product.findUniqueOrThrow({
    where: { slug: "ustna-voda-globinsko-ciscenje" },
    select: { title: true },
  });

  await page.goto("/izdelek/belilni-trakci-za-zobe");
  await dismissCookieBanner(page);
  const buyBox = page.locator("[data-buy-box]");
  await buyBox.getByRole("button", { name: catalog.card.addToCart }).click();
  await expect(buyBox.getByRole("button", { name: catalog.card.added })).toBeVisible();
  const toast = page.locator("[data-cart-toast]");
  await expect(toast).toBeVisible();
  await expect(toast.locator("[data-cart-toast-title]")).toHaveText(strips.product.title);
  expect(flat(await toast.textContent())).toContain(flat(cartCopy.toast.line(1, formatEUR(strips.priceCents))));
  await expect(toast.locator("[data-cart-toast-view]")).toHaveAttribute("href", "/cart");
  // the card sits below the sticky header and never covers it
  const header = await page.locator("header").boundingBox();
  const card = await toast.locator("[data-cart-toast-title]").boundingBox();
  expect(card!.y).toBeGreaterThan(header!.y + header!.height);
  await page.keyboard.press("Escape");
  await expect(toast).toHaveCount(0);

  // from a card on the shop page, through the card's link into the cart
  await page.goto("/trgovina");
  await page.locator("[data-product-card='ustna-voda-globinsko-ciscenje']").getByRole("button", { name: catalog.card.addToCart }).click();
  await expect(toast.locator("[data-cart-toast-title]")).toHaveText(mouthwash.title);
  await toast.locator("[data-cart-toast-view]").click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator("[data-cart-line='NAS-UST-500']")).toBeVisible();
  await expect(page.locator("[data-cart-line='NAS-TRK-14']")).toBeVisible();
  await expect(page.locator("[data-cart-toast]")).toHaveCount(0);
});

test("add to cart at the per-line cap: the capped notice, no green state and no confirmation card", async ({ page }) => {
  const bundle = await prisma.variant.findUniqueOrThrow({
    where: { sku: "NAS-PAK-RUTINA" },
    select: { maxCartQuantity: true },
  });
  expect(bundle.maxCartQuantity).toBeGreaterThan(0);

  await page.goto("/izdelek/paket-popolna-rutina");
  await dismissCookieBanner(page);
  const buyBox = page.locator("[data-buy-box]");
  const add = buyBox.getByRole("button", { name: catalog.card.addToCart });
  const toast = page.locator("[data-cart-toast]");

  // fill the line to its cap: every one of these adds really adds
  for (let index = 0; index < bundle.maxCartQuantity; index += 1) {
    await add.click();
    await expect(toast).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await expect(page.locator("[data-cart-badge]")).toHaveText(String(bundle.maxCartQuantity));
  await expect(buyBox.locator("[data-atc-notice]")).toHaveCount(0);

  // the add over the cap changes nothing, so it confirms nothing
  await add.click();
  await expect(buyBox.locator("[data-atc-notice='capped']")).toHaveText(catalog.card.atCap);
  await expect(buyBox.getByRole("button", { name: catalog.card.added })).toHaveCount(0);
  await expect(toast).toHaveCount(0);
  await expect(page.locator("[data-cart-badge]")).toHaveText(String(bundle.maxCartQuantity));
  await expect(add).toBeEnabled();
});

test("home: the trust strip and the bundle push render in the initial HTML, the hero poster is untouched", async ({ request }) => {
  const { estimate, freeThreshold } = await trustFigures();
  const html = await (await request.get("/")).text();
  const text = flat(html);
  expect(html).toContain("data-trust-row");
  expect(text).toContain(flat(trustCopy.delivery(estimate)));
  expect(text).toContain(flat(trustCopy.freeShipping(freeThreshold)));
  expect(text).toContain(trustCopy.guarantee);
  expect(text).toContain(trustCopy.securePayment);
  expect(html).toContain('href="/izdelek/paket-popolna-rutina"');
  // nothing in the first viewport reveals on scroll (the poster is the LCP element)
  const hero = html.slice(0, html.indexOf("data-trust-row"));
  expect(hero).not.toContain("ui-reveal");
  expect(hero).toMatch(/fetchpriority="high"|fetchPriority="high"/i);
  expect(html).toContain("ui-reveal");
});

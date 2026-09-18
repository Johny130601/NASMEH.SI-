import { expect, test } from "@playwright/test";
import { setVariantStock } from "@/lib/inventory/restock";
import { db } from "@/lib/db";
import { dismissCookieBanner, prisma } from "./helpers";

/**
 * UI motion + sales hooks (2026-09-16): every hook on a card or a PDP is
 * computed from live data — the history-backed reduction, the bundle's
 * component prices, the real stock under the admin's threshold, the shipping
 * Setting — and the add-to-cart confirmation card leads to the cart.
 */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await Promise.all([prisma.$disconnect(), db.$disconnect()]);
});

test("cards: −X % on the reduced serum, the value line on the bundle, nothing invented elsewhere", async ({ page }) => {
  await page.goto("/trgovina");
  await dismissCookieBanner(page);

  const serum = page.locator("[data-product-card='serum-korektor-barve-zob']");
  await expect(serum.locator("[data-percent-off]")).toHaveText("−20 %");
  // the pill states the same reduction the strikethrough and the 30-day line do
  await expect(serum.locator("span.line-through").first()).toContainText("24,99");

  const bundle = page.locator("[data-product-card='paket-popolna-rutina']");
  const value = (await bundle.locator("[data-bundle-savings]").textContent())?.replace(/\s+/g, " ") ?? "";
  expect(value).toContain("Vrednost 74,97 €");
  expect(value).toContain("prihranite 33 %");
  await expect(bundle.locator("span.line-through")).toHaveCount(0); // value math is not a reduction
  await expect(bundle.locator("[data-percent-off]")).toHaveCount(0);

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
  await page.goto("/izdelek/serum-korektor-barve-zob");
  const priceBox = page.locator("[data-pdp-price-box]");
  await expect(priceBox.locator("[data-percent-off]")).toHaveText("−20 %");
  await expect(priceBox.locator("[data-omnibus-line]")).toContainText("24,99");

  const trust = priceBox.locator("[data-trust-row]");
  await expect(trust).toContainText("Dostava 2–4 delovne dni");
  await expect(trust).toContainText(/Brezplačna dostava od 45,00/);
  await expect(trust).toContainText("Varno plačilo");
  // the guarantee is the green pill above the row (linked to its terms page), stated once
  await expect(trust).not.toContainText("jamstvo");
  const guarantee = priceBox.locator("[data-guarantee-link]");
  await expect(guarantee).toHaveText("30-dnevno jamstvo vračila denarja");
  await expect(guarantee).toHaveAttribute("href", "/garancija-vracila-denarja");

  // a plain-price product carries no pill in its price box (the rails may still show the serum's), and the row is server-rendered
  const html = await (await request.get("/izdelek/ustna-voda-globinsko-ciscenje")).text();
  const priceBoxHtml = html.slice(html.indexOf("data-pdp-price-box"), html.indexOf("data-trust-row"));
  expect(priceBoxHtml.length).toBeGreaterThan(0);
  expect(priceBoxHtml).not.toContain("data-percent-off");
  expect(priceBoxHtml).not.toContain("line-through");
  expect(html).toContain("Dostava 2–4 delovne dni");
});

test("low-stock line: the real count at or under the admin threshold, nothing above it", async ({ page }) => {
  const variant = await prisma.variant.findUniqueOrThrow({ where: { sku: "NAS-UST-500" }, select: { id: true, stock: true } });
  const threshold = await prisma.setting.findUnique({ where: { key: "inventory.lowStockThreshold" } });
  expect(threshold?.value).toBe(5);
  try {
    // stock writes go through the helper (AGENTS §8.13); 100 → 3 arms nothing
    await setVariantStock(variant.id, 3);
    await page.goto("/trgovina");
    const card = page.locator("[data-product-card='ustna-voda-globinsko-ciscenje']");
    await expect(card.locator("[data-low-stock]")).toHaveText("Samo še 3 kosi na zalogi");
    await page.goto("/izdelek/ustna-voda-globinsko-ciscenje");
    await expect(page.locator("[data-pdp-price-box] [data-low-stock]")).toHaveText("Samo še 3 kosi na zalogi");
    await page.goto("/iskanje?q=ustna");
    await expect(page.locator("[data-product-card='ustna-voda-globinsko-ciscenje'] [data-low-stock]")).toHaveText("Samo še 3 kosi na zalogi");

    await setVariantStock(variant.id, 1);
    await page.goto("/trgovina");
    await expect(card.locator("[data-low-stock]")).toHaveText("Samo še 1 kos na zalogi");

    await setVariantStock(variant.id, 6);
    await page.goto("/trgovina");
    await expect(card.locator("[data-low-stock]")).toHaveCount(0);
    await page.goto("/izdelek/ustna-voda-globinsko-ciscenje");
    await expect(page.locator("[data-low-stock]")).toHaveCount(0);
  } finally {
    await setVariantStock(variant.id, variant.stock);
  }
});

test("add to cart: the button confirms, the card names the item and leads to the cart, Esc dismisses", async ({ page }) => {
  await page.goto("/izdelek/belilni-trakci-za-zobe");
  await dismissCookieBanner(page);
  const buyBox = page.locator("[data-buy-box]");
  await buyBox.getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(buyBox.getByRole("button", { name: "Dodano ✓" })).toBeVisible();
  const toast = page.locator("[data-cart-toast]");
  await expect(toast).toBeVisible();
  await expect(toast.locator("[data-cart-toast-title]")).toHaveText("Belilni trakci za zobe (14 uporab)");
  await expect(toast).toContainText("1 × 34,99");
  await expect(toast.locator("[data-cart-toast-view]")).toHaveAttribute("href", "/cart");
  // the card sits below the sticky header and never covers it
  const header = await page.locator("header").boundingBox();
  const card = await toast.locator("[data-cart-toast-title]").boundingBox();
  expect(card!.y).toBeGreaterThan(header!.y + header!.height);
  await page.keyboard.press("Escape");
  await expect(toast).toHaveCount(0);

  // from a card on the shop page, through the card's link into the cart
  await page.goto("/trgovina");
  await page.locator("[data-product-card='ustna-voda-globinsko-ciscenje']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(toast.locator("[data-cart-toast-title]")).toHaveText("Ustna voda za globinsko čiščenje");
  await toast.locator("[data-cart-toast-view]").click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator("[data-cart-line='NAS-UST-500']")).toBeVisible();
  await expect(page.locator("[data-cart-line='NAS-TRK-14']")).toBeVisible();
  await expect(page.locator("[data-cart-toast]")).toHaveCount(0);
});

test("home: the trust strip and the bundle push render in the initial HTML, the hero poster is untouched", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("data-trust-row");
  expect(html).toContain("Dostava 2–4 delovne dni");
  expect(html).toMatch(/Brezplačna dostava od 45,00/);
  expect(html).toContain("30-dnevno jamstvo vračila denarja");
  expect(html).toContain("Varno plačilo");
  expect(html).toContain('href="/izdelek/paket-popolna-rutina"');
  // nothing in the first viewport reveals on scroll (the poster is the LCP element)
  const hero = html.slice(0, html.indexOf("data-trust-row"));
  expect(hero).not.toContain("ui-reveal");
  expect(hero).toMatch(/fetchpriority="high"|fetchPriority="high"/i);
  expect(html).toContain("ui-reveal");
});

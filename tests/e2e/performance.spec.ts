import { expect, test } from "@playwright/test";

// Phase 9 step 2: the delivery details Lighthouse budgets depend on, asserted on the built server.
test("fonts are preloaded and served immutable; the hero and the catalog banner reserve their boxes", async ({ request }) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  const html = await home.text();
  const link = new RegExp('<link[^>]*href="/fonts/jakarta-sl.woff2"[^>]*>').exec(html)?.[0] ?? "";
  expect(link, "the font subset is preloaded").toContain('rel="preload"');
  expect(link).toContain('as="font"');
  const hero = /<img[^>]*fetchpriority="high"[^>]*>/i.exec(html)?.[0] ?? "";
  expect(hero, "seeded hero poster carries fetchpriority=high").toContain("/uploads/placeholder-hero.svg");

  const font = await request.get("/fonts/jakarta-sl.woff2");
  expect(font.status()).toBe(200);
  expect(font.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  const placeholder = await request.get("/uploads/placeholder-hero.svg");
  expect(placeholder.headers()["cache-control"]).toBe("public, max-age=86400");

  // the all-products view is a text band since 2026-10-10 (nothing to reserve, nothing to shift); a
  // collection's own banner keeps its sized box (catalog.spec checks that path)
  const catalog = await (await request.get("/trgovina")).text();
  expect(catalog).toContain('data-collection-band="all"');
  expect(catalog).not.toContain("placeholder-trgovina-wide.svg");
  // the first card's image is the LCP candidate and must not be lazy
  expect(catalog).toMatch(/<img[^>]*src="\/uploads\/placeholder-trakci\.svg"[^>]*loading="eager"/);
});

test("the product JSON-LD carries the SKU next to the offer", async ({ request }) => {
  const html = await (await request.get("/izdelek/belilni-trakci-za-zobe")).text();
  const block = /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"Product".*?)<\/script>/.exec(html)?.[1];
  expect(block).toBeTruthy();
  const product = JSON.parse(block!);
  expect(product.sku).toBe("NAS-TRK-14");
  expect(product.offers.priceCurrency).toBe("EUR");
  expect(product.brand.name).toBeTruthy();
});

test("the marquee link, the cart link and the shipping progress bar have accessible names", async ({ page }) => {
  await page.goto("/");
  // The consent dialog overlays the page until answered; the click below needs it gone.
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
    await banner.waitFor({ state: "hidden" });
  }
  const marqueeLink = page.locator(".ui-marquee a").first();
  await expect(marqueeLink).toHaveAttribute("aria-label", /.+/);
  await expect(page.locator(".ui-marquee")).toHaveClass(/text-dark-1/);
  await expect(page.locator("[data-cart-link]")).toHaveAttribute("aria-label", "Odpri košarico");
  await page.goto("/trgovina");
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await page.locator("[data-cart-badge]").waitFor();
  await expect(page.locator("[data-cart-link]")).toHaveAttribute("aria-label", "Odpri košarico (1)");
  await page.goto("/cart");
  const bar = page.locator("[role='progressbar']");
  await expect(bar).toHaveAttribute("aria-labelledby", "shipping-progress-label");
  await expect(page.locator("#shipping-progress-label")).toHaveText(/.+/);
});

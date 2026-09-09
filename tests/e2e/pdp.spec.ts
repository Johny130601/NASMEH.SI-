import { expect, test } from "@playwright/test";

/** PDP e2e (§6) — SSR audit + interactions. */
test.describe.configure({ mode: "serial" });

test("PDP SSR: H1, price, accordion bodies, FAQ, breadcrumbs, JSON-LD in initial HTML", async ({
  request,
}) => {
  const response = await request.get("/izdelek/belilni-trakci-za-zobe");
  expect(response.status()).toBe(200);
  const html = await response.text();

  expect(html).toContain("<h1");
  expect(html).toContain("Belilni trakci za zobe (14 uporab)");
  expect(html).toContain("34,99");
  expect(html).toContain("2,50"); // unit price anchor
  expect(html).not.toContain("s Klarna"); // Disabled until SI-buyer eligibility is verified.
  // breadcrumbs
  expect(html).toContain("Domov");
  expect(html).toContain("Trgovina");
  // accordion bodies server-rendered
  expect(html).toContain("aktivni belilni kompleks");
  expect(html).toContain("Cellulose Gum"); // INCI
  expect(html).toContain("Jamstvo vračila denarja");
  // FAQ + education
  expect(html).toContain("Imate vprašanja? Imamo odgovore");
  expect(html).toContain("Protokol v 3 korakih");
  // gallery: first image prioritized (React hoists it to a preload link)
  expect(html).toMatch(/fetchPriority="high"|fetchpriority="high"/);
  // JSON-LD: Product+Offer, BreadcrumbList, FAQPage
  const types = [
    ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs),
  ].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
  const typeNames = types.map((t) => t["@type"]);
  expect(typeNames).toContain("Product");
  expect(typeNames).toContain("BreadcrumbList");
  expect(typeNames).toContain("FAQPage");
  const product = types.find((t) => t["@type"] === "Product");
  const offers = product?.offers as Record<string, unknown>;
  expect(offers?.price).toBe("34.99");
  expect(offers?.priceCurrency).toBe("EUR");
  expect(offers?.availability).toContain("InStock");
});

test("PDP Omnibus 30-day-low line + compare-at on discounted serum", async ({
  request,
}) => {
  const html = await (
    await request.get("/izdelek/serum-korektor-barve-zob")
  ).text();
  expect(html).toContain("Najnižja cena v zadnjih 30 dneh");
  expect(html).toContain("line-through");
});

test("bundle PDP: components + savings math vs summed prices", async ({
  request,
}) => {
  const html = await (
    await request.get("/izdelek/paket-popolna-rutina")
  ).text();
  expect(html).toContain("Vsebina paketa");
  expect(html).toContain("Belilni trakci za zobe (14 uporab)");
  expect(html).toContain("Ustna voda za globinsko čiščenje");
  expect(html).toContain("Serum korektor barve zob");
  // 3499+1999+1999 = 74,97 € value — save 33 %
  expect(html).toContain("74,97");
  expect(html).toContain("prihranite 33 %");
});

test("PDP accordions toggle + buy box stepper + disabled ATC", async ({
  page,
}) => {
  await page.goto("/izdelek/belilni-trakci-za-zobe");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }

  // accordion opens (details/summary)
  const inci = page.getByText("Sestavine (INCI)");
  await inci.click();
  await expect(
    page.getByText(/Aqua, Glycerin, PVP/).first(),
  ).toBeVisible();

  // qty stepper: minus disabled at 1, plus works
  const buyBox = page.locator("[data-buy-box]");
  const qtyValue = buyBox.locator("[aria-live='polite']");
  await expect(buyBox.getByLabel("Zmanjšaj količino")).toBeDisabled();
  await buyBox.getByLabel("Povečaj količino").click();
  await buyBox.getByLabel("Povečaj količino").click();
  await expect(qtyValue).toHaveText("3");
  await buyBox.getByLabel("Zmanjšaj količino").click();
  await expect(qtyValue).toHaveText("2");

  // ATC is LIVE (Phase 3a): enabled and adds to cart
  const atc = buyBox.getByRole("button", { name: "Dodaj v košarico" });
  await expect(atc).toBeEnabled();
  await atc.click();
  await expect(buyBox.getByRole("button", { name: "Dodano ✓" })).toBeVisible();
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");

  // sticky buy bar present
  await expect(
    page.locator("div.fixed").getByText("Belilni trakci za zobe (14 uporab)"),
  ).toBeVisible();
});

test("sold-out PDP: Obvestite me replaces ATC, page stays merchandised", async ({
  page,
}) => {
  await page.goto("/izdelek/belilni-trakci-potovalni-7");
  await expect(page.getByText("Razprodano").first()).toBeVisible();
  await expect(
    page.locator("[data-buy-box]").getByRole("button", { name: "Obvestite me" }),
  ).toBeVisible();
  await expect(page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico" })).toHaveCount(0);
  // still merchandised: USP chips + cross-sell
  await expect(page.getByText("Za na pot", { exact: true })).toBeVisible();
  await expect(page.getByText("Dopolni svojo rutino")).toBeVisible();
});

test("unknown product slug → 404", async ({ request }) => {
  const response = await request.get("/izdelek/neobstaja");
  expect(response.status()).toBe(404);
});

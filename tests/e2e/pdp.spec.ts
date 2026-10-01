import { expect, test } from "@playwright/test";
import { pdp } from "@/lib/copy/pdp";
import { prisma } from "./helpers";

/** PDP e2e (§6) — SSR audit + interactions. */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

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
  expect(html).toContain("zadrži formulo ob površini zob"); // Kako deluje
  expect(html).toContain("Cellulose Gum"); // INCI
  expect(html).toContain("Jamstvo vračila denarja");
  // delivery accordion reads the shipping Setting (standard SI method estimate + free threshold), no hard-coded figures
  expect(html).toContain("Predviden rok dostave po Sloveniji: 2–4 delovne dni.");
  expect(html).toMatch(/Brezplačna dostava pri naročilih od 45,00/);
  // Phase 9 step 4 claims discipline: the guarantee accordion summarises and links the terms page,
  // the claim notes carry a qualifier and no unsubstantiated figures or absolute promises.
  // operator HTML is sanitised on render (AGENTS §8.24): the link survives, its class does not — .content-prose styles it
  expect(html).toContain('<a href="/garancija-vracila-denarja">Jamstvo vračila denarja</a>');
  // no claim on this product carries a "^" marker, so the guarantee title carries none (QA T1-14)
  expect(html).toContain(`>${pdp.accordions.guarantee.replace(/^\^/, "")}<`);
  expect(html).not.toContain(pdp.accordions.guarantee);
  expect(html).toContain("Jamstvo ne vpliva na vaše zakonske pravice");
  expect(html).toContain("Opombe k navedbam");
  expect(html).toContain("Rezultati se lahko razlikujejo");
  for (const removed of ["ni nobenega tveganja", "aktivni belilni kompleks", "n = 52", "ne čutijo", "parabenov", "Prevladujočih dokazov"]) {
    expect(html, removed).not.toContain(removed);
  }
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
  // the label names the rule's anchor (30 days before the reduction), not a rolling "last 30 days"
  expect(html).toContain("Najnižja cena v 30 dneh pred znižanjem");
  expect(html).not.toContain("Najnižja cena v zadnjih 30 dneh");
  expect(html).toContain("line-through");
  // buy box: struck figure = history-backed prior price = the 30-day line
  const buyBoxStrike = html.match(/text-base text-mid-2 line-through">([^<]*)</);
  expect(buyBoxStrike?.[1]).toContain("24,99");
  expect(html).toMatch(/data-omnibus-line="true">Najnižja cena v 30 dneh pred znižanjem(?:<!-- -->)?: (?:<!-- -->)?24,99/);
});

test("PDP without an announced reduction shows the plain price only", async ({
  request,
}) => {
  const html = await (
    await request.get("/izdelek/ustna-voda-globinsko-ciscenje")
  ).text();
  // the buy box price has no strikethrough (rails may still show the serum's)
  expect(html).not.toMatch(/text-base text-mid-2 line-through/);
});

test("bundle PDP: components + savings math vs summed prices", async ({
  request,
  page,
}) => {
  const html = await (
    await request.get("/izdelek/paket-popolna-rutina")
  ).text();
  expect(html).toContain("Vsebina paketa");
  expect(html).toContain("Belilni trakci za zobe (14 uporab)");
  expect(html).toContain("Ustna voda za globinsko čiščenje");
  expect(html).toContain("Serum korektor barve zob");
  expect(html).toContain("74,97");

  // The savings line is asserted on its rendered text: in the raw HTML React separates the
  // adjacent text nodes with <!-- --> markers, so "prihranite 33 %" never appears contiguously.
  // 3499+1999+1999 = 74,97 € value, bundle 49,99 € → save 33 %
  const normalise = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();
  const cents = (text: string | null) => Math.round(Number(normalise(text).replace(/[^\d,]/g, "").replace(",", ".")) * 100);
  await page.goto("/izdelek/paket-popolna-rutina");
  const bundleCard = page.getByRole("heading", { name: "Vsebina paketa", exact: true, level: 2 }).locator("xpath=..");
  const savingsLine = normalise(await bundleCard.locator(":scope > p").textContent());
  // a sentence of its own: capitalised, the value first (QA T1-14)
  expect(savingsLine).toContain("Vrednost 74,97 €");
  expect(savingsLine).toContain("prihranite 33 %");
  // the line is computed from the listed components (price × quantity) against the price the bundle
  // sells at (the JSON-LD offer = variant price, which the admin bundle save keeps equal to Bundle.priceCents)
  const rows = bundleCard.locator("li");
  await expect(rows).toHaveCount(3);
  let valueCents = 0;
  for (const row of await rows.all()) {
    const quantity = Number(normalise(await row.locator("span.text-mid-2").textContent()).replace(/\D/g, ""));
    valueCents += cents(await row.locator(":scope > span").last().textContent()) * quantity;
  }
  expect(valueCents).toBe(7497);
  expect(cents(savingsLine.slice(0, savingsLine.indexOf("€")))).toBe(valueCents);
  const product = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map((m) => JSON.parse(m[1]) as Record<string, unknown>)
    .find((t) => t["@type"] === "Product");
  const bundleCents = Math.round(Number((product?.offers as Record<string, unknown> | undefined)?.price) * 100);
  expect(bundleCents).toBe(4999);
  const percent = Math.round(((valueCents - bundleCents) / valueCents) * 100);
  expect(savingsLine).toMatch(new RegExp(`prihranite ${percent} %$`));

  // savings and delivery terms come only from the computed line, never from stored chips or FAQ text
  expect(html).not.toContain("Prihranite 33 %");
  expect(html).not.toContain("Brezplačna dostava vključena");
  expect(html).not.toContain("že vključuje brezplačno dostavo");
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

  // sticky buy bar present — asserted before the add, which leaves the page
  const stickyBar = page.locator("[data-sticky-buy-bar]");
  await expect(stickyBar.getByText("Belilni trakci za zobe (14 uporab)")).toBeVisible();
  // §6.15: price, unit price, quantity and the add button, like the buy box (QA T1-11)
  await expect(stickyBar.locator("[data-sticky-unit-price]")).toContainText("2,50");
  await expect(stickyBar.getByLabel("Povečaj količino")).toBeEnabled();
  await expect(stickyBar.getByRole("button", { name: "Dodaj v košarico" })).toBeEnabled();

  // ATC is LIVE (Phase 3a): enabled, and a clean add hands the shopper on to
  // the bundle builder for this product (§7.1) instead of confirming in place
  const atc = buyBox.getByRole("button", { name: "Dodaj v košarico" });
  await expect(atc).toBeEnabled();
  await atc.click();
  await expect(page).toHaveURL(/\/sestavi-paket\?izdelek=belilni-trakci-za-zobe$/);
  await expect(
    page.locator("[data-bundle-builder='belilni-trakci-za-zobe']"),
  ).toBeVisible();
  // both units the stepper asked for really landed
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");
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

test("PDP renders the description sanitised and describes itself in plain text without an SEO description (QA T6-07, S1)", async ({ request }) => {
  const product = await prisma.product.findUniqueOrThrow({
    where: { slug: "ustna-voda-globinsko-ciscenje" },
    select: { id: true, description: true, seoDescription: true },
  });
  // written straight to the row, as a record stored before save-side sanitising would be
  await prisma.product.update({
    where: { id: product.id },
    data: { seoDescription: null, description: '<p>QA opis z <mark>oznako</mark> &amp; več.</p><img src="/x.png" onerror="alert(1)">' },
  });
  try {
    const html = await (await request.get("/izdelek/ustna-voda-globinsko-ciscenje")).text();
    const start = html.indexOf("data-pdp-description");
    expect(start).toBeGreaterThan(-1);
    const block = html.slice(start, html.indexOf("</div>", start));
    expect(block).toContain("<mark>oznako</mark>");
    expect(block).not.toContain("onerror");
    // meta, og and JSON-LD carry text, never escaped markup
    expect(html).toContain('<meta name="description" content="QA opis z oznako &amp; več."');
    expect(html).toContain('<meta property="og:description" content="QA opis z oznako &amp; več."');
    expect(html).not.toContain("&lt;p&gt;");
    const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
      .map((m) => JSON.parse(m[1]) as Record<string, unknown>)
      .find((t) => t["@type"] === "Product");
    expect(ld?.description).toBe("QA opis z oznako & več.");
  } finally {
    await prisma.product.update({
      where: { id: product.id },
      data: { description: product.description, seoDescription: product.seoDescription },
    });
  }
});

test("sticky buy bar comes to rest above the footer, never over the page end (QA T1-11)", async ({ page }) => {
  await page.goto("/izdelek/belilni-trakci-za-zobe");
  const bar = page.locator("[data-sticky-buy-bar]");
  // at the top of the page it rides the viewport bottom
  const viewport = page.viewportSize()!;
  const atTop = (await bar.boundingBox())!;
  expect(Math.round(atTop.y + atTop.height)).toBeLessThanOrEqual(viewport.height);
  expect(atTop.y + atTop.height).toBeGreaterThan(viewport.height - 2);
  // at the end of the page it sits above the footer instead of covering it
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footer = page.locator("footer").last();
  await expect(footer).toBeInViewport();
  const atEnd = (await bar.boundingBox())!;
  const footerBox = (await footer.boundingBox())!;
  expect(atEnd.y + atEnd.height).toBeLessThanOrEqual(footerBox.y + 1);
});

test("sticky buy bar keeps the price and unit price readable beside its controls on phones (QA T1-11)", async ({ page }) => {
  for (const width of [360, 375, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/izdelek/belilni-trakci-za-zobe");
    const bar = page.locator("[data-sticky-buy-bar]");
    const price = bar.locator("[data-sticky-price]");
    const unitPrice = bar.locator("[data-sticky-unit-price]");
    const stepper = bar.getByLabel("Zmanjšaj količino").locator("..");
    const atc = bar.getByRole("button", { name: "Dodaj v košarico" });
    await expect(unitPrice, `${width}px`).toBeVisible();
    await expect(atc, `${width}px`).toBeVisible();
    const [priceBox, stepperBox, atcBox, barBox] = await Promise.all(
      [price, stepper, atc, bar].map(async (locator) => (await locator.boundingBox())!),
    );
    // the price facts sit on their own row, above the controls: nothing overlaps
    expect(priceBox.y + priceBox.height, `${width}px`).toBeLessThanOrEqual(Math.min(stepperBox.y, atcBox.y) + 1);
    // nothing spills past the viewport and the unit price is not cut to an ellipsis
    expect(atcBox.x + atcBox.width, `${width}px`).toBeLessThanOrEqual(barBox.x + barBox.width);
    const clipped = await unitPrice.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(clipped, `${width}px`).toBe(false);
  }
});

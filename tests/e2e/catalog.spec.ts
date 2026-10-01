import { expect, test } from "@playwright/test";
import { catalog } from "@/lib/copy/catalog";
import { prisma } from "./helpers";

/** /trgovina catalog e2e (§5). */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function dismissCmp(page: import("@playwright/test").Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    // banner hides only after the consent Server Action resolves — waiting
    // prevents a navigation from aborting the action mid-flight
    await banner.waitFor({ state: "hidden" });
  }
}

/** The Product JSON-LD offer availability a PDP states in its initial HTML. */
function offerAvailability(html: string): string | undefined {
  const product = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map((m) => JSON.parse(m[1]) as Record<string, unknown>)
    .find((t) => t["@type"] === "Product");
  return (product?.offers as Record<string, unknown> | undefined)?.availability as string | undefined;
}

/**
 * Anchors that lead to a product page on the home page: hero, banners, footer and the
 * opened shop mega-menu (QA v-a). The initial HTML carries the menus as data for the
 * client components, so it must not name the page either.
 */
async function homeLinksTo(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, slug: string) {
  const html = await (await request.get("/")).text();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await dismissCmp(page);
  await page.getByRole("button", { name: "TRGOVINA", exact: true }).click();
  await expect(page.locator("[data-mega-panel]")).toBeVisible();
  const anchors = await page.locator(`a[href="/izdelek/${slug}"], a[href^="/izdelek/${slug}?"], a[href^="/izdelek/${slug}#"]`).count();
  return { anchors, inHtml: html.includes(`/izdelek/${slug}`) };
}

test("tabs are deep-linkable and switch the collection", async ({ page }) => {
  await page.goto("/trgovina");
  await dismissCmp(page);
  // default tab is "all" (aria-current, no redirect needed)
  await expect(
    page.locator("[data-tab='all'][aria-current='page']"),
  ).toBeVisible();
  // all: 5 products incl. bundle + sold-out travel
  await expect(page.locator("[data-product-card]")).toHaveCount(5);
  // the page names itself in live text, never only in the banner artwork (QA L8, T1-07)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(catalog.title);

  await page.getByRole("link", { name: "Paketi", exact: true }).first().click();
  await expect(page).toHaveURL(/kolekcija=paketi/);
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await expect(
    page.locator("[data-product-card='paket-popolna-rutina']"),
  ).toBeVisible();
  // the tab and the heading are the Collection record's title
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paketi");

  // deep link directly
  await page.goto("/trgovina?kolekcija=beljenje");
  await expect(page.locator("[data-product-card]")).toHaveCount(4);
});

test("collections come from the Collection records: tab, banner, heading, SEO and noindex (QA M4)", async ({ page, request }) => {
  const serum = await prisma.product.findUniqueOrThrow({ where: { slug: "serum-korektor-barve-zob" }, select: { id: true } });
  const slug = `qa-kolekcija-${Date.now()}`;
  const emptySlug = `${slug}-prazna`;
  const banner = "/uploads/placeholder-gallery-detail.svg";
  await prisma.collection.create({
    data: {
      slug,
      title: "QA kolekcija",
      bannerImage: banner,
      seoTitle: "QA naslov kolekcije",
      seoDescription: "QA opis kolekcije za iskalnike",
      noindex: true,
      products: { create: [{ productId: serum.id, position: 0 }] },
    },
  });
  await prisma.collection.create({ data: { slug: emptySlug, title: "QA prazna kolekcija" } });
  try {
    // a new collection gets a tab on the shop; one without listable products does not
    await page.goto("/trgovina");
    await dismissCmp(page);
    await expect(page.locator(`[data-tab='${slug}']`)).toHaveText("QA kolekcija");
    await expect(page.locator(`[data-tab='${emptySlug}']`)).toHaveCount(0);

    await page.locator(`[data-tab='${slug}']`).click();
    await expect(page).toHaveURL(new RegExp(`kolekcija=${slug}`));
    await expect(page.locator(`[data-tab='${slug}'][aria-current='page']`)).toBeVisible();
    await expect(page.locator("[data-product-card]")).toHaveCount(1);
    await expect(page.locator("[data-product-card='serum-korektor-barve-zob']")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("QA kolekcija");
    await expect(page.locator(`[data-collection-banner='${slug}']`)).toHaveAttribute("src", banner);

    // title, description, canonical and robots from the record, in the initial HTML
    const html = await (await request.get(`/trgovina?kolekcija=${slug}`)).text();
    expect(html).toContain("<title>QA naslov kolekcije");
    expect(html).toContain('<meta name="description" content="QA opis kolekcije za iskalnike"');
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    expect(html).toMatch(new RegExp(`<link rel="canonical" href="[^"]*/trgovina\\?kolekcija=${slug}"`));

    // "hide banner text": the heading leaves the screen, never the page
    await prisma.collection.update({ where: { slug }, data: { hideBannerText: true } });
    await page.reload();
    const heading = page.locator("[data-collection-heading]");
    await expect(heading).toHaveAttribute("data-collection-heading", "hidden");
    await expect(heading).toHaveText("QA kolekcija");
    await expect(heading).toHaveClass(/sr-only/);

    // an unknown or empty handle shows everything without pretending to be a collection
    for (const handle of ["ne-obstaja", emptySlug]) {
      await page.goto(`/trgovina?kolekcija=${handle}`);
      await expect(page.locator("[data-tab='all'][aria-current='page']")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(catalog.title);
      await expect(page.locator("[data-product-card]")).toHaveCount(5);
    }
    const unknown = await (await request.get("/trgovina?kolekcija=ne-obstaja")).text();
    expect(unknown).not.toMatch(/<meta name="robots" content="noindex/);
    expect(unknown).toMatch(/<link rel="canonical" href="[^"]*\/trgovina"/);
  } finally {
    await prisma.collection.deleteMany({ where: { slug: { in: [slug, emptySlug] } } });
  }
});

test("every sort option orders correctly", async ({ page }) => {
  const firstCardTitle = (p: typeof page) =>
    p.locator("[data-product-card]").first().getAttribute("data-product-card");

  await page.goto("/trgovina?razvrsti=cena-narascajoce");
  expect(await firstCardTitle(page)).toBe("ustna-voda-globinsko-ciscenje"); // 19,99 first (ties: seed order)

  await page.goto("/trgovina?razvrsti=cena-padajoce");
  expect(await firstCardTitle(page)).toBe("paket-popolna-rutina"); // 49,99 first

  // the retired, misspelt slugs keep a shared link working (QA L10)
  await page.goto("/trgovina?razvrsti=cena-vzpadno");
  expect(await firstCardTitle(page)).toBe("ustna-voda-globinsko-ciscenje");
  await page.goto("/trgovina?razvrsti=cena-padajco");
  expect(await firstCardTitle(page)).toBe("paket-popolna-rutina");

  await page.goto("/trgovina?razvrsti=naziv-az");
  expect(await firstCardTitle(page)).toBe("belilni-trakci-potovalni-7"); // "Belilni trakci — pot…" < "…za zobe"

  await page.goto("/trgovina?razvrsti=naziv-za");
  expect(await firstCardTitle(page)).toBe("ustna-voda-globinsko-ciscenje");

  await page.goto("/trgovina?razvrsti=najnovejse");
  expect(await firstCardTitle(page)).toBe("belilni-trakci-potovalni-7"); // last seeded

  // sort persists through tab switch (URL state)
  await dismissCmp(page);
  await page.goto("/trgovina?kolekcija=paketi&razvrsti=cena-narascajoce");
  await page.getByRole("link", { name: "Vsi izdelki" }).first().click();
  await expect(page).toHaveURL(/razvrsti=cena-narascajoce/);
});

test("sort menu is keyboard/SSR friendly (details of links)", async ({
  page,
}) => {
  await page.goto("/trgovina");
  await dismissCmp(page);
  const menu = page.locator("[data-sort-menu] summary");
  await menu.click();
  await page.getByRole("link", { name: "Cena ↓" }).click();
  await expect(page).toHaveURL(/razvrsti=cena-padajoce/);
});

test("sort menu closes after a choice, on Escape and on an outside click (QA T1-03)", async ({ page }) => {
  await page.goto("/trgovina");
  await dismissCmp(page);
  const details = page.locator("[data-sort-menu]");
  const summary = details.locator("summary");

  await summary.click();
  await expect(details).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(details).not.toHaveAttribute("open");
  await expect(summary).toBeFocused();

  await summary.click();
  await expect(details).toHaveAttribute("open", "");
  await page.getByRole("heading", { level: 1 }).click();
  await expect(details).not.toHaveAttribute("open");

  await summary.click();
  await page.getByRole("link", { name: "Naziv A–Ž" }).click();
  await expect(page).toHaveURL(/razvrsti=naziv-az/);
  await expect(details).not.toHaveAttribute("open");
});

test("Omnibus line shows on discounted serum card", async ({ page }) => {
  await page.goto("/trgovina");
  const serum = page.locator("[data-product-card='serum-korektor-barve-zob']");
  // the struck figure IS the history-backed prior price, repeated on the 30-day line
  await expect(
    serum.locator("span.line-through").first(),
  ).toContainText("24,99");
  await expect(
    serum.getByText(/Najnižja cena v 30 dneh pred znižanjem/),
  ).toBeVisible();
  await expect(serum.locator("[data-omnibus-line]")).toContainText("24,99");
  // no announced reduction → plain price, no strikethrough, no line
  const strips = page.locator("[data-product-card='belilni-trakci-za-zobe']");
  await expect(strips.locator("span.line-through")).toHaveCount(0);
  await expect(strips.locator("[data-omnibus-line]")).toHaveCount(0);
});

test("every card surface carries the Omnibus line with its strikethrough", async ({ page }) => {
  // search results
  await page.goto("/iskanje?q=serum");
  const searchCard = page.locator("[data-product-card='serum-korektor-barve-zob']");
  await expect(searchCard.locator("span.line-through")).toContainText("24,99");
  await expect(searchCard.locator("[data-omnibus-line]")).toContainText("24,99");

  // PDP rails (cross-sell / "Ljudje tudi kupujejo") on another product
  await page.goto("/izdelek/belilni-trakci-za-zobe");
  const railCards = page.locator("[data-product-card='serum-korektor-barve-zob']");
  await expect(railCards.first()).toBeVisible();
  const count = await railCards.count();
  for (let index = 0; index < count; index += 1) {
    await expect(railCards.nth(index).locator("span.line-through")).toContainText("24,99");
    await expect(railCards.nth(index).locator("[data-omnibus-line]")).toContainText("24,99");
  }
  // every strikethrough on the page has its 30-day line
  await expect(page.locator("[data-product-card] span.line-through")).toHaveCount(
    await page.locator("[data-product-card] [data-omnibus-line]").count(),
  );
});

test("sold-out card shows Razprodano + Obvestite me CTA", async ({ page }) => {
  await page.goto("/trgovina");
  const travel = page.locator(
    "[data-product-card='belilni-trakci-potovalni-7']",
  );
  await expect(travel.getByText(catalog.card.soldOut)).toBeVisible();
  await expect(
    travel.getByRole("button", { name: "Obvestite me" }),
  ).toBeVisible();
});

test("sold-out PDP states it once: an operator's RAZPRODANO badge never repeats the computed pill (QA T1-13, T6-09)", async ({ page }) => {
  // The seed no longer types stock state into badges (20260930110000_qa_seed_stock_claims);
  // an operator still can, and the PDP must not say it twice.
  const travel = await prisma.product.findUniqueOrThrow({ where: { slug: "belilni-trakci-potovalni-7" }, select: { id: true, badges: true } });
  await prisma.product.update({
    where: { id: travel.id },
    data: { badges: [{ label: "NOVO", style: "outline" }, { label: "RAZPRODANO", style: "grey" }] },
  });
  try {
    await page.goto("/izdelek/belilni-trakci-potovalni-7");
    const badges = page.locator("[data-pdp-badges]");
    // getByText is case-insensitive: the admin's "RAZPRODANO" would be a second match
    await expect(badges.getByText(catalog.card.soldOut)).toHaveCount(1);
    await expect(badges.getByText("NOVO", { exact: true })).toBeVisible();
  } finally {
    await prisma.product.update({ where: { id: travel.id }, data: { badges: travel.badges ?? [] } });
  }
});

test("a withdrawn bundle is not sold anywhere (QA M5)", async ({ page, request }) => {
  const product = await prisma.product.findUniqueOrThrow({
    where: { slug: "paket-popolna-rutina" },
    select: { bundle: { select: { id: true } } },
  });
  await prisma.bundle.update({ where: { id: product.bundle!.id }, data: { active: false } });
  try {
    const shop = await (await request.get("/trgovina")).text();
    expect(shop).not.toContain('data-product-card="paket-popolna-rutina"');
    // its only collection has nothing left to list, so it has no tab
    expect(shop).not.toContain('data-tab="paketi"');
    const search = await (await request.get("/iskanje?q=paket")).text();
    expect(search).not.toContain('data-product-card="paket-popolna-rutina"');
    expect((await request.get("/izdelek/paket-popolna-rutina")).status()).toBe(404);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/izdelek/paket-popolna-rutina</loc>");
    // Nothing on the home page, in the header or in the footer links to its 404: the hero promo
    // line and the routine banner that name it are left out (QA v-a).
    expect(await homeLinksTo(page, request, "paket-popolna-rutina")).toEqual({ anchors: 0, inHtml: false });
  } finally {
    await prisma.bundle.update({ where: { id: product.bundle!.id }, data: { active: true } });
  }
});

test("a bundle a component cannot fill is sold out on the card and in the JSON-LD and offers the restock capture (QA M6)", async ({ page, request }) => {
  const product = await prisma.product.findUniqueOrThrow({
    where: { slug: "paket-popolna-rutina" },
    select: { bundle: { select: { items: { select: { id: true, quantity: true, variant: { select: { stock: true } } }, take: 1 } } } },
  });
  const item = product.bundle!.items[0];
  // one component asks for more units than its stock holds: the bundle's own
  // stock row (never decremented) is untouched, the components decide
  await prisma.bundleItem.update({ where: { id: item.id }, data: { quantity: item.variant.stock + 1 } });
  try {
    await page.goto("/trgovina");
    const card = page.locator("[data-product-card='paket-popolna-rutina']");
    // the sold-out pill on the image, and "Obvestite me" instead of the CTA: a component's
    // restock re-arms the bundle's subscriptions (lib/inventory/stock armBundleAlerts)
    await expect(card.getByText(catalog.card.soldOut, { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: catalog.card.notifyMe })).toBeVisible();
    await expect(card.getByText(catalog.card.buildBundle, { exact: true })).toHaveCount(0);

    const html = await (await request.get("/izdelek/paket-popolna-rutina")).text();
    expect(offerAvailability(html)).toBe("https://schema.org/OutOfStock");
    await page.goto("/izdelek/paket-popolna-rutina");
    for (const surface of ["[data-buy-box]", "[data-sticky-buy-bar]"]) {
      const box = page.locator(surface);
      await expect(box.getByRole("button", { name: catalog.card.notifyMe }), surface).toBeVisible();
      await expect(box.getByRole("button", { name: catalog.card.addToCart }), surface).toHaveCount(0);
    }
  } finally {
    await prisma.bundleItem.update({ where: { id: item.id }, data: { quantity: item.quantity } });
  }
  expect(offerAvailability(await (await request.get("/izdelek/paket-popolna-rutina")).text())).toBe("https://schema.org/InStock");
});

test("a hidden deal SKU surfaces nowhere and has no dead add button (QA M7)", async ({ page, request }) => {
  const mouthwash = await prisma.product.findUniqueOrThrow({ where: { slug: "ustna-voda-globinsko-ciscenje" }, select: { id: true } });
  await prisma.product.update({ where: { id: mouthwash.id }, data: { hiddenDeal: true } });
  try {
    for (const path of ["/trgovina", "/iskanje?q=ustna", "/izdelek/belilni-trakci-za-zobe", "/"]) {
      expect(await (await request.get(path)).text(), path).not.toContain('data-product-card="ustna-voda-globinsko-ciscenje"');
    }
    expect((await request.get("/izdelek/ustna-voda-globinsko-ciscenje")).status()).toBe(404);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/izdelek/ustna-voda-globinsko-ciscenje</loc>");
    const instant = (await (await request.get("/api/search?q=ustna")).json()) as { results: Array<{ slug: string }> };
    expect(instant.results.map((result) => result.slug)).not.toContain("ustna-voda-globinsko-ciscenje");
    // The seeded mega-menu and footer links to it are left out rather than leading to its 404 (QA v-a).
    expect(await homeLinksTo(page, request, "ustna-voda-globinsko-ciscenje")).toEqual({ anchors: 0, inHtml: false });
  } finally {
    await prisma.product.update({ where: { id: mouthwash.id }, data: { hiddenDeal: false } });
  }
  // Back on sale, the same links show again: the menus were never edited.
  expect((await homeLinksTo(page, request, "ustna-voda-globinsko-ciscenje")).anchors).toBeGreaterThan(0);
});

test("SEO block expander works", async ({ page }) => {
  await page.goto("/trgovina");
  await expect(page.getByText("Verjamemo v kozmetiko")).toBeHidden();
  await page.getByText("Preberi več +").click();
  await expect(page.getByText("Verjamemo v kozmetiko")).toBeVisible();
});

test("SSR: grid + banner + tabs in initial HTML", async ({ request }) => {
  const html = await (await request.get("/trgovina")).text();
  expect(html).toContain("Belilni trakci za zobe");
  expect(html).toContain("Vsi izdelki");
  expect(html).toContain("placeholder-trgovina-wide.svg");
  expect(html).toContain("kolekcija=paketi");
  expect(html).toContain("<h1");
  expect(html).toContain("Najnižja cena v 30 dneh pred znižanjem");
  expect(html).not.toContain("Najnižja cena v zadnjih 30 dneh");
});

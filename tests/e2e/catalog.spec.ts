import { expect, test } from "@playwright/test";

/** /trgovina catalog e2e (§5). */
test.describe.configure({ mode: "serial" });

async function dismissCmp(page: import("@playwright/test").Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    // banner hides only after the consent Server Action resolves — waiting
    // prevents a navigation from aborting the action mid-flight
    await banner.waitFor({ state: "hidden" });
  }
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

  await page.getByRole("link", { name: "Paketi", exact: true }).first().click();
  await expect(page).toHaveURL(/kolekcija=paketi/);
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await expect(
    page.locator("[data-product-card='paket-popolna-rutina']"),
  ).toBeVisible();

  // deep link directly
  await page.goto("/trgovina?kolekcija=beljenje");
  await expect(page.locator("[data-product-card]")).toHaveCount(4);
});

test("every sort option orders correctly", async ({ page }) => {
  const firstCardTitle = (p: typeof page) =>
    p.locator("[data-product-card]").first().getAttribute("data-product-card");

  await page.goto("/trgovina?razvrsti=cena-vzpadno");
  expect(await firstCardTitle(page)).toBe("ustna-voda-globinsko-ciscenje"); // 19,99 first (ties: seed order)

  await page.goto("/trgovina?razvrsti=cena-padajco");
  expect(await firstCardTitle(page)).toBe("paket-popolna-rutina"); // 49,99 first

  await page.goto("/trgovina?razvrsti=naziv-az");
  expect(await firstCardTitle(page)).toBe("belilni-trakci-potovalni-7"); // "Belilni trakci — pot…" < "…za zobe"

  await page.goto("/trgovina?razvrsti=naziv-za");
  expect(await firstCardTitle(page)).toBe("ustna-voda-globinsko-ciscenje");

  await page.goto("/trgovina?razvrsti=najnovejse");
  expect(await firstCardTitle(page)).toBe("belilni-trakci-potovalni-7"); // last seeded

  // sort persists through tab switch (URL state)
  await dismissCmp(page);
  await page.goto("/trgovina?kolekcija=paketi&razvrsti=cena-vzpadno");
  await page.getByRole("link", { name: "Vsi izdelki" }).first().click();
  await expect(page).toHaveURL(/razvrsti=cena-vzpadno/);
});

test("sort menu is keyboard/SSR friendly (details of links)", async ({
  page,
}) => {
  await page.goto("/trgovina");
  await dismissCmp(page);
  const menu = page.locator("[data-sort-menu] summary");
  await menu.click();
  await page.getByRole("link", { name: "Cena ↓" }).click();
  await expect(page).toHaveURL(/razvrsti=cena-padajco/);
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
  await expect(travel.getByText("Razprodano")).toBeVisible();
  await expect(
    travel.getByRole("button", { name: "Obvestite me" }),
  ).toBeVisible();
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
  expect(html).toContain("Najnižja cena v 30 dneh pred znižanjem");
  expect(html).not.toContain("Najnižja cena v zadnjih 30 dneh");
});

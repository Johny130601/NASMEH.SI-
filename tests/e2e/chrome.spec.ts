import { expect, test } from "@playwright/test";
import { MAINTENANCE_PASSWORD, prisma, setMaintenanceEnabled } from "./helpers";

/** Header/mega-menu/drawer keyboard nav + maintenance mode (§3.1, §3.6). */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await setMaintenanceEnabled(false);
  await prisma.$disconnect();
});

test("mega-menu opens with keyboard and closes on Esc", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  // dismiss CMP first so it can't steal focus
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible()) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }

  const trigger = page.getByRole("button", { name: "TRGOVINA" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator("[data-mega-panel]");
  await expect(panel).toBeVisible();
  const panelBounds = await panel.boundingBox();
  expect(panelBounds?.x).toBe(0);
  expect(panelBounds?.width).toBe(1440);
  await expect(panel.locator("[data-featured-card]")).toHaveCount(2);
  // featured media cards present in the mega-menu
  await expect(
    page.locator("[data-featured-card='belilni-trakci-za-zobe']").first(),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("link", { name: "Vsi izdelki", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Space");
  await expect(panel).toBeVisible();
  // Search remains reachable and dismisses the navigation disclosure.
  await page.getByRole("button", { name: "Iskanje", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Iščite izdelke", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-cart-link]")).toHaveAttribute("href", "/cart");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
});

test("navigation keeps shopping and account links in the header and support in the footer", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  await expect(header.getByRole("navigation", { name: "Uporabniški račun", exact: true })).toHaveCount(1);
  await expect(header.getByRole("navigation", { name: "Uporabniški račun", exact: true }).getByRole("link")).toHaveCount(1);
  await expect(header.getByRole("link", { name: "Prijava", exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "RAZIŠČI", exact: true })).toHaveCount(0);
  const removed = 'a[href="/pomoc"], a[href="/o-nas"], a[href="/razisli"], a[href="/dostava"]';
  await expect(header.locator(removed)).toHaveCount(0);
  const footer = page.locator("footer");
  await expect(footer.locator(removed)).toHaveCount(0);
  await expect(footer.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(footer.getByRole("link", { name: "Kontakt", exact: true }).filter({ visible: true })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Sledi naročilu", exact: true }).filter({ visible: true })).toBeVisible();
  await expect(footer.getByRole("navigation", { name: "Pravno", exact: true })).toBeVisible();
});

test("mobile drawer: accordions, featured cards, colored sale link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible()) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }

  const trigger = page.getByRole("button", { name: "Odpri meni" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Meni" });
  await expect(drawer).toBeVisible();
  const close = drawer.getByRole("button", { name: "Zapri meni", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("link", { name: "Prijava", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  // accordion group + featured card + colored link
  await drawer.getByText("TRGOVINA").click();
  await expect(
    drawer.locator("[data-featured-card='belilni-trakci-za-zobe']"),
  ).toBeVisible();
  const saleLink = drawer.getByRole("link", { name: /PAKETI & PRIHRANKI/ });
  await expect(saleLink).toBeVisible();
  await expect(saleLink).toHaveClass(/text-sale/);
  await expect(drawer.locator("[data-featured-card]")).toHaveCount(2);
  await expect(drawer.locator('a[href="/pomoc"], a[href="/o-nas"], a[href="/razisli"], a[href="/dostava"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await trigger.click();
  await drawer.getByText("TRGOVINA", { exact: true }).click();
  await drawer.getByRole("link", { name: "Vsi izdelki", exact: true }).click();
  await expect(page).toHaveURL(/\/trgovina$/);
  await expect(drawer).toHaveCount(0);
});

test("dynamic-route 404 renders countdown in the browser", async ({ page }) => {
  // Unknown [slug] → segment not-found delivered via RSC (Next 15 behavior
  // for dynamic pages); the countdown UI renders client-side.
  const response = await page.goto("/ta-stran-ne-obstaja");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Strani ni mogoče najti" }),
  ).toBeVisible();
  await expect(page.locator("[data-countdown]")).toBeVisible();
});

test("maintenance mode: gate → password → site → off", async ({ page }) => {
  await setMaintenanceEnabled(true);
  try {
    await page.goto("/");
    await expect(page.getByText("Trgovina se pripravlja")).toBeVisible();

    await page.getByLabel("Geslo za dostop").fill("napačno");
    await page.getByRole("button", { name: "Vstopi" }).click();
    await expect(page.getByText("Napačno geslo.")).toBeVisible();

    await page.getByLabel("Geslo za dostop").fill(MAINTENANCE_PASSWORD);
    await page.getByRole("button", { name: "Vstopi" }).click();
    await expect(page.getByText("Nasmeh, ki ga opazite")).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await setMaintenanceEnabled(false);
  }
});

test("maintenance gate leaks NO catalog data into the HTML source (RSC payload)", async ({
  page,
  request,
  context,
}) => {
  await setMaintenanceEnabled(true);
  try {
    for (const path of ["/", "/pogoji-poslovanja", "/politika-piskotkov"]) {
      const html = await (await request.get(path)).text();
      // gate content present…
      expect(html).toContain("Trgovina se pripravlja");
      // …but nothing from the catalog/pages tree executes or leaks
      expect(html).not.toContain("Belilni trakci");
      expect(html).not.toContain("Ustna voda");
      expect(html).not.toContain("Serum korektor");
      expect(html).not.toContain("Paket popolna rutina");
      expect(html).not.toContain("34,99");
      expect(html).not.toContain("Naše uspešnice");
      expect(html).not.toContain("Splošne določbe");
    }

    // allowed routes stay reachable while locked
    expect((await request.get("/api/health")).status()).toBe(200);
    expect((await request.get("/prijava")).status()).toBe(200);
    const admin = await request.get("/admin", { maxRedirects: 0 });
    expect([302, 307]).toContain(admin.status()); // auth redirect, not the gate

    // unlock via the gate → original page renders fully (URL never changed)
    await page.goto("/");
    await page.getByLabel("Geslo za dostop").fill(MAINTENANCE_PASSWORD);
    await page.getByRole("button", { name: "Vstopi" }).click();
    await expect(page.getByText("Naše uspešnice")).toBeVisible({
      timeout: 15_000,
    });

    // and the raw source now contains the catalog again (sanity for the test)
    void context; // cookie is held by the browser context from the UI unlock
    const unlocked = await page.content();
    expect(unlocked).toContain("Belilni trakci");
  } finally {
    await setMaintenanceEnabled(false);
  }
});

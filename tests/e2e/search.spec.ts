import { expect, test } from "@playwright/test";
import { catalog } from "@/lib/copy/catalog";
import { search } from "@/lib/copy/search";
import { prisma, waitForMailTo } from "./helpers";

/** Search + back-in-stock double opt-in e2e. */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("search: typing 'trak' suggests strips → results page → zero state", async ({
  page,
}) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }

  await page.getByRole("button", { name: "Iskanje" }).click();
  const input = page.getByPlaceholder("Iščite izdelke …");
  await input.fill("trak");
  await expect(
    page.locator("[data-search-result='belilni-trakci-za-zobe']"),
  ).toBeVisible({ timeout: 10_000 });

  // → all-results page
  await page.getByRole("link", { name: /Vsi rezultati/ }).click();
  await expect(page).toHaveURL(/\/iskanje\?q=trak/);
  await expect(
    page.locator("[data-product-card='belilni-trakci-za-zobe']"),
  ).toBeVisible();

  // zero-result state
  await page.goto("/iskanje?q=xyznic");
  await expect(page.getByText("Ni zadetkov")).toBeVisible();
});

test("search relevance: a title match ranks first, slugs and JSON keys never match (QA M8)", async ({ page, request }) => {
  await page.goto("/iskanje?q=serum");
  await expect(page.locator("[data-product-card]").first()).toHaveAttribute("data-product-card", "serum-korektor-barve-zob");
  // the count agrees with its number (1 izdelek, 2 izdelka, 3 izdelki, 5 izdelkov — QA T1-18)
  const count = page.locator("[data-search-count]");
  const found = Number(await count.getAttribute("data-search-count"));
  expect(found).toBeGreaterThan(0);
  await expect(count).toContainText(search.resultsCount(found));
  // every product cross-sells another by its handle, and the metafields have keys: neither is shopper text
  for (const query of ["crossSell", "korektor-barve-zob", "unitPrice"]) {
    expect(await (await request.get(`/iskanje?q=${query}`)).text(), query).toContain("Ni zadetkov");
  }
});

test("search results are the catalog's cards: the bundle keeps its value line and its CTA (QA T1-06)", async ({ page }) => {
  await page.goto("/iskanje?q=paket");
  const bundle = page.locator("[data-product-card='paket-popolna-rutina']");
  await expect(bundle).toBeVisible();
  await expect(bundle.getByRole("link", { name: catalog.card.buildBundle })).toBeVisible();
  await expect(bundle.locator("[data-bundle-savings]")).toBeVisible();
  await expect(bundle.getByRole("button", { name: catalog.card.addToCart })).toHaveCount(0);
});

test("search /iskanje SSR + GET form works", async ({ request }) => {
  const html = await (await request.get("/iskanje?q=trak")).text();
  expect(html).toContain("Belilni trakci za zobe");
  expect(html).toContain('name="robots" content="noindex');
  const zero = await (await request.get("/iskanje?q=xyznic")).text();
  expect(zero).toContain("Ni zadetkov");
});

test("sold-out capture: submit → Mailpit → confirm → CONFIRMED + ConsentLog", async ({
  page,
}) => {
  const address = `zaloga-${Date.now()}@test.si`;

  await page.goto("/izdelek/belilni-trakci-potovalni-7");
  await page
    .locator("[data-buy-box]")
    .getByRole("button", { name: "Obvestite me" })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Obvestite me, ko bo spet na zalogi",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("E-pošta").fill(address);
  await dialog.getByRole("button", { name: "Obvestite me" }).click();
  await expect(
    dialog.getByText(/potrditveno sporočilo/),
  ).toBeVisible({ timeout: 15_000 });

  const subscription = await prisma.backInStockSubscription.findUnique({
    where: {
      email_productId: {
        email: address,
        productId: (
          await prisma.product.findUniqueOrThrow({
            where: { slug: "belilni-trakci-potovalni-7" },
          })
        ).id,
      },
    },
  });
  expect(subscription).toBeTruthy();
  expect(subscription!.status).toBe("PENDING");

  const body = await waitForMailTo(address);
  const tokenMatch = body.match(/\/potrdi-zalogo\/([a-f0-9]{48})/);
  expect(tokenMatch).toBeTruthy();

  // The link is read-only (mail scanners): only the button confirms (Phase 9 step 4).
  await page.goto(`/potrdi-zalogo/${tokenMatch![1]}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Potrdite obvestilo o zalogi");
  expect((await prisma.backInStockSubscription.findUniqueOrThrow({ where: { id: subscription!.id } })).status).toBe("PENDING");
  const cmp = page.getByRole("dialog", { name: /piškotki/i });
  if (await cmp.isVisible().catch(() => false)) {
    await cmp.getByRole("button", { name: "Zavrni" }).click();
    await cmp.waitFor({ state: "hidden" });
  }
  await page.getByRole("button", { name: "Aktiviraj obvestilo" }).click();
  await expect(page.getByText("Obvestilo je aktivno")).toBeVisible();

  const confirmed = await prisma.backInStockSubscription.findUnique({
    where: { id: subscription!.id },
  });
  expect(confirmed!.status).toBe("CONFIRMED");
  expect(confirmed!.confirmedAt).not.toBeNull();

  const consentRow = await prisma.consentLog.findFirst({
    where: { kind: "back-in-stock", choices: { path: ["subscriptionId"], equals: subscription!.id } },
  });
  expect(consentRow).toBeTruthy();
  expect(await prisma.consentLog.count({
    where: { kind: "back-in-stock", choices: { path: ["subscriptionId"], equals: subscription!.id } },
  })).toBe(1);
  // transactional alert only — marketing must be false
  expect(JSON.stringify(consentRow!.choices)).toContain('"marketing":false');
  expect(JSON.stringify(consentRow!.choices)).toContain(
    "belilni-trakci-potovalni-7",
  );
});

import { expect, test } from "@playwright/test";
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

  await page.goto(`/potrdi-zalogo/${tokenMatch![1]}`);
  await expect(page.getByText("Obvestilo je aktivno")).toBeVisible();

  const confirmed = await prisma.backInStockSubscription.findUnique({
    where: { id: subscription!.id },
  });
  expect(confirmed!.status).toBe("CONFIRMED");
  expect(confirmed!.confirmedAt).not.toBeNull();

  const consentRow = await prisma.consentLog.findFirst({
    where: { kind: "back-in-stock" },
    orderBy: { createdAt: "desc" },
  });
  expect(consentRow).toBeTruthy();
  // transactional alert only — marketing must be false
  expect(JSON.stringify(consentRow!.choices)).toContain('"marketing":false');
  expect(JSON.stringify(consentRow!.choices)).toContain(
    "belilni-trakci-potovalni-7",
  );
});

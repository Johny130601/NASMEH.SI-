import { expect, test } from "@playwright/test";
import { prisma, setGtmId } from "./helpers";

/** GDPR CMP e2e (spec §3.4). Serial — mutates consent log + gtm setting. */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("first visit shows banner; Zavrni stores cookie + ConsentLog, no gtm script", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await expect(banner).toBeVisible();
  await expect(page.locator("script#gtm-script")).toHaveCount(0);

  await banner.getByRole("button", { name: "Zavrni" }).click();
  await expect(banner).toBeHidden();

  // no marketing/analytics tags after rejecting
  await expect(page.locator("script#gtm-script")).toHaveCount(0);
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLScriptElement).src));
  expect(scripts.join(" ")).not.toContain("googletagmanager");

  // consent cookie persisted (base64url codec, lib/consent.ts)
  const cookies = await context.cookies();
  const consentCookie = cookies.find((c) => c.name === "nasmeh_consent");
  expect(consentCookie).toBeTruthy();
  const parsed = JSON.parse(
    Buffer.from(consentCookie!.value, "base64url").toString("utf8"),
  ) as {
    analytics: boolean;
    marketing: boolean;
  };
  expect(parsed.analytics).toBe(false);
  expect(parsed.marketing).toBe(false);

  // server-side ConsentLog row exists
  const row = await prisma.consentLog.findFirst({
    where: { kind: "cookie" },
    orderBy: { createdAt: "desc" },
  });
  expect(row).toBeTruthy();
  expect(row!.version).toBe("1");
  expect(JSON.stringify(row!.choices)).toContain('"analytics":false');
});

test("footer 'Nastavitve piškotkov' reopens the banner", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await banner.getByRole("button", { name: "Zavrni" }).click();
  await expect(banner).toBeHidden();

  await page
    .getByRole("button", { name: "Nastavitve piškotkov" })
    .click();
  await expect(banner).toBeVisible();
});

test("accepting analytics injects only the gtm script (gtmId from Setting)", async ({
  page,
}) => {
  await setGtmId("GTM-E2ETEST");
  try {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: /piškotki/i });
    await banner.getByRole("button", { name: "Sprejmi vse" }).click();
    await expect(banner).toBeHidden();

    await expect(page.locator("script#gtm-script")).toHaveCount(1);
    const src = await page.locator("script#gtm-script").getAttribute("src");
    expect(src).toContain("googletagmanager.com/gtm.js?id=GTM-E2ETEST");
  } finally {
    await setGtmId("");
  }
});

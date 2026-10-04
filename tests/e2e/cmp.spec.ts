import { expect, test, type Page } from "@playwright/test";
import { prisma, setGtmId } from "./helpers";

/** GDPR CMP e2e (spec §3.4). Serial — mutates consent log + gtm setting. */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** The container itself is never fetched in e2e: an empty script stands in for gtm.js. */
async function stubGtm(page: Page) {
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
}

/** window.dataLayer with gtag `arguments` entries turned into arrays. */
async function dataLayer(page: Page): Promise<unknown[]> {
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []).map((entry) =>
      JSON.parse(JSON.stringify(
        entry && typeof entry === "object" && !Array.isArray(entry) && "length" in entry
          ? Array.from(entry as ArrayLike<unknown>)
          : entry,
      ))));
}

function consentUpdates(entries: unknown[]) {
  return entries.filter((entry): entry is [string, string, Record<string, string>] =>
    Array.isArray(entry) && entry[0] === "consent" && entry[1] === "update");
}

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
  expect(consentCookie!.httpOnly).toBe(true);
  const parsed = JSON.parse(
    Buffer.from(consentCookie!.value, "base64url").toString("utf8"),
  ) as {
    analytics: boolean;
    marketing: boolean;
    id: string;
    ts: number;
  };
  expect(parsed.analytics).toBe(false);
  expect(parsed.marketing).toBe(false);
  expect(parsed.id).toMatch(/^[0-9a-f-]{36}$/);

  // server-side ConsentLog row for THIS browser: linked by the random consent id
  const row = await prisma.consentLog.findFirst({
    where: { kind: "cookie", visitorId: parsed.id },
    orderBy: { createdAt: "desc" },
  });
  expect(row).toBeTruthy();
  expect(row!.version).toBe("1");
  expect(row!.ip).toBeNull();
  expect(row!.choices).toMatchObject({ analytics: false, marketing: false, ts: parsed.ts });
});

test("the banner keeps Tab inside until a choice is made, then hands focus back to the page (QA 2026-10-03 T1-05)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await expect(banner).toBeVisible();
  const focusInside = () => banner.evaluate((element) => element.contains(document.activeElement));
  await expect.poll(focusInside).toBe(true);
  for (const key of [...Array<string>(8).fill("Tab"), ...Array<string>(8).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    expect(await focusInside(), key).toBe(true);
  }
  // accepting and refusing look the same: neither answer is the easier one to see
  const accept = banner.getByRole("button", { name: "Sprejmi vse" });
  const reject = banner.getByRole("button", { name: "Zavrni" });
  expect(await reject.getAttribute("class")).toBe(await accept.getAttribute("class"));
  // the whole banner fits the phone screen (it scrolls inside itself when it must)
  const box = await banner.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);

  // a choice made on the banner that opened with the page: focus goes to the
  // start of the page (the skip link), not to <body>
  await reject.focus();
  await page.keyboard.press("Enter");
  await expect(banner).toBeHidden();
  await expect(page.locator("[data-skip-link]")).toBeFocused();

  // reopened from the footer: focus returns to the control that opened it
  const reopen = page.getByRole("button", { name: "Nastavitve piškotkov" });
  await reopen.focus();
  await page.keyboard.press("Enter");
  await expect(banner).toBeVisible();
  await expect.poll(focusInside).toBe(true);
  await banner.getByRole("button", { name: "Zavrni" }).click();
  await expect(banner).toBeHidden();
  await expect(reopen).toBeFocused();
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

test("the reopened banner shows the stored choice, not the first render's toggles", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await banner.getByRole("button", { name: "Sprejmi vse" }).click();
  await expect(banner).toBeHidden();

  await page.getByRole("button", { name: "Nastavitve piškotkov" }).click();
  await expect(banner.getByRole("switch", { name: "Analitični" })).toHaveAttribute("aria-checked", "true");
  await expect(banner.getByRole("switch", { name: "Trženjski" })).toHaveAttribute("aria-checked", "true");

  // Withdrawing reloads the page; the next open starts from the stored refusal.
  await banner.getByRole("switch", { name: "Analitični" }).click();
  await expect(banner.getByRole("switch", { name: "Analitični" })).toHaveAttribute("aria-checked", "false");
  await banner.getByRole("switch", { name: "Analitični" }).click();
  const reloaded = page.waitForEvent("load");
  await banner.getByRole("button", { name: "Zavrni" }).click();
  await reloaded;
  await expect(banner).toBeHidden();

  await page.getByRole("button", { name: "Nastavitve piškotkov" }).click();
  await expect(banner.getByRole("switch", { name: "Analitični" })).toHaveAttribute("aria-checked", "false");
  await expect(banner.getByRole("switch", { name: "Trženjski" })).toHaveAttribute("aria-checked", "false");
});

test("a returning visitor's stored choice is applied to Consent Mode before GTM loads", async ({ page }) => {
  await stubGtm(page);
  await setGtmId("GTM-E2ETEST");
  try {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: /piškotki/i });
    await banner.getByRole("button", { name: "Sprejmi vse" }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(page.locator("script#gtm-script")).toHaveCount(1);
    const entries = await dataLayer(page);
    const defaultIndex = entries.findIndex((entry) => Array.isArray(entry) && entry[0] === "consent" && entry[1] === "default");
    const updateIndex = entries.findIndex((entry) => Array.isArray(entry) && entry[0] === "consent" && entry[1] === "update");
    const gtmIndex = entries.findIndex((entry) => (entry as { event?: string })?.event === "gtm.js");
    expect(defaultIndex).toBeGreaterThanOrEqual(0);
    expect(updateIndex).toBeGreaterThan(defaultIndex);
    expect(gtmIndex).toBeGreaterThan(updateIndex);
    expect(entries[updateIndex]).toEqual(["consent", "update", {
      analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted",
    }]);
    expect(entries).toContainEqual({ event: "nasmeh_consent", analytics: true, marketing: true });
  } finally {
    await setGtmId("");
  }
});

test("a refusal stays denied after a reload: no granted update, no GTM", async ({ page }) => {
  await stubGtm(page);
  await setGtmId("GTM-E2ETEST");
  try {
    await page.goto("/");
    await page.getByRole("dialog", { name: /piškotki/i }).getByRole("button", { name: "Zavrni" }).click();
    await page.reload();
    const updates = consentUpdates(await dataLayer(page));
    expect(updates.every(([, , signals]) => Object.values(signals).every((value) => value === "denied"))).toBe(true);
    await expect(page.locator("script#gtm-script")).toHaveCount(0);
  } finally {
    await setGtmId("");
  }
});

test("accepting analytics injects only the gtm script (gtmId from Setting)", async ({
  page,
}) => {
  await stubGtm(page);
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

test("marketing-only consent loads GTM with analytics storage still denied", async ({ page }) => {
  await stubGtm(page);
  await setGtmId("GTM-E2ETEST");
  try {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: /piškotki/i });
    await banner.getByRole("switch", { name: "Trženjski" }).click();
    await banner.getByRole("button", { name: "Shrani izbiro" }).click();
    await expect(banner).toBeHidden();

    await expect(page.locator("script#gtm-script")).toHaveCount(1);
    expect(consentUpdates(await dataLayer(page)).at(-1)?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "granted" });
  } finally {
    await setGtmId("");
  }
});

test("withdrawing consent expires the category's tracker cookies and reloads without GTM", async ({ page, context, baseURL }) => {
  await stubGtm(page);
  await setGtmId("GTM-E2ETEST");
  try {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: /piškotki/i });
    await banner.getByRole("button", { name: "Sprejmi vse" }).click();
    await expect(page.locator("script#gtm-script")).toHaveCount(1);

    // what a GA / Meta tag in the container would have written with JavaScript
    await context.addCookies([
      { name: "_ga", value: "GA1.1.123.456", url: baseURL! },
      { name: "_ga_E2E123", value: "GS1.1.1", url: baseURL! },
      { name: "_fbp", value: "fb.1.1.1", url: baseURL! },
    ]);

    await page.getByRole("button", { name: "Nastavitve piškotkov" }).click();
    await banner.getByRole("switch", { name: "Analitični" }).click();
    const reloaded = page.waitForEvent("load");
    await banner.getByRole("button", { name: "Shrani izbiro" }).click();
    await reloaded;

    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).not.toContain("_ga");
    expect(names).not.toContain("_ga_E2E123");
    expect(names).toContain("_fbp"); // marketing is still granted
    expect(names).toContain("nasmeh_consent");
    // marketing still granted → the container stays allowed, analytics storage denied
    expect(consentUpdates(await dataLayer(page)).at(-1)?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "granted" });

    await page.getByRole("button", { name: "Nastavitve piškotkov" }).click();
    const reloadedAgain = page.waitForEvent("load");
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await reloadedAgain;
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain("_fbp");
    await expect(page.locator("script#gtm-script")).toHaveCount(0);
  } finally {
    await setGtmId("");
  }
});

test("ecommerce events before analytics consent are dropped, not replayed to GTM", async ({ page }) => {
  await page.goto("/izdelek/belilni-trakci-za-zobe");
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  await expect(banner).toBeVisible();
  const isViewItem = (entry: unknown) => (entry as { event?: string })?.event === "view_item";
  expect((await dataLayer(page)).some(isViewItem)).toBe(false);

  await banner.getByRole("button", { name: "Sprejmi vse" }).click();
  await expect(banner).toBeHidden();
  expect((await dataLayer(page)).some(isViewItem)).toBe(false);

  // with the stored consent the next product view is pushed
  await page.reload();
  await expect.poll(async () => (await dataLayer(page)).some(isViewItem)).toBe(true);
});

test("cookie policy table lists the app's cookies with their consent category", async ({ page }) => {
  await page.goto("/politika-piskotkov");
  const table = page.locator("table");
  await expect(table.locator("thead")).toContainText("Kategorija");
  const expected: Array<[string, string]> = [
    ["nasmeh_consent", "necessary"],
    ["__Secure-authjs.session-token", "necessary"],
    ["__Host-authjs.csrf-token", "necessary"],
    ["__Secure-authjs.callback-url", "necessary"],
    ["nasmeh_preauth", "necessary"],
    // the address typed into a failed sign-in (QA 2026-10-03 T1-10)
    ["nasmeh_login_email", "necessary"],
    ["nasmeh_cart", "necessary"],
    ["nasmeh_koda", "necessary"],
    ["nasmeh_order_*", "necessary"],
    ["nasmeh_maintenance", "necessary"],
    ["nasmeh_welcome_seen", "necessary"],
    ["_ga, _ga_*", "analytics"],
    ["_fbp", "marketing"],
  ];
  for (const [name, category] of expected) {
    const row = table.locator(`[data-cookie-row="${name}"]`);
    await expect(row).toHaveAttribute("data-cookie-category", category);
  }
  await expect(table.locator('[data-cookie-row="nasmeh_cart"]')).toContainText("Nujni");
  await expect(table.locator('[data-cookie-row="_ga, _ga_*"]')).toContainText("Analitični");
});

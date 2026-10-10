import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { dismissCookieBanner, enrolledTotpFields, loginStaff, prisma, waitForMailMessage } from "./helpers";

/** Phase 7 step 5 (§14.10, §14.11): homepage, marquee, menus, pages, media library and e-mail templates — live without a deploy. */

const PASSWORD = "CmsAcceptance123!";
const SETTING_KEYS = ["home.hero", "home.sections", "marquee.text", "marquee.href", "marquee.active"] as const;

/** Snapshot before each test and restore after it — afterEach still runs when a test times out, a finally block does not (step 6 finding F3). */
let snapshot: { settings: Array<{ key: string; value: unknown }>; headerItems: unknown } = { settings: [], headerItems: [] };
test.beforeEach(async () => {
  snapshot = {
    settings: await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } }),
    headerItems: (await prisma.menu.findUniqueOrThrow({ where: { handle: "header" } })).items,
  };
});
test.afterEach(async () => {
  for (const key of SETTING_KEYS) {
    const original = snapshot.settings.find((row) => row.key === key);
    if (original) await prisma.setting.update({ where: { key }, data: { value: original.value as object } });
    else await prisma.setting.deleteMany({ where: { key } });
  }
  await prisma.menu.update({ where: { handle: "header" }, data: { items: snapshot.headerItems as object[] } });
});
test.afterAll(async () => { await prisma.$disconnect(); });

async function staff(role: "MANAGER" | "SUPPORT", key: string) {
  const totp = enrolledTotpFields();
  const user = await prisma.user.create({ data: {
    email: `cms-${role.toLowerCase()}-${key}@test.si`, name: `Staff ${role}`, role, emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4), ...totp.data,
  } });
  return { ...user, secret: totp.secret };
}

const pngImage = () => sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 0, g: 168, b: 143 } } }).png().toBuffer();

async function addStripsToCart(page: Page) {
  await page.goto("/trgovina");
  await dismissCookieBanner(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
}

async function placeAndPay(page: Page, email: string): Promise<string> {
  await page.goto("/checkout");
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.locator("[data-continue-contact]").click();
  await page.getByLabel("Ime in priimek").fill("Kupec Vsebina");
  await page.getByLabel("Ulica in hišna številka").fill("Testna ulica 12");
  await page.getByLabel("Kraj").fill("Ljubljana");
  await page.getByLabel("Poštna številka").fill("1000");
  await page.locator("[data-continue-shipping]").click();
  await page.locator("[data-continue-payment]").click();
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-pay-panel]")).toBeVisible({ timeout: 15_000 });
  await page.locator("[data-test-pay-success]").click();
  await page.waitForURL(/\/potrditev\/NS-/, { timeout: 20_000 });
  return page.locator("[data-order-number]").innerText();
}

test("manager edits the homepage, marquee, header menu, a page, the media library and an e-mail template; every change is live without a deploy", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const key = randomUUID().slice(0, 8);
  const manager = await staff("MANAGER", key);
  const shopper = `cms-kupec-${key}@test.si`;
  const shop = await browser.newContext();
  const front = await shop.newPage();
  let mediaUrl: string | null = null;
  try {
    await loginStaff(page, manager.email, PASSWORD, manager.secret);
    await page.goto("/admin/vsebina");
    await expect(page.locator("[data-content-card='home']")).toBeVisible();

    // Homepage: hero title, section visibility and order.
    await page.goto("/admin/vsebina/domov");
    const heroForm = page.locator("[data-hero-form]");
    await heroForm.getByLabel("Naslov", { exact: true }).fill(`Nasmeh E2E ${key}`);
    // The seeded subtitle claim keeps its footnote through the edit; an emptied footnote is flagged before saving.
    const heroFootnote = heroForm.locator("textarea[name='footnote']");
    const seededFootnote = await heroFootnote.inputValue();
    expect(seededFootnote).toContain("Rezultati se lahko razlikujejo");
    await heroFootnote.fill("");
    await expect(heroForm.locator("[data-hero-footnote-missing]")).toBeVisible();
    await heroFootnote.fill(seededFootnote);
    await expect(heroForm.locator("[data-hero-footnote-missing]")).toHaveCount(0);
    await heroForm.locator("[data-hero-save]").click();
    await expect(page.getByText("Hero je shranjen.")).toBeVisible();
    await page.locator("[data-section-row='bundleBanner'] [data-section-visible]").uncheck();
    await page.locator("[data-section-row='routineBanner'] [data-section-up]").click();
    await page.locator("[data-section-row='routineBanner'] [data-section-up]").click();
    await page.locator("[data-sections-save]").click();
    await expect(page.getByText("Vrstni red je shranjen.")).toBeVisible();
    expect(await prisma.setting.findUniqueOrThrow({ where: { key: "home.sections" } }).then((row) => row.value)).toEqual([
      { id: "hero", visible: true }, { id: "routineBanner", visible: true }, { id: "rail", visible: true }, { id: "bundleBanner", visible: false }, { id: "reviews", visible: true },
    ]);
    await front.goto("/");
    await dismissCookieBanner(front);
    // the seeded accent line stays in the heading, so the edited title is checked as its first line
    await expect(front.getByRole("heading", { level: 1 })).toContainText(`Nasmeh E2E ${key}`);
    await expect(front.getByRole("heading", { name: "Naši paketi" })).toHaveCount(0);
    expect(await front.evaluate(() => {
      const rail = document.querySelector("#izdelki");
      const routine = document.querySelector("a[aria-label^='Trakci, ustna voda in serum']");
      return !!rail && !!routine && (routine.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    })).toBe(true);
    expect(await (await front.request.get("/")).text()).toContain(`Nasmeh E2E ${key}`); // server-rendered

    // Marquee: text change is live, the switch hides the bar.
    await page.goto("/admin/vsebina/oglasna-vrstica");
    const marquee = page.locator("[data-marquee-form]");
    await marquee.getByLabel("Besedilo").fill(`E2E vrstica ${key}`);
    await marquee.locator("[data-marquee-save]").click();
    await expect(page.locator("[data-cms-message]")).toHaveText("Oglasna vrstica je shranjena.");
    await front.goto("/");
    await expect(front.getByRole("region", { name: `E2E vrstica ${key}` })).toBeVisible();
    await marquee.locator("[data-marquee-active]").uncheck();
    await marquee.locator("[data-marquee-save]").click();
    await expect(page.locator("[data-cms-message]")).toHaveText("Oglasna vrstica je shranjena.");
    await front.goto("/");
    await expect(front.locator(".ui-marquee")).toHaveCount(0);

    // Header menu: a new top-level link appears in the main navigation.
    await page.goto("/admin/navigacija");
    await expect(page.locator("[data-menu-row='header']")).toContainText("2");
    await page.goto("/admin/navigacija/header");
    await page.locator("[data-menu-add]").click();
    await page.getByLabel("Napis 3", { exact: true }).fill(`E2E MENI ${key}`);
    await page.getByLabel("Povezava 3", { exact: true }).fill("/kontakt");
    await page.locator("[data-menu-save]").click();
    await expect(page.locator("[data-menu-message]")).toHaveText("Meni je shranjen.");
    await front.goto("/");
    await expect(front.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: `E2E MENI ${key}` })).toHaveAttribute("href", "/kontakt");

    // Pages: create as LANDING, publish, reserved slug refused, shadowed page cannot be deleted, delete → 404.
    await page.goto("/admin/strani");
    await expect(page.locator("[data-page-row='politika-piskotkov']")).toBeVisible();
    const create = page.locator("[data-page-create]");
    await create.getByLabel("Naslov").fill(`E2E stran ${key}`);
    await create.getByLabel("Slug (URL)").fill(`E2E-Stran-${key}`);
    await create.locator("#page-new-template").selectOption("LANDING");
    await create.getByRole("button", { name: "Ustvari stran" }).click();
    await page.waitForURL(/\/admin\/strani\/[a-z0-9]+$/);
    const pageId = page.url().split("/").pop()!;
    const editor = page.locator("[data-page-editor]");
    await editor.locator("[data-page-body]").fill(`<p>Vsebina strani ${key}</p>`);
    await editor.locator("[data-page-published]").check();
    await editor.locator("[data-page-save]").click();
    await expect(page.locator("[data-page-message]")).toHaveText("Stran je shranjena.");
    const stored = await prisma.contentPage.findUniqueOrThrow({ where: { id: pageId } });
    expect(stored).toMatchObject({ slug: `e2e-stran-${key}`, template: "LANDING", published: true, reviewed: false });
    await front.goto(`/e2e-stran-${key}`);
    await expect(front.getByRole("heading", { level: 1 })).toHaveText(`E2E stran ${key}`);
    await expect(front.locator("[data-content-template='LANDING']")).toContainText(`Vsebina strani ${key}`);
    // Phase 9 step 4: the legal-review mark belongs to the saved text — ticked on unchanged text it is stored, a text change clears it.
    await editor.locator("[data-page-reviewed]").check();
    await editor.locator("[data-page-save]").click();
    await expect.poll(async () => (await prisma.contentPage.findUniqueOrThrow({ where: { id: pageId } })).reviewed).toBe(true);
    await editor.locator("[data-page-body]").fill(`<p>Spremenjena vsebina ${key}</p>`);
    await editor.locator("[data-page-save]").click();
    await expect(page.locator("[data-page-message]")).toContainText("oznaka pravnega pregleda pa ne");
    await expect(editor.locator("[data-page-reviewed]")).not.toBeChecked();
    expect(await prisma.contentPage.findUniqueOrThrow({ where: { id: pageId } })).toMatchObject({ body: `<p>Spremenjena vsebina ${key}</p>`, reviewed: false });
    await editor.locator("input[name='slug']").fill("checkout");
    await editor.locator("[data-page-save]").click();
    await expect(page.locator("[data-page-message]")).toHaveText("Ta naslov pripada vgrajeni strani trgovine.");
    const shadowed = await prisma.contentPage.findUniqueOrThrow({ where: { slug: "politika-piskotkov" } });
    await page.goto(`/admin/strani/${shadowed.id}`);
    await expect(page.locator("[data-page-editor]")).toBeVisible();
    await expect(page.locator("[data-page-delete]")).toHaveCount(0);
    await expect(page.locator("[data-page-editor] input[name='slug']")).not.toBeEditable();
    // Legal pages outside the shadowed routes are locked too: slug read-only with a hint, LEGAL template kept, no delete.
    const terms = await prisma.contentPage.findUniqueOrThrow({ where: { slug: "pogoji-poslovanja" } });
    await page.goto(`/admin/strani/${terms.id}`);
    await expect(page.locator("[data-page-editor][data-page-locked]")).toBeVisible();
    await expect(page.locator("[data-page-editor] input[name='slug']")).not.toBeEditable();
    await expect(page.locator("[data-page-editor]").getByText("slug je zaklenjen")).toBeVisible();
    await expect(page.locator("#page-template")).toBeDisabled();
    await expect(page.locator("[data-page-delete]")).toHaveCount(0);
    await page.goto(`/admin/strani/${pageId}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-page-delete]").click();
    await page.waitForURL(/\/admin\/strani$/);
    expect((await front.goto(`/e2e-stran-${key}`))?.status()).toBe(404);

    // Media library: upload, use as the hero poster, deletion blocked while referenced, then deleted.
    await page.goto("/admin/mediji");
    await page.locator("#library-files").setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: await pngImage() });
    await page.locator("[data-library-upload] input[name='alt']").fill(`E2E slika ${key}`);
    await page.locator("[data-library-submit]").click();
    await expect(page.locator("[data-library-message]")).toHaveText("Datoteke so naložene.");
    const asset = await prisma.mediaAsset.findFirstOrThrow({ where: { alt: `E2E slika ${key}` } });
    mediaUrl = asset.url;
    expect(asset.url).toMatch(/^\/uploads\/media\/knjiznica-medijev\/[a-f0-9]{24}\.webp$/);
    expect(asset).toMatchObject({ width: 640, height: 480 });
    expect((await front.request.get(asset.url)).headers()["content-type"]).toBe("image/webp");
    await expect(page.locator(`[data-library-item='${asset.id}'] [data-library-url]`)).toHaveText(asset.url);
    await page.goto("/admin/vsebina/domov");
    await heroForm.locator("input[name='poster']").fill(asset.url);
    await heroForm.locator("[data-hero-save]").click();
    await expect(page.getByText("Hero je shranjen.")).toBeVisible();
    await front.goto("/");
    await expect(front.locator(`img[src='${asset.url}']`)).toBeVisible();
    await page.goto("/admin/mediji");
    await expect(page.locator(`[data-library-item='${asset.id}']`)).toContainText("Uporab: 1");
    await expect(page.locator(`[data-library-item='${asset.id}'] [data-library-delete]`)).toBeDisabled();
    await page.goto("/admin/vsebina/domov");
    await heroForm.locator("input[name='poster']").fill("/uploads/placeholder-hero.svg");
    await heroForm.locator("[data-hero-save]").click();
    await expect(page.getByText("Hero je shranjen.")).toBeVisible();
    await page.goto("/admin/mediji");
    // An irreversible delete asks first (QA T6-12).
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(`[data-library-item='${asset.id}'] [data-library-delete]`).click();
    await expect(page.locator(`[data-library-item='${asset.id}']`)).toHaveCount(0);
    await expect(page.locator("[data-library-message]")).toHaveText("Datoteka je izbrisana.");
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(0);
    expect((await front.request.get(asset.url)).status()).toBe(404);
    mediaUrl = null;

    // Hero video (QA M13): an MP4 goes into the library as uploaded; an external video URL is refused
    // with its own message, because the media policy plays video only from the store itself.
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.from([0, 0, 2, 0]), Buffer.from("isommp41"), Buffer.alloc(512, 1)]);
    await page.goto("/admin/mediji");
    await page.locator("#library-files").setInputFiles({ name: "hero.mp4", mimeType: "video/mp4", buffer: mp4 });
    await page.locator("[data-library-upload] input[name='alt']").fill(`E2E slika ${key} video`);
    await page.locator("[data-library-submit]").click();
    await expect(page.locator("[data-library-message]")).toHaveText("Datoteke so naložene.");
    const video = await prisma.mediaAsset.findFirstOrThrow({ where: { alt: `E2E slika ${key} video` } });
    expect(video.url).toMatch(/^\/uploads\/media\/knjiznica-medijev\/[a-f0-9]{24}\.mp4$/);
    expect(video).toMatchObject({ width: 0, height: 0, bytes: mp4.byteLength });
    await expect(page.locator(`[data-library-item='${video.id}'] video`)).toHaveCount(1);
    await page.goto("/admin/vsebina/domov");
    await heroForm.locator("input[name='videoDesktop']").fill("https://cdn.example.com/hero.mp4");
    await heroForm.locator("[data-hero-save]").click();
    await expect(page.getByText("zunanjih video naslovov")).toBeVisible();

    // E-mail template: unknown placeholder refused, test-send arrives, the next order confirmation uses the override, reset restores the code template.
    await page.goto("/admin/e-posta");
    await expect(page.locator("[data-email-row='orderConfirmation'] [data-email-state]")).toHaveAttribute("data-email-state", "default");
    await page.goto("/admin/e-posta/orderConfirmation");
    const mail = page.locator("[data-email-editor='orderConfirmation']");
    await mail.locator("[data-email-subject]").fill("E2E potrditev {{orderNumber}}");
    await mail.locator("[data-email-body]").fill(`<h1>Hvala ${key}</h1>{{items}}<p>Skupaj {{total}} {{kupec}}</p>`);
    await mail.locator("[data-email-save]").click();
    await expect(page.locator("[data-email-message]")).toHaveText("Neznana polja: {{kupec}}");
    await mail.locator("[data-email-body]").fill(`<h1>Hvala ${key}</h1>{{items}}<p>Skupaj {{total}}</p>`);
    await expect(page.locator("[data-email-preview-subject]")).toHaveText("E2E potrditev NS-2026-00042");
    await mail.locator("[data-email-test-to]").fill(`cms-test-${key}@test.si`);
    await mail.locator("[data-email-send-test]").click();
    await expect(page.locator("[data-email-message]")).toHaveText("Testno sporočilo je poslano.");
    const testMail = await waitForMailMessage(`cms-test-${key}@test.si`);
    expect(testMail.Subject).toBe("[TEST] E2E potrditev NS-2026-00042");
    expect(testMail.HTML).toContain(`Hvala ${key}`);
    expect(testMail.HTML).toContain("69,98");
    await mail.locator("[data-email-save]").click();
    await expect(page.locator("[data-email-message]")).toHaveText("Predloga je shranjena in velja za naslednja sporočila.");
    await page.goto("/admin/e-posta");
    await expect(page.locator("[data-email-row='orderConfirmation'] [data-email-state]")).toHaveAttribute("data-email-state", "override");
    await addStripsToCart(front);
    const number = await placeAndPay(front, shopper);
    const confirmation = await waitForMailMessage(shopper, 30_000);
    expect(confirmation.Subject).toBe(`E2E potrditev ${number}`);
    expect(confirmation.HTML).toContain(`Hvala ${key}`);
    expect(confirmation.HTML).toContain("Belilni trakci");
    expect(confirmation.HTML).toContain("34,99");
    // The override cannot drop the durable-medium part (Phase 9 step 4): legal block and all three PDFs still arrive.
    expect(confirmation.HTML).toContain("data-order-legal");
    expect(confirmation.HTML).toContain("Pravica do odstopa od pogodbe");
    expect(confirmation.Attachments?.map((attachment) => attachment.FileName)).toEqual([
      `racun-${number}.pdf`, "obrazec-odstop-od-pogodbe-nasmeh.pdf", `pogoji-in-odstop-${number}.pdf`,
    ]);
    await page.goto("/admin/e-posta/orderConfirmation");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-email-reset]").click();
    await expect(page.locator("[data-email-message]")).toHaveText("Privzeta predloga je spet v uporabi.");
    expect(await prisma.emailTemplate.count({ where: { key: "orderConfirmation" } })).toBe(0);
  } finally {
    await shop.close();
    await prisma.contentPage.deleteMany({ where: { slug: `e2e-stran-${key}` } });
    await prisma.emailTemplate.deleteMany({ where: { key: "orderConfirmation" } });
    const leftover = await prisma.mediaAsset.findMany({ where: { alt: { startsWith: `E2E slika ${key}` } } });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: leftover.map((asset) => asset.id) } } });
    for (const url of [mediaUrl, ...leftover.map((asset) => asset.url)]) {
      if (url) await rm(path.join(process.cwd(), "catalog-uploads", url.replace(/^\/uploads\//, "")), { force: true });
    }
    await prisma.order.deleteMany({ where: { email: shopper } });
    await prisma.user.deleteMany({ where: { id: manager.id } });
  }
});

test("support is refused at every CMS screen and sees none of them in the sidebar", async ({ page }) => {
  const key = randomUUID().slice(0, 8);
  const support = await staff("SUPPORT", key);
  try {
    await loginStaff(page, support.email, PASSWORD, support.secret);
    for (const href of ["/admin/strani", "/admin/navigacija", "/admin/mediji", "/admin/e-posta", "/admin/vsebina"]) {
      await expect(page.locator(`a[href='${href}']`)).toHaveCount(0);
    }
    for (const href of ["/admin/vsebina", "/admin/vsebina/domov", "/admin/vsebina/oglasna-vrstica", "/admin/vsebina/popup", "/admin/strani", "/admin/navigacija/header", "/admin/mediji", "/admin/e-posta/orderShipped"]) {
      await page.goto(href);
      await page.waitForURL(/\/admin\?dostop=zavrnjen/);
      await expect(page.locator("[data-forbidden-notice]")).toBeVisible();
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: support.id } });
  }
});

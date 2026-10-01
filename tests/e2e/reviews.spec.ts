import { expect, test, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { signRatingToken } from "@/lib/reviews/rating-token";
import { E2E_AUTH_SECRET, enrolledTotpFields, loginStaff, prisma, waitForMailMessage } from "./helpers";

const JOB_HEADERS = { authorization: "Bearer jobs_e2e_secret" };
const PASSWORD = "ReviewTest123!";
async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) await banner.getByRole("button", { name: "Zavrni" }).click();
}
async function fixture() {
  const id = `review-${randomUUID()}`;
  const product = await prisma.product.create({ data: {
    slug: id, title: `Review acceptance ${id}`, status: "ACTIVE", description: "Isolated review acceptance product",
    variants: { create: { title: "Test variant", sku: id, priceCents: 1999, stock: 10 } },
  }, include: { variants: true } });
  const totp = enrolledTotpFields();
  const admin = { ...(await prisma.user.create({ data: { email: `${id}-admin@test.si`, passwordHash: await bcrypt.hash(PASSWORD, 4), name: "Review admin", role: "OWNER", emailVerified: new Date(), ...totp.data } })), secret: totp.secret };
  const order = await prisma.order.create({ data: {
    number: `NS-${id}`, email: `${id}@test.si`, status: "DELIVERED", deliveredAt: new Date(Date.now() - 8 * 86400000), paidAt: new Date(),
    subtotalCents: 1999, totalCents: 1999, vatCents: 360, stockDeducted: true,
    shippingAddress: { firstName: "Review", lastName: "Guest", line1: "Test 1", postalCode: "1000", city: "Ljubljana", country: "SI" },
    items: { create: { variantId: product.variants[0].id, title: product.title, sku: id, unitPriceCents: 1999, quantity: 1 } },
  }, include: { items: true } });
  return { id, product, admin, order, paths: new Set<string>() };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(f: Fixture) {
  const reviews = await prisma.review.findMany({ where: { productId: f.product.id }, select: { photos: true } });
  for (const review of reviews) if (Array.isArray(review.photos)) for (const value of review.photos) if (typeof value === "string") f.paths.add(value);
  await prisma.review.deleteMany({ where: { productId: f.product.id } });
  await prisma.order.delete({ where: { id: f.order.id } });
  await prisma.product.delete({ where: { id: f.product.id } });
  await prisma.user.delete({ where: { id: f.admin.id } });
  for (const url of f.paths) {
    if (!/^\/uploads\/reviews\/[a-f0-9]{24}\.webp$/.test(url)) continue;
    for (const name of [path.basename(url), path.basename(url).replace(/\.webp$/, "-320.webp")]) {
      await unlink(path.join(process.cwd(), "review-uploads", name)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
  }
}
function starToken(html: string, rating: number) {
  const tokens = Array.from(html.matchAll(/\/oceni\/hitro\/([A-Za-z0-9_.-]+)/g), (match) => match[1]);
  return tokens.find((token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).rating === rating)!;
}
function productSchema(html: string) {
  return Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g), (match) => JSON.parse(match[1])).find((data) => data["@type"] === "Product");
}

test.afterAll(async () => { await prisma.$disconnect(); });

test("request email → signed five-star link → two photos → moderation → published SSR and protected media", async ({ page, browser, request }) => {
  const f = await fixture();
  const adminContext = await browser.newContext(); const adminPage = await adminContext.newPage();
  const setting = await prisma.setting.findUnique({ where: { key: "reviews.autoPublishMinStars" } });
  const delaySetting = await prisma.setting.findUnique({ where: { key: "reviews.requestDelayDays" } });
  try {
    await prisma.setting.upsert({ where: { key: "reviews.autoPublishMinStars" }, create: { key: "reviews.autoPublishMinStars", value: 0 }, update: { value: 0 } });
    await prisma.setting.upsert({ where: { key: "reviews.requestDelayDays" }, create: { key: "reviews.requestDelayDays", value: 7 }, update: { value: 7 } });
    const job = await request.post("/api/jobs/daily", { headers: JOB_HEADERS }); expect(job.ok()).toBe(true);
    const mail = await waitForMailMessage(f.order.email);
    const token = starToken(`${mail.HTML ?? ""} ${mail.Text ?? ""}`, 5); expect(token).toBeTruthy();
    expect((await prisma.reviewRequest.findUnique({ where: { orderId: f.order.id } }))?.sentAt).not.toBeNull();
    // A tampered (or expired) star link is a page in the site layout with a way forward, not a bare 400 (QA T3-R2).
    const invalid = await request.get(`/oceni/hitro/${token.slice(0, -1)}!`, { maxRedirects: 0 });
    expect(invalid.status()).toBe(200);
    const invalidHtml = await invalid.text();
    expect(invalidHtml).toContain("Povezava za oceno ni več veljavna"); expect(invalidHtml).toContain('href="/racun"'); expect(invalidHtml).not.toContain("data-review-form");
    const unauthenticated = await request.get(`/oceni/${f.order.items[0].id}?r=forged`);
    expect(unauthenticated.status()).toBe(404); expect(await unauthenticated.text()).not.toContain("data-review-form");
    await page.goto(`/oceni/hitro/${token}`); await dismissCmp(page);
    await expect(page.locator('[data-star="5"]')).toBeChecked();
    // Phase 9 step 4: the reviewer is told how the name appears before submitting.
    await expect(page.locator("[data-review-name-note]")).toContainText("začetnico priimka");
    await page.getByLabel("Naslov mnenja (neobvezno)").fill(`Photo review ${f.id}`);
    await page.getByLabel("Vaše mnenje").fill(`Verified product feedback ${f.id}`);
    await page.locator("[data-photos-input]").setInputFiles({ name: "pretend.png", mimeType: "image/png", buffer: Buffer.from("<script>not an image</script>") });
    await page.getByRole("button", { name: "Oddaj mnenje" }).click();
    await expect(page.locator("[data-review-form]").getByRole("alert")).toContainText("Fotografije ni mogoče");
    // An actual valid >1 MB image also verifies the configured Server Action limit.
    const large = await sharp(randomBytes(700 * 600 * 3), { raw: { width: 700, height: 600, channels: 3 } }).png().toBuffer();
    const small = await sharp({ create: { width: 20, height: 20, channels: 3, background: "blue" } }).png().toBuffer();
    expect(large.byteLength).toBeGreaterThan(1024 * 1024);
    await page.locator("[data-photos-input]").setInputFiles([{ name: "large.png", mimeType: "image/png", buffer: large }, { name: "small.png", mimeType: "image/png", buffer: small }]);
    await page.getByRole("button", { name: "Oddaj mnenje" }).click();
    await expect(page.locator("[data-review-success]")).toContainText("po pregledu");
    const review = await prisma.review.findUniqueOrThrow({ where: { orderItemId: f.order.items[0].id } });
    expect(review.status).toBe("PENDING"); const photos = review.photos as string[]; expect(photos).toHaveLength(2); photos.forEach((url) => f.paths.add(url));
    expect((await request.get(photos[0])).status()).toBe(404);
    expect(await (await request.get(`/izdelek/${f.product.slug}`)).text()).not.toContain(`Photo review ${f.id}`);
    await page.reload(); await expect(page.getByText("Za ta izdelek ste mnenje že oddali.")).toBeVisible();

    await loginStaff(adminPage, f.admin.email, PASSWORD, f.admin.secret);
    await adminPage.goto("/admin/ocene");
    const controls = adminPage.locator("[data-review-settings]");
    await controls.locator('[name="autoPublishMinStars"]').selectOption("4");
    await controls.locator('[name="requestDelayDays"]').selectOption("9");
    await controls.getByRole("button", { name: "Shrani nastavitve ocen" }).click();
    await expect.poll(async () => (await prisma.setting.findUnique({ where: { key: "reviews.requestDelayDays" } }))?.value).toBe(9);
    expect((await prisma.setting.findUnique({ where: { key: "reviews.autoPublishMinStars" } }))?.value).toBe(4);
    const card = adminPage.locator(`[data-mod-card="${review.id}"]`);
    await expect(card).toBeVisible(); expect((await adminContext.request.get(photos[0])).status()).toBe(200);
    await card.getByRole("button", { name: "Odstrani", exact: true }).first().click();
    await expect(card.locator("img")).toHaveCount(1);
    expect((await adminContext.request.get(photos[0])).status()).toBe(404);
    await card.getByLabel("Odgovor trgovca").fill(`Merchant response ${f.id}`);
    await card.locator("[data-approve]").click();
    await expect(card).toHaveCount(0);

    await page.goto(`/izdelek/${f.product.slug}`);
    await expect(page.locator(`[data-review-id="${review.id}"]`)).toContainText(`Merchant response ${f.id}`);
    await expect(page.locator(`[data-review-id="${review.id}"]`)).toContainText("Preverjen kupec");
    // A guest order carries no account name; the verification statement follows the 4-star auto-publish setting saved above.
    await expect(page.locator(`[data-review-id="${review.id}"]`)).toContainText("Kupec ·");
    await expect(page.locator(`[data-review-id="${review.id}"] [data-review-verified-link]`)).toHaveAttribute("href", "#preverjanje-mnenj");
    await expect(page.locator("#preverjanje-mnenj")).toContainText("Kako preverjamo mnenja");
    await expect(page.locator("#preverjanje-mnenj")).toContainText("Mnenja s 4 ali 5 zvezdicami objavimo takoj");
    await expect(page.locator("#preverjanje-mnenj")).toContainText("nizke ocene");
    const image = page.locator(`[data-review-id="${review.id}"] img`); await expect(image).toHaveAttribute("srcset", /320w.*960w/);
    expect((await request.get(photos[1])).status()).toBe(200);
    expect((await request.get(photos[1].replace(/\.webp$/, "-320.webp"))).status()).toBe(200);
    const html = await (await request.get(`/izdelek/${f.product.slug}`)).text(); const schema = productSchema(html);
    expect(html).toContain(`Photo review ${f.id}`); expect(schema.aggregateRating.reviewCount).toBe(1); expect(schema.aggregateRating.ratingValue).toBe("5.0");
    expect(schema.review[0].author["@type"]).toBe("Person"); expect(schema.review[0].reviewBody).toContain(f.id);

    await adminPage.goto("/admin/ocene?status=PUBLISHED");
    const published = adminPage.locator(`[data-mod-card="${review.id}"]`);
    await published.getByLabel("Odgovor trgovca").fill(""); await published.locator("[data-save-reply]").click();
    await expect.poll(async () => (await prisma.review.findUnique({ where: { id: review.id } }))?.merchantReply).toBeNull();
    await published.locator("[data-reject]").click(); await expect(published).toHaveCount(0);
    // Rejection removes the remaining photo from the row and the disk.
    await expect.poll(async () => (await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).photos).toEqual([]);
    const rejectedHtml = await (await request.get(`/izdelek/${f.product.slug}`)).text();
    expect(rejectedHtml).not.toContain(`Photo review ${f.id}`); expect(productSchema(rejectedHtml).aggregateRating).toBeUndefined(); expect((await request.get(photos[1])).status()).toBe(404);
    await adminPage.goto("/admin/ocene?status=REJECTED"); await expect(adminPage.locator(`[data-mod-card="${review.id}"]`)).toBeVisible();
  } finally {
    await adminContext.close();
    if (setting) await prisma.setting.update({ where: { key: setting.key }, data: { value: setting.value ?? 0 } });
    else await prisma.setting.deleteMany({ where: { key: "reviews.autoPublishMinStars" } });
    if (delaySetting) await prisma.setting.update({ where: { key: delaySetting.key }, data: { value: delaySetting.value ?? 7 } });
    else await prisma.setting.deleteMany({ where: { key: "reviews.requestDelayDays" } });
    await cleanup(f);
  }
});

test("a review without a photo is accepted from the star link (QA M1)", async ({ page }) => {
  const f = await fixture();
  try {
    const token = signRatingToken({ orderItemId: f.order.items[0].id, rating: 4 }, E2E_AUTH_SECRET);
    await page.goto(`/oceni/hitro/${token}`); await dismissCmp(page);
    await expect(page.locator('[data-star="4"]')).toBeChecked();
    await page.getByLabel("Vaše mnenje").fill(`No photo ${f.id}`);
    // The photo input stays untouched: its empty part must not count as an upload.
    await page.getByRole("button", { name: "Oddaj mnenje" }).click();
    await expect(page.locator("[data-review-success]")).toContainText("Hvala za mnenje");
    const review = await prisma.review.findUniqueOrThrow({ where: { orderItemId: f.order.items[0].id } });
    expect(review.rating).toBe(4); expect(review.photos).toEqual([]); expect(review.text).toBe(`No photo ${f.id}`);
  } finally { await cleanup(f); }
});

test("SSR counts more than ten published reviews, retains low-star filters, and excludes rejected evidence", async ({ page, request }) => {
  const f = await fixture();
  try {
    await prisma.review.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ productId: f.product.id, title: `Public ${i} ${f.id}`, rating: i < 10 ? 5 : i === 10 ? 1 : 2, status: "PUBLISHED" as const, text: `Review body ${i}`, createdAt: new Date(Date.now() + i * 1000) })) });
    await prisma.review.create({ data: { productId: f.product.id, title: `Hidden ${f.id}`, rating: 1, status: "REJECTED", text: "Not for public display" } });
    const html = await (await request.get(`/izdelek/${f.product.slug}`)).text();
    expect(productSchema(html).aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: "4.4", reviewCount: 12 });
    expect(html).not.toContain(`Hidden ${f.id}`);
    await page.goto(`/izdelek/${f.product.slug}?pregled=lowest&zvezdice=1`); await dismissCmp(page);
    await expect(page.locator("[data-review-list] > li")).toHaveCount(1);
    await expect(page.locator("[data-review-list]")).toContainText(`Public 10 ${f.id}`);
    await page.locator('[data-sort="highest"]').click(); await expect(page).toHaveURL(/zvezdice=1/);
    await page.locator("[data-filter-photos]").click(); await expect(page.locator("[data-review-list] > li")).toHaveCount(0);
    await page.locator("[data-filter-photos]").click(); await expect(page.locator("[data-review-list] > li")).toHaveCount(1);
    await page.locator('[data-filter-stars="2"]').click(); await expect(page.locator("[data-review-list]")).toContainText(`Public 11 ${f.id}`);
  } finally { await cleanup(f); }
});

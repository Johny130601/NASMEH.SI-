import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { dismissCookieBanner, enrolledTotpFields, loginStaff, prisma, waitForMailMessage } from "./helpers";

/** Phase 7 step 3 (§14.2, §14.3, §14.6): products, variants, media, inventory, collections, bundles. */

const PASSWORD = "CatalogAcceptance123!";
const UPLOAD_ROOT = path.join(process.cwd(), "catalog-uploads");

test.afterAll(async () => { await prisma.$disconnect(); });

async function staff(role: "OWNER" | "MANAGER" | "SUPPORT", key: string) {
  const totp = enrolledTotpFields();
  const user = await prisma.user.create({ data: {
    email: `catalog-${role.toLowerCase()}-${key}@test.si`, name: `Staff ${role}`, role, emailVerified: new Date(),
    passwordHash: await bcrypt.hash(PASSWORD, 4), ...totp.data,
  } });
  return { ...user, secret: totp.secret };
}

const pngImage = () => sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();

async function uploadProductImage(page: Page, productId: string, kind: "CARD" | "GALLERY", alt: string, expectedCount: number) {
  const upload = page.locator("[data-media-upload]");
  await upload.locator("#media-files").setInputFiles({ name: "slika.png", mimeType: "image/png", buffer: await pngImage() });
  await upload.locator("#media-kind").selectOption(kind);
  await upload.getByLabel("Nadomestno besedilo (alt)").fill(alt);
  await upload.locator("[data-media-submit]").click();
  await expect.poll(() => prisma.mediaImage.count({ where: { productId } })).toBe(expectedCount);
  await expect(page.locator("[data-media-message]")).toHaveText("Slika je naložena.");
}

async function saveVariant(page: Page, sku: string, fields: Record<string, string>, expectedMessage: string | RegExp) {
  const form = page.locator(`[data-variant-form='${sku}']`);
  for (const [label, value] of Object.entries(fields)) await form.getByLabel(`${label} (${sku})`, { exact: true }).fill(value);
  await form.locator("[data-variant-save]").click();
  await expect(page.locator("[data-variant-message]")).toHaveText(expectedMessage);
}

async function saveProduct(page: Page) {
  await page.locator("[data-product-save]").click();
  await expect(page.locator("[data-product-message]")).toHaveText("Izdelek je shranjen.");
}

test("owner creates, prices, illustrates, restocks, hides and backorders a product that a guest then buys", async ({ page, browser, request }) => {
  const key = randomUUID().slice(0, 8);
  const owner = await staff("OWNER", key);
  const slug = `e2e-izdelek-${key}`;
  const sku = `E2E-${key.toUpperCase()}`;
  const title = `E2E izdelek ${key}`;
  const subscriber = `restock-${key}@test.si`;
  const shopper = `kupec-${key}@test.si`;
  let productId: string | null = null;
  try {
    await loginStaff(page, owner.email, PASSWORD, owner.secret);
    await page.goto("/admin/izdelki");
    await expect(page.locator("[data-admin-products]")).toBeVisible();

    // Create a draft with its first variant (stock 0, initial price row).
    const create = page.locator("[data-product-create]");
    await create.getByLabel("Naziv", { exact: true }).fill(title);
    await create.getByLabel("Slug (URL)").fill(slug);
    await create.getByLabel("SKU prve variante").fill(sku.toLowerCase());
    await create.getByLabel("Cena prve variante (centi, z DDV)").fill("2990");
    await create.getByRole("button", { name: "Ustvari osnutek" }).click();
    await page.waitForURL(/\/admin\/izdelki\/[a-z0-9]+$/);
    productId = page.url().split("/").pop()!;
    const created = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: { include: { priceHistory: true } } } });
    expect(created).toMatchObject({ slug, status: "DRAFT" });
    expect(created.variants[0]).toMatchObject({ sku, priceCents: 2990, stock: 0 });
    expect(created.variants[0].priceHistory.map((row) => row.priceCents)).toEqual([2990]);
    const variantId = created.variants[0].id;
    expect((await request.get(`/izdelek/${slug}`)).status()).toBe(404);

    // Basics and merchandising: activate, badge, USP chip, description.
    const editor = page.locator("[data-product-editor]");
    await editor.locator("#product-status").selectOption("ACTIVE");
    await editor.getByLabel("Opis (HTML dovoljen)").fill("<p>Opis e2e izdelka.</p>");
    await editor.getByRole("button", { name: "Dodaj značko" }).click();
    await editor.getByLabel("Napis 1").fill("Novo");
    await editor.locator("fieldset").filter({ hasText: "USP oznake (do 3)" }).getByRole("button", { name: "Dodaj", exact: true }).click();
    await editor.getByLabel("USP oznake (do 3) 1").fill("Brez peroksida");
    await saveProduct(page);
    const saved = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(saved).toMatchObject({ status: "ACTIVE", badges: [{ label: "Novo", style: "solid" }], description: "<p>Opis e2e izdelka.</p>" });
    expect((saved.customFields as { uspChips: string[] }).uspChips).toEqual(["Brez peroksida"]);

    // Stock 0 → 3 from the editor arms and mails a confirmed subscriber.
    await prisma.backInStockSubscription.create({ data: { email: subscriber, productId, variantId, status: "CONFIRMED", confirmToken: `e2e-${key}`, confirmedAt: new Date() } });
    await saveVariant(page, sku, { Zaloga: "3" }, /Sproženih obvestil o zalogi: 1/);
    const alert = await waitForMailMessage(subscriber);
    expect(alert.Subject).toContain(title);
    expect(`${alert.Text ?? ""}${alert.HTML ?? ""}`).toContain(`/izdelek/${slug}`);
    await expect(page.locator("[data-restock-armable]")).toHaveText("0");

    // Manual send: a subscriber who confirmed after the restock gets the alert on demand.
    const late = `restock-late-${key}@test.si`;
    await prisma.backInStockSubscription.create({ data: { email: late, productId, variantId, status: "CONFIRMED", confirmToken: `e2e-late-${key}`, confirmedAt: new Date() } });
    await page.reload();
    await expect(page.locator("[data-restock-armable]")).toHaveText("1");
    await page.locator("[data-restock-send]").click();
    await expect(page.locator("[data-restock-message]")).toContainText("poslano: 1");
    expect((await waitForMailMessage(late)).Subject).toContain(title);
    await expect(page.locator("[data-restock-armable]")).toHaveText("0");

    // Images: a card image for the lists and a gallery image for the PDP, served immutably.
    await uploadProductImage(page, productId, "CARD", `Kartica ${key}`, 1);
    await uploadProductImage(page, productId, "GALLERY", `Galerija ${key}`, 2);
    const media = await prisma.mediaImage.findMany({ where: { productId }, orderBy: { kind: "asc" } });
    const card = media.find((item) => item.kind === "CARD")!;
    expect(card.url).toMatch(new RegExp(`^/uploads/products/${productId}/[a-f0-9]{24}\\.webp$`));
    const image = await request.get(card.url);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/webp");
    expect(image.headers()["cache-control"]).toContain("immutable");
    expect((await request.get(`/uploads/products/${productId}/00000000000000000000dead.webp`)).status()).toBe(404);

    // Live on the storefront.
    await page.goto("/trgovina");
    const listing = page.locator(`[data-product-card='${slug}']`);
    await expect(listing).toBeVisible();
    // the card image comes first; the decorative hover view (first gallery image) follows it
    await expect(listing.locator("img").first()).toHaveAttribute("src", card.url);
    await expect(listing.locator("img").first()).toHaveAttribute("alt", `Kartica ${key}`);
    await expect(listing.locator("[data-hover-image]")).toHaveAttribute("alt", "");
    await page.goto(`/izdelek/${slug}`);
    await expect(page.locator("h1")).toHaveText(title);
    await expect(page.locator(`img[alt='Galerija ${key}']`).first()).toBeVisible();
    await expect(page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico" })).toBeVisible();
    await expect(page.locator("[data-backorder-note]")).toHaveCount(0);

    // A reduction goes through the price history and shows the Omnibus line.
    await page.goto(`/admin/izdelki/${productId}`);
    await saveVariant(page, sku, { "Cena (centi, z DDV)": "2490", "Primerjalna cena (centi)": "2990" }, "Varianta je shranjena.");
    const history = await prisma.priceHistory.findMany({ where: { variantId }, orderBy: { createdAt: "asc" } });
    expect(history.map((row) => [row.priceCents, row.compareAtPriceCents])).toEqual([[2990, null], [2490, 2990]]);
    await expect(page.locator("[data-price-history]")).toContainText("24,90");
    await page.goto(`/izdelek/${slug}`);
    // scoped to the buy box: the rails may carry other products' Omnibus lines
    const priceBox = page.locator("[data-pdp-price-box]");
    await expect(priceBox.locator("[data-omnibus-line]")).toContainText("29,90");
    await expect(priceBox.locator("span.line-through")).toContainText("29,90");

    // HIDE: sold out → gone from lists and the sitemap, PDP stays with noindex.
    await page.goto(`/admin/izdelki/${productId}`);
    await editor.locator("#product-soldout").selectOption("HIDE");
    await saveProduct(page);
    await saveVariant(page, sku, { Zaloga: "0" }, "Varianta je shranjena.");
    await page.goto("/trgovina");
    await expect(page.locator("[data-product-card]").first()).toBeVisible();
    await expect(page.locator(`[data-product-card='${slug}']`)).toHaveCount(0);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/izdelek/${slug}`);
    const hidden = await request.get(`/izdelek/${slug}`);
    expect(hidden.status()).toBe(200);
    expect(await hidden.text()).toMatch(/<meta name="robots" content="noindex/);

    // Backorder: listed again with the note; a guest buys below zero stock.
    await page.goto(`/admin/izdelki/${productId}`);
    await page.locator(`[data-variant-form='${sku}'] [data-variant-backorder]`).check();
    await saveVariant(page, sku, { "Opomba ob prednaročilu (npr. rok dobave)": "Dobava v 5 dneh." }, "Varianta je shranjena.");
    await page.goto("/trgovina");
    await expect(page.locator(`[data-product-card='${slug}'] [data-backorder-note]`)).toContainText("Dobava v 5 dneh.");
    expect(await (await request.get("/sitemap.xml")).text()).toContain(`/izdelek/${slug}`);

    const guest = await browser.newContext();
    const shop = await guest.newPage();
    try {
      await shop.goto(`/izdelek/${slug}`);
      await dismissCookieBanner(shop);
      await expect(shop.locator("[data-backorder-note]")).toContainText("Dobava v 5 dneh.");
      await shop.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico" }).click();
      await expect(shop.locator("[data-cart-badge]")).toHaveText("1");
      await shop.goto("/checkout");
      await shop.getByLabel("E-pošta", { exact: true }).fill(shopper);
      await shop.locator("[data-continue-contact]").click();
      await shop.getByLabel("Ime in priimek").fill("Kupec Prednaročilo");
      await shop.getByLabel("Ulica in hišna številka").fill("Testna ulica 12");
      await shop.getByLabel("Kraj").fill("Ljubljana");
      await shop.getByLabel("Poštna številka").fill("1000");
      await shop.locator("[data-continue-shipping]").click();
      await shop.locator("[data-continue-payment]").click();
      await shop.locator("[data-place-order]").click();
      await expect(shop.locator("[data-pay-panel]")).toBeVisible({ timeout: 15_000 });
      await shop.locator("[data-test-pay-success]").click();
      await shop.waitForURL(/\/potrditev\/NS-/, { timeout: 20_000 });
      const number = await shop.locator("[data-order-number]").innerText();
      const order = await prisma.order.findUniqueOrThrow({ where: { number }, include: { items: true } });
      expect(order).toMatchObject({ status: "PAID", stockDeducted: true, email: shopper });
      expect(order.items[0]).toMatchObject({ sku, quantity: 1, unitPriceCents: 2490 });
      expect((await prisma.variant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(-1);
    } finally {
      await guest.close();
    }
    await page.goto("/admin/izdelki");
    await expect(page.locator(`[data-product-row='${slug}'] [data-product-stock]`)).toHaveText("-1");
  } finally {
    await prisma.order.deleteMany({ where: { email: shopper } });
    if (productId) {
      await prisma.product.deleteMany({ where: { id: productId } });
      await rm(path.join(UPLOAD_ROOT, "products", productId), { recursive: true, force: true });
    }
    await prisma.user.deleteMany({ where: { id: owner.id } });
  }
});

test("owner creates a collection with a banner, orders products and restores the seeded merchandising order", async ({ page, request }) => {
  const key = randomUUID().slice(0, 8);
  const owner = await staff("OWNER", key);
  const slug = `e2e-kolekcija-${key}`;
  const trakci = await prisma.product.findUniqueOrThrow({ where: { slug: "belilni-trakci-za-zobe" } });
  const ustna = await prisma.product.findUniqueOrThrow({ where: { slug: "ustna-voda-globinsko-ciscenje" } });
  const beljenje = await prisma.collection.findUniqueOrThrow({
    where: { slug: "beljenje" }, include: { products: { orderBy: { position: "asc" }, select: { productId: true, position: true } } },
  });
  let collectionId: string | null = null;
  try {
    await loginStaff(page, owner.email, PASSWORD, owner.secret);
    await page.goto("/admin/kolekcije");
    await expect(page.locator("[data-admin-collections]")).toBeVisible();
    const create = page.locator("[data-collection-create]");
    await create.getByLabel("Naziv", { exact: true }).fill(`E2E kolekcija ${key}`);
    await create.getByLabel("Slug (URL)").fill(slug);
    await create.getByRole("button", { name: "Ustvari", exact: true }).click();
    await page.waitForURL(/\/admin\/kolekcije\/[a-z0-9]+$/);
    collectionId = page.url().split("/").pop()!;

    // Members and manual order.
    const editor = page.locator("[data-collection-editor]");
    const addForm = editor.locator("form").filter({ has: page.locator("#collection-add") });
    await page.locator("#collection-add").selectOption(trakci.id);
    await addForm.getByRole("button", { name: "Dodaj", exact: true }).click();
    await expect(page.locator("[data-collection-product='belilni-trakci-za-zobe']")).toBeVisible();
    await page.locator("#collection-add").selectOption(ustna.id);
    await addForm.getByRole("button", { name: "Dodaj", exact: true }).click();
    await expect(page.locator("[data-collection-product='ustna-voda-globinsko-ciscenje']")).toBeVisible();
    await page.locator("[data-collection-product='ustna-voda-globinsko-ciscenje']").getByRole("button", { name: "Gor" }).click();
    await expect(page.locator("[data-collection-product]").first()).toHaveAttribute("data-collection-product", "ustna-voda-globinsko-ciscenje");
    const members = await prisma.collectionProduct.findMany({ where: { collectionId }, orderBy: { position: "asc" } });
    expect(members.map((row) => [row.productId, row.position])).toEqual([[ustna.id, 0], [trakci.id, 1]]);

    // Fields, noindex and the desktop banner.
    await page.locator("[data-collection-noindex]").check();
    await page.locator("[data-collection-save]").click();
    await expect(page.locator("[data-collection-message]")).toHaveText("Kolekcija je shranjena.");
    const banner = page.locator("[data-banner-form='desktop']");
    await banner.locator("#banner-desktop").setInputFiles({ name: "pasica.png", mimeType: "image/png", buffer: await pngImage() });
    await banner.getByRole("button", { name: "Naloži" }).click();
    await expect(page.locator("[data-banner-preview='desktop']")).toBeVisible();
    const stored = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } });
    expect(stored).toMatchObject({ slug, noindex: true });
    expect(stored.bannerImage).toMatch(new RegExp(`^/uploads/collections/${collectionId}/[a-f0-9]{24}\\.webp$`));
    expect((await request.get(stored.bannerImage!)).headers()["content-type"]).toBe("image/webp");
    await page.locator("[data-collection-product='belilni-trakci-za-zobe']").getByRole("button", { name: "Odstrani" }).click();
    await expect(page.locator("[data-collection-product='belilni-trakci-za-zobe']")).toHaveCount(0);

    // The seeded tab follows the manual order: swap the first two and back.
    await page.goto(`/admin/kolekcije/${beljenje.id}`);
    await page.locator("[data-collection-product='ustna-voda-globinsko-ciscenje']").getByRole("button", { name: "Gor" }).click();
    await expect(page.locator("[data-collection-product]").first()).toHaveAttribute("data-collection-product", "ustna-voda-globinsko-ciscenje");
    await page.goto("/trgovina?kolekcija=beljenje");
    await expect(page.locator("[data-product-card]").first()).toHaveAttribute("data-product-card", "ustna-voda-globinsko-ciscenje");
    await page.goto(`/admin/kolekcije/${beljenje.id}`);
    await page.locator("[data-collection-product='ustna-voda-globinsko-ciscenje']").getByRole("button", { name: "Dol" }).click();
    await expect(page.locator("[data-collection-product]").first()).toHaveAttribute("data-collection-product", "belilni-trakci-za-zobe");
    await page.goto("/trgovina?kolekcija=beljenje");
    await expect(page.locator("[data-product-card]").first()).toHaveAttribute("data-product-card", "belilni-trakci-za-zobe");
  } finally {
    for (const row of beljenje.products) {
      await prisma.collectionProduct.updateMany({ where: { collectionId: beljenje.id, productId: row.productId }, data: { position: row.position } });
    }
    if (collectionId) {
      await prisma.collection.deleteMany({ where: { id: collectionId } });
      await rm(path.join(UPLOAD_ROOT, "collections", collectionId), { recursive: true, force: true });
    }
    await prisma.user.deleteMany({ where: { id: owner.id } });
  }
});

test("owner builds a bundle whose price flows through the price history and shows the savings line", async ({ page }) => {
  const key = randomUUID().slice(0, 8);
  const owner = await staff("OWNER", key);
  const slug = `e2e-paket-${key}`;
  const product = await prisma.product.create({ data: {
    title: `E2E paket ${key}`, slug, status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
    variants: { create: { sku: `PAK-${key.toUpperCase()}`, title: `E2E paket ${key}`, priceCents: 5498, stock: 10 } },
  }, include: { variants: true } });
  const [trakci, ustna] = await Promise.all([
    prisma.variant.findUniqueOrThrow({ where: { sku: "NAS-TRK-14" } }),
    prisma.variant.findUniqueOrThrow({ where: { sku: "NAS-UST-500" } }),
  ]);
  try {
    await loginStaff(page, owner.email, PASSWORD, owner.secret);
    await page.goto("/admin/paketi");
    await expect(page.locator("[data-admin-bundles]")).toBeVisible();
    await page.locator("#bundle-product").selectOption(product.id);
    await page.getByRole("button", { name: "Ustvari paket" }).click();
    await page.waitForURL(new RegExp(`/admin/paketi/${product.id}$`));

    const editor = page.locator("[data-bundle-editor]");
    await editor.locator("[data-bundle-variant='0']").selectOption(trakci.id);
    await editor.getByRole("button", { name: "Dodaj sestavino" }).click();
    await editor.locator("[data-bundle-variant='1']").selectOption(ustna.id);
    await editor.getByLabel("Cena paketa (centi, z DDV)").fill("4990");
    await expect(editor.locator("[data-bundle-savings]")).toContainText("54,98");
    await expect(editor.locator("[data-bundle-savings]")).toContainText("5,08");
    await expect(editor.locator("[data-bundle-savings]")).toContainText("9 %");
    await editor.locator("[data-bundle-active]").check();
    await editor.locator("[data-bundle-save]").click();
    await expect(editor.locator("[data-bundle-message]")).toHaveText("Paket je shranjen.");

    const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { bundle: { include: { items: true } }, variants: { include: { priceHistory: true } } } });
    expect(stored.bundle).toMatchObject({ priceCents: 4990, active: true });
    expect(stored.bundle!.items.map((item) => [item.variantId, item.quantity]).sort()).toEqual([[trakci.id, 1], [ustna.id, 1]].sort());
    expect(stored.variants[0]).toMatchObject({ priceCents: 4990, maxCartQuantity: 1 });
    expect(stored.variants[0].priceHistory.map((row) => row.priceCents)).toEqual([4990]);

    await page.goto("/admin/paketi");
    const row = page.locator(`[data-bundle-row='${slug}']`);
    await expect(row).toContainText("49,90");
    await expect(row).toContainText("9 %");
    await page.goto(`/izdelek/${slug}`);
    await expect(page.locator("h1")).toHaveText(`E2E paket ${key}`);
    await expect(page.getByText(trakci.title).first()).toBeVisible();
  } finally {
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
  }
});

test("support is refused at the catalog screens while a manager may manage it", async ({ page, browser }) => {
  const key = randomUUID().slice(0, 8);
  const support = await staff("SUPPORT", key);
  const manager = await staff("MANAGER", key);
  const threshold = await prisma.setting.findUnique({ where: { key: "inventory.lowStockThreshold" } });
  try {
    await loginStaff(page, support.email, PASSWORD, support.secret);
    for (const route of ["/admin/izdelki", "/admin/kolekcije", "/admin/paketi"]) {
      await page.goto(route);
      await page.waitForURL(/\/admin\?dostop=zavrnjen/);
      await expect(page.locator("[data-forbidden-notice]")).toBeVisible();
    }
    await expect(page.locator("[data-admin-nav] a[href='/admin/izdelki']")).toHaveCount(0);

    const context = await browser.newContext();
    const managerPage = await context.newPage();
    try {
      await loginStaff(managerPage, manager.email, PASSWORD, manager.secret);
      await managerPage.goto("/admin/izdelki");
      await expect(managerPage.locator("[data-admin-products]")).toBeVisible();
      await expect(managerPage.locator("[data-product-row='belilni-trakci-za-zobe']")).toBeVisible();
      const lowStock = managerPage.locator("[data-low-stock-form]");
      await lowStock.getByLabel("Opozori, ko je zaloga enaka ali manjša od").fill("7");
      await lowStock.getByRole("button", { name: "Shrani prag" }).click();
      await expect.poll(async () => (await prisma.setting.findUniqueOrThrow({ where: { key: "inventory.lowStockThreshold" } })).value).toBe(7);
      await managerPage.locator("[data-product-row='belilni-trakci-za-zobe'] a").first().click();
      await managerPage.waitForURL(/\/admin\/izdelki\/[a-z0-9]+$/);
      await expect(managerPage.locator("[data-admin-product='belilni-trakci-za-zobe']")).toBeVisible();
      await expect(managerPage.locator("[data-variant-form='NAS-TRK-14']")).toBeVisible();
      await expect(managerPage.locator("[data-price-history]")).toContainText("NAS-TRK-14");
    } finally {
      await context.close();
    }
  } finally {
    if (threshold) await prisma.setting.update({ where: { key: "inventory.lowStockThreshold" }, data: { value: threshold.value as number } });
    await prisma.user.deleteMany({ where: { id: { in: [support.id, manager.id] } } });
  }
});

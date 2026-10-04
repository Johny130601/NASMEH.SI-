import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { setVariantStock } from "@/lib/inventory/restock";
import { cart as cartCopy } from "@/lib/copy/cart";
import { prisma } from "./helpers";

/** /cart e2e (§7.1) + merge-on-login + tamper. Serial: shared guest/DB state. */
test.describe.configure({ mode: "serial" });

const CUSTOMER = { email: "customer@nasmeh.si", password: "Customer123!" };

const ATC_EXPORT = "addToCartAction";
const ATC_MODULE = "app/(storefront)/actions/cart.ts";

interface ServerReferenceManifest {
  node?: Record<string, { exportedName?: string; filename?: string }>;
}

/**
 * Next-Action id candidates for addToCartAction, read from the build the server runs (.next in
 * the repo root, where `npm run build` writes). Most specific source first:
 * 1. .next/server/server-reference-manifest.json — what the server routes Next-Action ids by:
 *    node[id] = { workers, layer, filename, exportedName }; matched by export name AND module
 *    (filename is project-relative, with backslashes and a leading "../C:\…" on Windows builds).
 * 2. Client chunks anywhere under .next/static/chunks (page or shared — step 4 moved the action
 *    stubs out of the trgovina page chunk): an id followed by its name in the
 *    createServerReference(id, callServer, void 0, findSourceMapURL, "addToCartAction") call.
 * 3. Only when neither names it: every action-shaped id in those chunks (the old blind probe).
 * The caller still requires ok:true for an ACTIVE variant, so a wrong id can never pass silently.
 */
function addToCartActionCandidates(): { source: string; ids: string[] } {
  const nextDir = path.join(process.cwd(), ".next");
  const manifestPath = path.join(nextDir, "server", "server-reference-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ServerReferenceManifest;
    const named = Object.entries(manifest.node ?? {})
      .filter(
        ([, entry]) =>
          entry.exportedName === ATC_EXPORT &&
          (entry.filename ?? "").replace(/\\/g, "/").endsWith(ATC_MODULE),
      )
      .map(([id]) => id);
    if (named.length > 0) return { source: `manifest ${manifestPath}`, ids: named };
  }

  const chunkRoot = path.join(nextDir, "static", "chunks");
  const sources = fs.existsSync(chunkRoot)
    ? fs
        .readdirSync(chunkRoot, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".js"))
        .map((file) => fs.readFileSync(path.join(chunkRoot, file), "utf8"))
    : [];
  const unique = (ids: string[]) => [...new Set(ids)];
  const byName = new RegExp(`\\\\?"([0-9a-f]{40,})\\\\?"[^"]{0,300}?\\\\?"${ATC_EXPORT}\\\\?"`, "g");
  const namedInChunks = unique(sources.flatMap((js) => [...js.matchAll(byName)].map((m) => m[1])));
  if (namedInChunks.length > 0) return { source: `named in client chunks under ${chunkRoot}`, ids: namedInChunks };
  const anyId = unique(sources.flatMap((js) => [...js.matchAll(/\\?"([0-9a-f]{40,})\\?"/g)].map((m) => m[1])));
  return { source: `all ids in client chunks under ${chunkRoot}`, ids: anyId };
}

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }
}

async function clearCartUi(page: Page) {
  await page.goto("/cart");
  while ((await page.locator("[data-cart-line] button[aria-label='Odstrani izdelek']").count()) > 0) {
    await page.locator("[data-cart-line] button[aria-label='Odstrani izdelek']").first().click();
    await page.waitForTimeout(400);
  }
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ATC from PDP + sticky bar → badge count → cart line", async ({ page }) => {
  await page.goto("/izdelek/belilni-trakci-za-zobe");
  await dismissCmp(page);

  // A clean add from a non-bundle PDP hands off to the bundle builder (§7.1)
  // instead of confirming in place; the add is still what this test is about,
  // so it follows the hand-off and comes back for the sticky-bar add.
  await page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page).toHaveURL(/\/sestavi-paket\?izdelek=belilni-trakci-za-zobe$/);
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  // sticky bar ATC adds one more, and hands off the same way
  await page.goto("/izdelek/belilni-trakci-za-zobe");
  await page.locator("[data-sticky-buy-bar]").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page).toHaveURL(/\/sestavi-paket\?izdelek=belilni-trakci-za-zobe$/);
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");

  await page.goto("/cart");
  await expect(page.locator("[data-cart-line='NAS-TRK-14']")).toBeVisible();
  await expect(page.getByText("Vaša košarica (2)")).toBeVisible();
  await expect(page.locator("[data-cart-total]")).toHaveText(/69,98/);
});

test("qty steppers: cap 5 + message, minus disabled at 1, remove", async ({ page }) => {
  // fresh context per test → seed the guest cart via UI first
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  await page.goto("/cart");
  const line = page.locator("[data-cart-line='NAS-TRK-14']");
  await expect(line).toBeVisible();

  // pump to cap 5 → cap message appears, + disabled
  const plus = line.getByLabel("Povečaj količino");
  for (let i = 0; i < 4; i++) {
    await plus.click();
    await page.waitForTimeout(350);
    if (await plus.isDisabled()) break;
  }
  await expect(line.getByText("Največ 5 kosov na naročilo")).toBeVisible();
  await expect(plus).toBeDisabled();

  // back to 1 → minus disabled
  const minus = line.getByLabel("Zmanjšaj količino");
  for (let i = 0; i < 4; i++) {
    await minus.click();
    await page.waitForTimeout(300);
  }
  await expect(minus).toBeDisabled();

  // remove → empty state
  await line.getByLabel("Odstrani izdelek").click();
  await expect(page.getByText("Vaša košarica je prazna")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator("[data-cart-badge]")).toHaveCount(0);
});

test("progress bar states: empty → in progress → reached", async ({ page }) => {
  // empty: 5 % floor + unlock copy (the empty state renders on the empty cart, QA C2-F3)
  await page.goto("/cart");
  await expect(page.getByText("Vaša košarica je prazna")).toBeVisible();
  await expect(page.locator("#shipping-progress-label")).toHaveText(/^Odklenite brezplačno dostavo pri naročilih od 45,00\s€$/);
  await expect(page.locator("[role='progressbar']")).toHaveAttribute("aria-valuenow", "5");

  // in progress: 1× mouthwash 19,99 → "Samo še €26"
  await page.goto("/trgovina");
  await dismissCmp(page);
  const mouthwash = page.locator("[data-product-card='ustna-voda-globinsko-ciscenje']");
  await mouthwash.getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
  await page.goto("/cart");
  await expect(page.getByText(/Samo še €26 vas loči/)).toBeVisible();
  await expect(page.locator("[role='progressbar']")).toHaveAttribute("aria-valuenow", "44");

  // reached: add bundle 49,99 → free shipping
  await page.goto("/izdelek/paket-popolna-rutina");
  await page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico" }).click();
  // wait for the Server Action to resolve before navigating (cookie write)
  await expect(page.locator("[data-buy-box]").getByRole("button", { name: "Dodano ✓" })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText(/Odklenili ste brezplačno dostavo/)).toBeVisible();
  await expect(page.locator("[role='progressbar']")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByText("Brezplačna", { exact: true })).toBeVisible();

  // bundle contents listed under the bundle line
  const bundleLine = page.locator("[data-cart-line='NAS-PAK-RUTINA']");
  await expect(bundleLine.getByText("Vsebina paketa:")).toBeVisible();
  // the bundle line carries its offer label pill, a plain product line none (spec §7.1, QA 2026-10-03 T2-11)
  await expect(bundleLine.locator("[data-line-pill='bundle']")).toHaveText(cartCopy.line.bundlePill);
  await expect(bundleLine.locator("[data-line-pill='bundle']")).toHaveCSS("text-transform", "uppercase");
  await expect(page.locator("[data-line-pill]")).toHaveCount(1);
  await expect(bundleLine.getByText(/1× Belilni trakci/)).toBeVisible();
  // the cap notice states the line's own cap, declined (QA C2-F1)
  await expect(bundleLine.locator("[data-cap-note]")).toHaveText("Največ 1 kos na naročilo");

  await clearCartUi(page);
});

test("cross-sell quick ATC from cart page", async ({ page }) => {
  // seed cart with one item so the shelf renders
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='serum-korektor-barve-zob']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await page.goto("/cart");

  const shelf = page.locator("[data-product-card='belilni-trakci-za-zobe']").last();
  await shelf.getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");
  await expect(page.locator("[data-cart-line='NAS-TRK-14']")).toBeVisible();

  await clearCartUi(page);
});

test("discounted line: per-unit figures together, line total separate (qty 2)", async ({ page }) => {
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='serum-korektor-barve-zob']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  await page.goto("/cart");
  const line = page.locator("[data-cart-line='NAS-SER-30']");
  await line.getByLabel("Povečaj količino").click();
  await expect(line.locator("[data-line-total]")).toContainText("39,98");

  // struck prior price sits next to the unit price, never next to the line total
  const unit = line.locator("[data-unit-price]");
  await expect(unit.locator("span.line-through")).toContainText("24,99");
  await expect(unit).toContainText("19,99");
  await expect(unit).toContainText("na kos");
  await expect(line.locator("[data-line-total] span.line-through")).toHaveCount(0);
  await expect(line.locator("[data-omnibus-line]")).toContainText("24,99");

  // a struck figure is never lower than the price it is struck against
  const euros = (text: string | null) => Number((text ?? "").replace(/[^\d,]/g, "").replace(",", "."));
  const struck = euros(await unit.locator("span.line-through").textContent());
  const unitText = (await unit.textContent()) ?? "";
  const current = euros(unitText.slice(unitText.lastIndexOf("24,99") + "24,99".length));
  expect(struck).toBeGreaterThan(current);

  await clearCartUi(page);
});

test("/koda scaffold: stores code, shows pill, remove works", async ({ page }) => {
  // summary (with the code pill) renders only with items — seed one
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  await page.goto("/koda/TEST10");
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.locator("[data-active-code]")).toHaveText("TEST10");
  await expect(page.getByText(/ne sešteva se z drugimi ponudbami/)).toBeVisible();

  await page.getByRole("button", { name: "Odstrani kodo" }).click();
  await expect(page.locator("[data-active-code]")).toHaveCount(0);

  // A malformed code is refused without echoing it; the one-time notice leaves the address (QA C2-F2).
  await page.goto("/koda/not_valid!");
  await expect(page.locator("[data-koda-notice]")).toHaveText("Koda ni veljavna.");
  await expect(page).toHaveURL(/\/cart$/);
  await page.reload();
  await expect(page.locator("[data-koda-notice]")).toHaveCount(0);
});

test("a line that sells out while in the cart is flagged, cannot grow and closes the checkout (QA 2026-09-30)", async ({ page }) => {
  const key = randomUUID();
  const product = await prisma.product.create({
    data: {
      title: `Razprodano v košarici ${key.slice(0, 8)}`, slug: `e2e-sold-in-cart-${key}`, status: "ACTIVE",
      visibleInCatalog: false, visibleInSearch: false,
      variants: { create: { sku: `E2E-SOLD-${key}`, priceCents: 1999, stock: 3 } },
    },
    include: { variants: true },
  });
  const [variant] = product.variants;
  try {
    // The buy box hands a clean add on to the bundle builder; the badge proves the line landed.
    await page.goto(`/izdelek/${product.slug}`);
    await dismissCmp(page);
    await page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico", exact: true }).click();
    await expect(page.locator("[data-cart-badge]")).toHaveText("1");

    await setVariantStock(variant.id, 0);

    await page.goto("/cart");
    const line = page.locator(`[data-cart-line='${variant.sku}']`);
    await expect(line.locator("[data-line-sold-out]")).toHaveText("Ni več na zalogi — odstranite izdelek, da nadaljujete z nakupom.");
    // The stepper cannot raise it and no cap notice pretends it is a quantity limit.
    await expect(line.getByLabel("Povečaj količino")).toBeDisabled();
    await expect(line.locator("[data-cap-note]")).toHaveCount(0);
    await expect(page.locator("[data-cart-sold-out]")).toHaveText("Nekaterih izdelkov ni več na zalogi. Odstranite jih, da nadaljujete na blagajno.");
    await expect(page.locator("[data-begin-checkout]")).toBeDisabled();
    // Listed with its own price, but not payable: the header keeps counting it, the totals do not.
    await expect(line.locator("[data-line-total]")).toHaveText("19,99 €");
    await expect(page.locator("h1")).toContainText("(1)");
    await expect(page.locator("[data-cart-total]")).toHaveText("0,00 €");
    // nothing can be shipped, so no free-shipping claim next to the bar's empty state
    await expect(page.locator("[data-summary-shipping]")).toHaveText("—");

    // Typed straight in, the checkout stops at the start and names the line, not at "Oddaj naročilo".
    await page.goto("/checkout");
    const notice = page.locator("[data-checkout-sold-out]");
    await expect(notice.locator("[data-checkout-sold-out-line]")).toHaveText([product.title]);
    await expect(page.locator("[data-continue-contact]")).toBeDisabled();
    await expect(page.locator("[data-quote-failure]")).toHaveAttribute("data-quote-failure", "sold_out");
    await notice.getByRole("link", { name: "Uredi košarico" }).click();
    await expect(page).toHaveURL(/\/cart$/);

    await line.getByLabel("Odstrani izdelek").click();
    await expect(page.getByText("Vaša košarica je prazna")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-cart-sold-out]")).toHaveCount(0);
  } finally {
    await prisma.product.delete({ where: { id: product.id } });
  }
});

test("merge-on-login: guest lines merge into DB cart, cookie cleared", async ({
  page,
  context,
}) => {
  // guest adds 2 lines
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await page.locator("[data-product-card='ustna-voda-globinsko-ciscenje']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");

  // pre-clean the customer's DB cart
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: CUSTOMER.email },
  });
  await prisma.cartItem.deleteMany({
    where: { cart: { userId: customer.id } },
  });

  // login via the credentials form
  await page.goto("/prijava");
  await page.getByLabel("E-pošta", { exact: true }).fill(CUSTOMER.email);
  await page.getByLabel("Geslo").fill(CUSTOMER.password);
  await page.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/racun/, { timeout: 15_000 });

  // guest cookie cleared
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "nasmeh_cart")).toBeUndefined();

  // DB cart has both lines
  const dbCart = await prisma.cart.findUnique({
    where: { userId: customer.id },
    include: { items: true },
  });
  expect(dbCart?.items).toHaveLength(2);

  // badge reads from DB cart now
  await page.goto("/cart");
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");
  await expect(page.locator("[data-cart-line]")).toHaveCount(2);

  // sign out via cookie clear + clean DB cart for other tests
  await context.clearCookies();
  await prisma.cartItem.deleteMany({ where: { cart: { userId: customer.id } } });
});

test("tamper test: forged guest cookie is rejected (never trusted)", async ({
  page,
  context,
}) => {
  // valid cart first
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  // forge: rewrite quantity to 99 keeping the old signature
  const cookies = await context.cookies();
  const cartCookie = cookies.find((c) => c.name === "nasmeh_cart");
  expect(cartCookie).toBeTruthy();
  const forgedPayload = Buffer.from(
    JSON.stringify({ v: 1, lines: [{ variantId: "x", quantity: 99 }] }),
  ).toString("base64url");
  const signature = cartCookie!.value.split(".").pop()!;
  await context.addCookies([
    {
      name: "nasmeh_cart",
      value: `${forgedPayload}.${signature}`,
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  await page.goto("/cart");
  await expect(page.getByText("Vaša košarica je prazna")).toBeVisible();
  await expect(page.locator("[data-cart-badge]")).toHaveCount(0);
});

test("visibility: DRAFT/hiddenDeal variants are rejected server-side + leave the catalog", async ({
  request,
}) => {
  const mouthwash = await prisma.product.findUniqueOrThrow({
    where: { slug: "ustna-voda-globinsko-ciscenje" },
    include: { variants: { take: 1 } },
  });
  const variantId = mouthwash.variants[0].id;

  // find addToCartAction's id by name, then prove it: it must return ok:true for the ACTIVE variant
  const candidates = addToCartActionCandidates();
  expect(candidates.ids.length, `no Server Action ids found (${candidates.source})`).toBeGreaterThan(0);
  let atcId: string | null = null;
  for (const id of candidates.ids) {
    const res = await request.post("/trgovina", {
      headers: { "Next-Action": id, "content-type": "text/plain;charset=UTF-8" },
      data: `[{"variantId":"${variantId}","quantity":1}]`,
    });
    const text = await res.text();
    if (/"ok":true/.test(text)) {
      atcId = id;
      break;
    }
  }
  expect(atcId, `no ${ATC_EXPORT} id added the ACTIVE variant (${candidates.source})`).toBeTruthy();

  // DRAFT → button gone from catalog + action rejects
  await prisma.product.update({
    where: { id: mouthwash.id },
    data: { status: "DRAFT" },
  });
  try {
    const html = await (await request.get("/trgovina")).text();
    expect(html).not.toContain("Ustna voda za globinsko čiščenje");

    const res = await request.post("/trgovina", {
      headers: {
        "Next-Action": atcId!,
        "content-type": "text/plain;charset=UTF-8",
      },
      data: `[{"variantId":"${variantId}","quantity":1}]`,
    });
    expect(await res.text()).toContain('"ok":false');
  } finally {
    await prisma.product.update({
      where: { id: mouthwash.id },
      data: { status: "ACTIVE" },
    });
  }

  // hiddenDeal → action rejects even though ACTIVE
  await prisma.product.update({
    where: { id: mouthwash.id },
    data: { hiddenDeal: true },
  });
  try {
    const res = await request.post("/trgovina", {
      headers: {
        "Next-Action": atcId!,
        "content-type": "text/plain;charset=UTF-8",
      },
      data: `[{"variantId":"${variantId}","quantity":1}]`,
    });
    expect(await res.text()).toContain('"ok":false');
  } finally {
    await prisma.product.update({
      where: { id: mouthwash.id },
      data: { hiddenDeal: false },
    });
  }
});

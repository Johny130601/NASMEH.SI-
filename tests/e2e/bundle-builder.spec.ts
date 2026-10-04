import { expect, test, type Locator, type Page } from "@playwright/test";
import { db } from "@/lib/db";
import { formatEUR, formatUnitPrice, priceReduction } from "@/lib/pricing";
import { getBundleBuilder } from "@/lib/settings";
import { bundle as copy } from "@/lib/copy/bundle";
import { cart as cartCopy } from "@/lib/copy/cart";
import { catalog } from "@/lib/copy/catalog";
import { promo } from "@/lib/copy/promo";
import { dismissCookieBanner, prisma } from "./helpers";

/**
 * Bundle builder e2e (§7.1) — /sestavi-paket, the step a product page hands a
 * clean add off to.
 *
 * Every figure below is derived from the rows and Settings the page itself
 * reads — the offer units the `bundle.builder` Setting names, the variants'
 * own prices, the stored price history — never typed into the spec. A reprice
 * or a Setting change must move the expectation with it (AGENTS §8.23), and
 * the totals are checked against each other as the DOM states them, so the
 * module can never show a sum it would not charge.
 *
 * Serial like its neighbours: the suite shares one dev database. Each test
 * still gets a fresh context, so the guest cart starts empty and the builder
 * always opens on the smallest offer.
 */
test.describe.configure({ mode: "serial" });

const BASE_SLUG = "belilni-trakci-za-zobe";

const builderPath = (slug: string) => `/sestavi-paket?izdelek=${encodeURIComponent(slug)}`;

test.afterAll(async () => {
  await Promise.all([prisma.$disconnect(), db.$disconnect()]);
});

/** Money and copy carry non-breaking spaces; compare on one kind of space. */
const flat = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim();

/** The cents behind a rendered figure ("−39,98 €" → 3998). */
const cents = (value: string | null) =>
  Math.round(Number(flat(value).replace(/[^\d,]/g, "").replace(",", ".")) * 100);

/** Mirrors lib/bundle/load.ts PRODUCT_SELECT for the fields this spec asserts on. */
const ITEM_SELECT = {
  id: true,
  slug: true,
  title: true,
  variants: {
    orderBy: { createdAt: "asc" },
    take: 1,
    select: {
      id: true,
      sku: true,
      priceCents: true,
      compareAtPriceCents: true,
      stock: true,
      allowBackorder: true,
      maxCartQuantity: true,
    },
  },
} as const;

interface AddOnFixture {
  slug: string;
  title: string;
  sku: string;
  priceCents: number;
}

/**
 * The add-on shelf `loadBundleBuilder` resolves: the operator's list when the
 * Setting names one, otherwise the base product's own collections — sold-out
 * candidates dropped, three at most.
 */
async function resolveAddOns(
  base: { id: string; collections: Array<{ collection: { slug: string } }> },
  slugs: string[],
): Promise<AddOnFixture[]> {
  const collectionSlugs = base.collections.map((entry) => entry.collection.slug);
  let candidates: Array<{
    slug: string;
    title: string;
    variants: Array<{ sku: string; priceCents: number; stock: number; allowBackorder: boolean }>;
  }>;
  if (slugs.length > 0) {
    const found = await prisma.product.findMany({ where: { slug: { in: slugs } }, select: ITEM_SELECT });
    candidates = slugs
      .map((slug) => found.find((product) => product.slug === slug))
      .filter((product): product is (typeof found)[number] => product !== undefined);
  } else {
    candidates = await prisma.product.findMany({
      where: {
        id: { not: base.id },
        status: "ACTIVE",
        hiddenDeal: false,
        bundle: { is: null },
        collections: { some: { collection: { slug: { in: collectionSlugs } } } },
      },
      select: ITEM_SELECT,
      orderBy: { createdAt: "asc" },
      take: 8,
    });
  }
  return candidates
    .filter((product) => {
      const variant = product.variants[0];
      return variant !== undefined && (variant.allowBackorder || variant.stock > 0);
    })
    .slice(0, 3)
    .map((product) => ({
      slug: product.slug,
      title: product.title,
      sku: product.variants[0].sku,
      priceCents: product.variants[0].priceCents,
    }));
}

/** What /sestavi-paket resolves for the base product, read from the rows the page reads. */
async function builderFixture() {
  const config = await getBundleBuilder();
  const base = await prisma.product.findUniqueOrThrow({
    where: { slug: BASE_SLUG },
    select: { ...ITEM_SELECT, collections: { select: { collection: { select: { slug: true } } } } },
  });
  const baseVariant = base.variants[0];
  // An offer the cap or the stock cannot honour is never rendered, so the row
  // can never offer a quantity the cart would clamp (lib/bundle/load.ts).
  const offerUnits = config.offerUnits.filter(
    (units) =>
      units <= baseVariant.maxCartQuantity && (baseVariant.allowBackorder || baseVariant.stock >= units),
  );
  return { config, base, baseVariant, offerUnits, addOns: await resolveAddOns(base, config.addOnSlugs) };
}

/** The reduction the stored price history announces — the only figure entitled to a strikethrough. */
async function announcedReduction(sku: string) {
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { sku },
    select: { id: true, priceCents: true, compareAtPriceCents: true },
  });
  const history = await prisma.priceHistory.findMany({
    where: { variantId: variant.id },
    select: { priceCents: true, compareAtPriceCents: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return priceReduction(variant, history, new Date());
}

/** The summary as the DOM states it; the discount row exists only when the engine took cents off. */
async function summaryTotals(builder: Locator) {
  const line = (name: string) => builder.locator(`[data-bundle-line='${name}']`);
  const shipping = flat(await line("shipping").textContent());
  const discount = (await line("discount").count()) > 0 ? cents(await line("discount").textContent()) : 0;
  return {
    subtotalCents: cents(await line("subtotal").textContent()),
    discountCents: discount,
    shippingCents: shipping === flat(copy.summary.shippingFree) ? 0 : cents(shipping),
    totalCents: cents(await builder.locator("[data-bundle-total]").textContent()),
  };
}

/** The engine's own rule: total = subtotal − discount + shipping (lib/promo/coupons.ts). */
function expectReconciled(totals: Awaited<ReturnType<typeof summaryTotals>>) {
  expect(totals.subtotalCents - totals.discountCents + totals.shippingCents).toBe(totals.totalCents);
}

async function openBuilder(page: Page, slug: string): Promise<Locator> {
  await page.goto(builderPath(slug));
  await dismissCookieBanner(page);
  const builder = page.locator(`[data-bundle-builder='${slug}']`);
  await expect(builder).toBeVisible();
  return builder;
}

test("the builder opens on the smallest offer with no add-on ticked (an extra payment is the shopper's own tick)", async ({ page }) => {
  const { base, baseVariant, offerUnits, addOns } = await builderFixture();
  expect(offerUnits.length, "the Setting names more than one quantity").toBeGreaterThan(1);
  expect(addOns.length, "the base product's shelf resolved add-ons").toBeGreaterThan(0);

  const builder = await openBuilder(page, base.slug);

  // one card per unit count the Setting names, in the order it stores them
  const offers = builder.locator("[data-bundle-offer]");
  await expect(offers).toHaveCount(offerUnits.length);
  for (const [index, units] of offerUnits.entries()) {
    const card = offers.nth(index);
    await expect(card).toHaveAttribute("data-bundle-offer", String(units));
    // quantity and description only: every figure lives in the fourth card, so
    // a quantity card states no amount at all
    const text = flat(await card.textContent());
    expect(text, String(units)).toContain(flat(copy.offers.units(units)));
    expect(text, String(units)).toContain(flat(copy.offers.subtitle(units)));
    expect(text, String(units)).not.toContain("€");
  }

  // the fourth card prices the selected quantity on its own: the base variant's
  // price × the units it commits to, and what that comes to after the engine
  const offerSummary = builder.locator("[data-bundle-offer-summary]");
  await expect(offerSummary).toBeVisible();
  const offerSummaryText = flat(await offerSummary.textContent());
  expect(offerSummaryText).toContain(flat(copy.offerSummary.title));
  expect(offerSummaryText).toContain(flat(copy.offers.units(offerUnits[0])));
  expect(offerSummaryText).toContain(
    flat(formatUnitPrice(baseVariant.priceCents * offerUnits[0], offerUnits[0], cartCopy.line.perUnit)),
  );

  // the smallest offer is preselected, and it is the only one
  await expect(builder.locator("[data-bundle-offer-selected='true']")).toHaveCount(1);
  await expect(offers.first()).toHaveAttribute("data-bundle-offer-selected", "true");
  await expect(offers.first().getByRole("radio")).toBeChecked();

  // every add-on the shelf resolved is offered, none of them ticked: an add-on
  // is an extra payment, so it needs the shopper's own tick (CRD Art. 22,
  // QA 2026-10-03 T2-01), and the counter says none is chosen
  await expect(builder.locator("[data-bundle-addon]")).toHaveCount(addOns.length);
  for (const addOn of addOns) {
    const card = builder.locator(`[data-bundle-addon='${addOn.slug}']`);
    await expect(card, addOn.slug).not.toHaveAttribute("data-bundle-addon-selected", "true");
    await expect(
      card.getByRole("checkbox", { name: copy.addOns.toggleLabel(addOn.title) }),
      addOn.slug,
    ).not.toBeChecked();
  }
  expect(flat(await builder.locator("[data-bundle-count]").textContent())).toBe(
    flat(copy.addOns.selected(0)),
  );
  // the recap names the offer's units alone
  await expect(builder).toContainText(copy.summary.contents(offerUnits[0], 0));

  // §8.23: the only strikethrough is a history-backed prior price, and it never
  // appears without the 30-day line that explains it
  await expect(builder.locator("span.line-through")).toHaveCount(
    await builder.locator("[data-omnibus-line]").count(),
  );
  for (const addOn of addOns) {
    const card = builder.locator(`[data-bundle-addon='${addOn.slug}']`);
    const reduction = await announcedReduction(addOn.sku);
    if (reduction) {
      expect(flat(await card.locator("span.line-through").textContent()), addOn.slug).toBe(
        flat(formatEUR(reduction.priorPriceCents)),
      );
      expect(flat(await card.locator("[data-percent-off]").textContent()), addOn.slug).toBe(
        flat(catalog.card.percentOff(reduction.percentOff)),
      );
      expect(flat(await card.locator("[data-omnibus-line]").textContent()), addOn.slug).toContain(
        flat(formatEUR(reduction.priorPriceCents)),
      );
    } else {
      await expect(card.locator("span.line-through"), addOn.slug).toHaveCount(0);
      await expect(card.locator("[data-percent-off]"), addOn.slug).toHaveCount(0);
    }
  }
});

test("the monthly-delivery row says it is not available yet and asks for nothing, so it confirms nothing (§8.23, QA 2026-10-03 T1-02)", async ({ page }) => {
  const { config, base } = await builderFixture();
  const builder = await openBuilder(page, base.slug);
  const row = builder.locator("[data-bundle-subscription]");
  if (!config.subscriptionRow) {
    await expect(row).toHaveCount(0);
    return;
  }
  await expect(row).toContainText(copy.subscription.title);
  await expect(row).toContainText(copy.subscription.soon);
  await expect(row).toContainText(copy.subscription.note);
  // no control: nothing to tick, no address asked for, and a click changes nothing
  await expect(row.locator("input, button, select, textarea, a")).toHaveCount(0);
  const before = flat(await row.textContent());
  await row.click();
  expect(flat(await row.textContent())).toBe(before);
  expect(before).not.toMatch(/hvala/i);
});

test("an add-on moves the counter and the totals it is priced into", async ({ page }) => {
  const { base, baseVariant, offerUnits, addOns } = await builderFixture();
  expect(addOns.length, "the base product's shelf resolved add-ons").toBeGreaterThan(0);

  const builder = await openBuilder(page, base.slug);

  const offerOnly = await summaryTotals(builder);
  expectReconciled(offerOnly);
  // nothing ticked: the goods are the offer's units alone
  expect(offerOnly.subtotalCents).toBe(baseVariant.priceCents * offerUnits[0]);

  // the control is an sr-only peer input, so the card's own label is the target
  const added = addOns[addOns.length - 1];
  const card = builder.locator(`[data-bundle-addon='${added.slug}']`);
  await card.click();
  await expect(card).toHaveAttribute("data-bundle-addon-selected", "true");
  await expect(
    card.getByRole("checkbox", { name: copy.addOns.toggleLabel(added.title) }),
  ).toBeChecked();
  await expect(builder.locator("[data-bundle-addon-selected='true']")).toHaveCount(1);
  expect(flat(await builder.locator("[data-bundle-count]").textContent())).toBe(
    flat(copy.addOns.selected(1)),
  );

  const more = await summaryTotals(builder);
  expectReconciled(more);
  expect(more.subtotalCents).toBe(offerOnly.subtotalCents + added.priceCents);
  expect(more.totalCents).not.toBe(offerOnly.totalCents);
  await expect(builder).toContainText(copy.summary.contents(offerUnits[0], 1));

  // and back: the same gesture clears the selection and restores the figures
  await card.click();
  await expect(card).not.toHaveAttribute("data-bundle-addon-selected", "true");
  expect(await summaryTotals(builder)).toEqual(offerOnly);
});

test("the code the builder applies is named with its terms sentence (§9.1, QA C2-F14)", async ({ page }) => {
  const { config, base } = await builderFixture();
  test.skip(!config.couponCode, "the Setting names no code to apply");
  const coupon = await prisma.coupon.findUniqueOrThrow({
    where: { code: config.couponCode.trim().toUpperCase() },
    select: { type: true },
  });

  const builder = await openBuilder(page, base.slug);
  const totals = await summaryTotals(builder);
  expect(totals.discountCents, "the quote priced the configured code").toBeGreaterThan(0);
  await expect(builder).toContainText(copy.summary.discountCode(config.couponCode));
  // BXGY is priced as a percentage until P2 (lib/promo/resolve.ts)
  const type = coupon.type === "BXGY" ? "PERCENT" : coupon.type;
  await expect(builder.locator("[data-bundle-code-terms]")).toHaveText(promo.termsFor(type));
  // the page names no product category it cannot claim for every product (QA C2-F19)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
});

test("a larger offer re-prices the whole bundle", async ({ page }) => {
  const { base, baseVariant, offerUnits } = await builderFixture();
  expect(offerUnits.length, "the Setting names more than one quantity").toBeGreaterThan(1);

  const builder = await openBuilder(page, base.slug);
  const smallest = await summaryTotals(builder);

  const largest = offerUnits[offerUnits.length - 1];
  const card = builder.locator(`[data-bundle-offer='${largest}']`);
  await card.click();
  await expect(card).toHaveAttribute("data-bundle-offer-selected", "true");
  await expect(builder.locator("[data-bundle-offer-selected='true']")).toHaveCount(1);

  const bigger = await summaryTotals(builder);
  expectReconciled(bigger);
  // only the base line moved: the extra units at the variant's own price
  expect(bigger.subtotalCents).toBe(
    smallest.subtotalCents + baseVariant.priceCents * (largest - offerUnits[0]),
  );
  expect(bigger.totalCents).toBeGreaterThan(smallest.totalCents);
  await expect(builder).toContainText(copy.summary.contents(largest, 0));
});

test("with no add-ons the two summaries state the same amount, and add-ons only move the lower one", async ({
  page,
}) => {
  const { base, addOns } = await builderFixture();
  const builder = await openBuilder(page, base.slug);

  const offerTotal = () => builder.locator("[data-bundle-offer-total]").textContent();
  const bundleTotal = () => builder.locator("[data-bundle-total]").textContent();

  // the upper card always prices the main-product offer alone, so with no
  // add-on ticked (the opening state) the closing summary lands on the same figure
  await expect(builder.locator("[data-bundle-addon-selected='true']")).toHaveCount(0);
  expect(flat(await bundleTotal())).toBe(flat(await offerTotal()));

  // ticking one moves the closing summary and leaves the offer card alone:
  // the upper card describes the offer, the lower one the whole selection
  const beforeOffer = flat(await offerTotal());
  const beforeBundle = flat(await bundleTotal());
  await builder.locator(`[data-bundle-addon='${addOns[0].slug}']`).click();
  await expect(builder.locator("[data-bundle-addon-selected='true']")).toHaveCount(1);
  expect(flat(await offerTotal()), "the offer card is unmoved by an add-on").toBe(beforeOffer);
  expect(flat(await bundleTotal())).not.toBe(beforeBundle);

  // and the closing summary still reconciles with its own rows
  expectReconciled(await summaryTotals(builder));
});

test("the submit hands the cart exactly the selection, at the figure the page showed", async ({ page }) => {
  const { config, base, baseVariant, offerUnits, addOns } = await builderFixture();

  const builder = await openBuilder(page, base.slug);
  const units = offerUnits[offerUnits.length - 1];
  const offer = builder.locator(`[data-bundle-offer='${units}']`);
  await offer.click();
  await expect(offer).toHaveAttribute("data-bundle-offer-selected", "true");
  // the shopper ticks every add-on themselves (none starts ticked)
  for (const addOn of addOns) {
    const card = builder.locator(`[data-bundle-addon='${addOn.slug}']`);
    await card.click();
    await expect(card, addOn.slug).toHaveAttribute("data-bundle-addon-selected", "true");
  }
  const quoted = await summaryTotals(builder);

  // the summary's submit; the purchase bar carries the same label, so the hook
  // picks the one this viewport shows
  await builder.locator("[data-bundle-submit]").click();
  await page.waitForURL(/\/cart$/);

  // one line per thing that was ticked, at the quantities the offer committed to
  await expect(page.locator("[data-cart-line]")).toHaveCount(addOns.length + 1);
  await expect(page.locator(`[data-cart-line='${baseVariant.sku}'] [aria-live='polite']`)).toHaveText(
    String(units),
  );
  for (const addOn of addOns) {
    await expect(
      page.locator(`[data-cart-line='${addOn.sku}'] [aria-live='polite']`),
      addOn.slug,
    ).toHaveText("1");
  }
  await expect(page.getByText(`${cartCopy.title} (${units + addOns.length})`)).toBeVisible();

  // the cart charges the total the builder quoted one click earlier
  expect(cents(await page.locator("[data-cart-total]").textContent())).toBe(quoted.totalCents);

  // the discount is an ordinary coupon the promo engine evaluated: when the
  // Setting names one, the quote priced it and the cart carries it by name
  if (config.couponCode) {
    expect(quoted.discountCents, "the quote priced the configured code").toBeGreaterThan(0);
    await expect(page.locator("[data-active-code]")).toHaveText(config.couponCode);
  }
});

test("at 390px the four cards stay a 2×2 grid, the add-ons are compact rows and the bar follows the button", async ({
  page,
}) => {
  const { base, offerUnits, addOns } = await builderFixture();
  await page.setViewportSize({ width: 390, height: 844 });
  const builder = await openBuilder(page, base.slug);

  // the photo comes first, then the cards that price it
  const photo = (await builder.locator("[data-bundle-photo]").boundingBox())!;
  const summaryCard = (await builder.locator("[data-bundle-offer-summary]").boundingBox())!;
  expect(photo.y, "the photo leads on a phone").toBeLessThan(summaryCard.y);

  // four cards, two to a row, none of them wider than the viewport
  const cards: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let index = 0; index < offerUnits.length; index += 1) {
    cards.push((await builder.locator("[data-bundle-offer]").nth(index).boundingBox())!);
  }
  cards.push(summaryCard);
  for (const [index, card] of cards.entries()) {
    expect(card.x + card.width, `card ${index} stays in the viewport`).toBeLessThanOrEqual(390);
  }
  const rows = [...new Set(cards.map((card) => Math.round(card.y)))];
  expect(rows.length, "two rows").toBe(2);
  for (const y of rows) {
    expect(cards.filter((card) => Math.round(card.y) === y).length, `row at ${y}`).toBe(2);
  }

  // the add-ons are rows, not the tiles the desktop grid shows: the image sits
  // beside the title rather than above it
  for (const addOn of addOns) {
    const card = builder.locator(`[data-bundle-addon='${addOn.slug}']`);
    const box = (await card.boundingBox())!;
    expect(box.width, addOn.slug).toBeGreaterThan(box.height);
    const image = card.locator("img").first();
    if ((await image.count()) === 0) continue;
    const thumbnail = (await image.boundingBox())!;
    const title = (await card.getByText(addOn.title, { exact: true }).boundingBox())!;
    expect(thumbnail.x + thumbnail.width, addOn.slug).toBeLessThanOrEqual(title.x);
    expect(title.y, addOn.slug).toBeLessThan(thumbnail.y + thumbnail.height);
  }

  // the bar carries the closing button while it is off screen, and states the
  // same total the summary does
  const sticky = builder.locator("[data-bundle-sticky]");
  await expect(sticky).toBeVisible();
  const bar = (await sticky.boundingBox())!;
  expect(Math.abs(bar.y + bar.height - 844)).toBeLessThanOrEqual(1);
  await expect(sticky.locator("[data-bundle-submit-sticky]")).toBeVisible();
  expect(flat(await sticky.textContent())).toContain(
    flat(await builder.locator("[data-bundle-total]").textContent()),
  );

  // once the closing button itself is on screen the bar steps aside: one CTA at a time
  await builder.locator("[data-bundle-submit]").scrollIntoViewIfNeeded();
  await expect(sticky).toBeHidden();
  await expect(builder.locator("[data-bundle-submit]")).toBeVisible();

  // narrower than the grid can carry: the cards stack one to a row
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(builder.locator("[data-bundle-offer]").first()).toBeVisible();
  const stacked: number[] = [];
  for (let index = 0; index < offerUnits.length; index += 1) {
    stacked.push((await builder.locator("[data-bundle-offer]").nth(index).boundingBox())!.x);
  }
  for (const x of stacked) expect(x).toBeCloseTo(stacked[0], 0);

  // it is a phone bar only: the wide layout submits from the summary
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(sticky).toBeHidden();
  await expect(builder.locator("[data-bundle-submit]")).toBeVisible();
});

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCartLines } from "@/lib/cart/server";
import { hydrateCartLines } from "@/lib/cart/hydrate";
import { type PromoSettings } from "@/lib/promo";
import { priceCartForDisplay } from "@/lib/promo/cart-pricing";
import { getCatalogProducts } from "@/lib/catalog";
import { getPriceReductions } from "@/lib/omnibus";
import { getShippingSettings, getVatRatePercent } from "@/lib/settings";
import { formatDdvLine, formatEUR, klarnaInstallmentCents } from "@/lib/pricing";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { kodaCodeSchema } from "@/lib/koda-code";
import { cart, promo } from "@/lib/copy";
import { CartLineControls } from "@/components/storefront/cart/CartLineControls";
import { BeginCheckoutButton } from "@/components/storefront/cart/BeginCheckoutButton";
import { ActiveCodePill } from "@/components/storefront/cart/ActiveCodePill";
import { KodaNotice, type KodaRefusal } from "@/components/storefront/cart/KodaNotice";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { PAYMENT_METHODS, PaymentIcons } from "@/components/storefront/ui/PaymentIcons";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: cart.title,
  path: "/cart",
  noindex: true,
});

/** /cart page (§7.1) — server-rendered, totals from the promo core only. */
export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ koda?: string; vnos?: string }>;
}) {
  const { koda: kodaError, vnos } = await searchParams;
  const session = await auth();
  const lines = await getCartLines(session?.user?.id ?? null);
  const hydrated = await hydrateCartLines(lines);

  const [shipping, vatRatePercent] = await Promise.all([getShippingSettings(), getVatRatePercent()]);
  const settings: PromoSettings = {
    vatRatePercent,
    freeShippingThresholdCents: shipping.freeThresholdCents,
    shippingCostCents: shipping.standardCostCents,
  };

  // A line that sold out while it sat in the cart keeps its quantity, is flagged
  // and closes the checkout until it is removed (QA 2026-09-30). It stays listed
  // with its own line price, but the subtotal, the free-shipping bar, the code
  // and the total count only what can still be bought.
  const hasSoldOutLine = hydrated.some((line) => line.soldOut);
  const email = session?.user?.email ?? "";
  const listing = await priceCartForDisplay(hydrated, settings, email);
  const payable = hasSoldOutLine
    ? await priceCartForDisplay(hydrated.filter((line) => !line.soldOut), settings, email)
    : listing;
  const { priced, rejection: couponRejection, code: activeCode, couponType } = payable;
  const listedLines = listing.priced.lines;
  const listedCount = listing.priced.itemCount;

  // /koda/{CODE} refusal: names the code tried and, with another code active,
  // says that one stays (QA C2-F2). Only a code-shaped value is echoed. The
  // notice is rendered at the same place with or without a refusal, so it
  // keeps what it showed once it has taken the parameters off the address.
  const triedCode = vnos ? kodaCodeSchema.safeParse(vnos) : null;
  const kodaRefusal: KodaRefusal | null = kodaError === "neveljavna"
    ? { code: triedCode?.success ? triedCode.data : null }
    : null;
  const appliedCoupon =
    "appliedCoupon" in priced ? priced.appliedCoupon : null;
  // Data-driven curation (§6.10/§7.1): union of in-cart products' crossSell
  // metafields minus in-cart; fallback to catalog order when empty.
  const inCartSlugs = new Set(hydrated.map((line) => line.productSlug));
  const curatedSlugs = new Set<string>();
  for (const line of hydrated) {
    for (const slug of line.crossSellSlugs) {
      if (!inCartSlugs.has(slug)) curatedSlugs.add(slug);
    }
  }
  const catalogProducts = await getCatalogProducts();
  const curated = [...curatedSlugs]
    .map((slug) => catalogProducts.find((product) => product.slug === slug))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));
  // Only what the shopper can add now: a sold-out product is no suggestion (QA C2-F6).
  const buyable = (product: (typeof catalogProducts)[number]) => !product.soldOut && !inCartSlugs.has(product.slug);
  const curatedBuyable = curated.filter(buyable);
  const crossSell =
    curatedBuyable.length > 0
      ? curatedBuyable
      : catalogProducts.filter(buyable);

  // Struck-through figures for the lines the hydration already gated as reduced
  // (`line.reduced`, the same Omnibus query): the display can never announce a
  // reduction the coupon terms did not exclude, and a cart without a reduced
  // line asks the history for nothing.
  const reductions = await getPriceReductions(hydrated.filter((line) => line.reduced));

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  const remainingEuros = Math.ceil(priced.freeShipping.remainingCents / 100);
  const klarnaEnabled = env.STRIPE_KLARNA_ENABLED === "true";
  const paymentMethods = PAYMENT_METHODS.filter((name) => name !== "Klarna" || klarnaEnabled).join(", ");

  // Free-shipping bar (§7.1): empty → in progress → reached. The empty state
  // (5 % floor) shows on the empty cart too (QA C2-F3).
  const shippingProgress = (
    <div className="mt-8" data-shipping-progress>
      <p id="shipping-progress-label" className="text-sm text-dark-1" role="status">
        {priced.freeShipping.reached
          ? cart.progress.reached
          : priced.itemCount === 0 || priced.subtotalCents - ("discountCents" in priced ? priced.discountCents : 0) === 0
            ? cart.progress.empty.replace(
                "45 €",
                formatEUR(settings.freeShippingThresholdCents),
              )
            : cart.progress.inProgress.replace("€X", `€${remainingEuros}`)}
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-btn bg-light-2"
        role="progressbar"
        aria-labelledby="shipping-progress-label"
        aria-valuenow={priced.freeShipping.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* the fill grows from the left on load (scaleX keyframe, compositor only) */}
        <div
          className="h-full origin-left animate-bar rounded-btn bg-brand transition-all duration-500"
          style={{ width: `${priced.freeShipping.progressPercent}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-(--container-wide) px-(--padding) py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[2rem]">
          {cart.title} ({listedCount})
        </h1>
        {listedCount > 0 ? (
          <p className="text-xl text-brand" data-cart-total>
            {formatEUR(priced.totalCents)}
          </p>
        ) : null}
      </div>

      {listedCount === 0 ? (
        /* Empty-cart state + best-sellers rail */
        <div>
          {shippingProgress}
          <KodaNotice refusal={kodaRefusal} activeCode={activeCode} />
          <div className="mt-12 max-w-md">
            <h2 className="text-xl">{cart.empty.title}</h2>
            <p className="mt-2 text-sm text-mid-1">{cart.empty.body}</p>
            <div className="mt-6">
              <UiButton href="/trgovina" variant="primary">
                {cart.empty.cta}
              </UiButton>
            </div>
          </div>
          {crossSell.length > 0 ? (
            <section className="mt-16">
              <h2 className="text-2xl md:text-[2rem]">{cart.crossSell}</h2>
              <ul className="mt-8 grid grid-cols-2 gap-x-2 gap-y-8 md:grid-cols-4 md:gap-x-5">
                {crossSell.slice(0, 4).map((product) => (
                  <li key={product.slug}>
                    <CatalogCard product={product} testToken={testToken} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : (
        <>
          {/* Free-shipping progress bar */}
          {shippingProgress}

          {/* Klarna row */}
          {klarnaEnabled ? <p className="mt-4 hidden text-sm text-mid-1 md:block">
            {cart.klarna} {formatEUR(klarnaInstallmentCents(priced.totalCents))}{" "}
            {cart.klarnaSuffix}
          </p> : null}

          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
            {/* Line items */}
            <ul className="flex flex-col gap-4">
              {listedLines.map((line) => {
                const hydratedLine = hydrated.find(
                  (h) => h.variantId === line.variantId,
                )!;
                const reduction = reductions.get(line.variantId) ?? null;
                return (
                  <li
                    key={line.variantId}
                    className="flex gap-4 rounded-card border border-light-2 bg-white p-4"
                    data-cart-line={line.sku}
                  >
                    <Link
                      href={`/izdelek/${hydratedLine.productSlug}`}
                      className="h-24 w-24 shrink-0 overflow-hidden rounded-card bg-light-3"
                    >
                      {hydratedLine.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hydratedLine.imageUrl}
                          alt={hydratedLine.imageAlt}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link
                            href={`/izdelek/${hydratedLine.productSlug}`}
                            className="text-sm font-medium text-dark-1"
                          >
                            {line.title}
                          </Link>
                          <p className="text-xs text-mid-2">{line.sku}</p>
                        </div>
                        <p className="text-sm text-dark-1" data-line-total>
                          {formatEUR(line.lineTotalCents)}
                        </p>
                      </div>
                      {/* per-unit figures stay together (struck prior price next to the unit
                          price, never next to the line total) */}
                      {reduction || line.quantity > 1 ? (
                        <p className="mt-1 text-xs text-mid-1" data-unit-price>
                          {reduction ? (
                            <span className="mr-1 text-mid-2 line-through">
                              {formatEUR(reduction.priorPriceCents)}
                            </span>
                          ) : null}
                          {formatEUR(line.unitPriceCents)} {cart.line.perUnit}
                        </p>
                      ) : null}
                      {reduction ? (
                        <p className="mt-0.5 text-xs text-mid-2" data-omnibus-line>
                          {cart.line.omnibusPrefix}: {formatEUR(reduction.priorPriceCents)}
                        </p>
                      ) : null}
                      {hydratedLine.soldOut ? (
                        <p className="mt-2 text-xs text-error" data-line-sold-out>
                          {cart.line.soldOut}
                        </p>
                      ) : null}
                      {line.bundleComponents.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-mid-1">
                            {cart.line.bundleContents}:
                          </p>
                          <ul className="mt-1 text-xs text-mid-2">
                            {line.bundleComponents.map((component) => (
                              <li key={component.title}>
                                {component.quantity}× {component.title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <CartLineControls
                          variantId={line.variantId}
                          quantity={line.quantity}
                          maxQuantity={hydratedLine.quantityCap}
                          stockLimited={hydratedLine.quantityCap < hydratedLine.maxCartQuantity}
                          soldOut={hydratedLine.soldOut}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Summary + checkout block */}
            <aside className="flex flex-col gap-4">
              <div className="rounded-card border border-light-2 bg-white p-5">
                <KodaNotice refusal={kodaRefusal} activeCode={activeCode} />
                {activeCode ? <ActiveCodePill code={activeCode} rejected={Boolean(couponRejection)} couponType={couponType} /> : null}
                {couponRejection ? (
                  <p role="alert" className="mt-2 text-xs text-error" data-coupon-error>
                    {promo.errors[couponRejection]}
                  </p>
                ) : null}
                <dl className="mt-2 flex flex-col gap-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-mid-1">{cart.summary.subtotal}</dt>
                    <dd className="text-dark-1">
                      {formatEUR(priced.subtotalCents)}
                    </dd>
                  </div>
                  {appliedCoupon && appliedCoupon.discountCents > 0 ? (
                    <div className="flex justify-between text-success" data-discount-line>
                      <dt>
                        {promo.discountLabel} ({appliedCoupon.code})
                      </dt>
                      <dd>−{formatEUR(appliedCoupon.discountCents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt className="text-mid-1">{cart.summary.shipping}</dt>
                    <dd className="text-dark-1" data-summary-shipping>
                      {/* every line sold out: nothing is shipped, so nothing is free either (QA 2026-09-30) */}
                      {priced.itemCount === 0
                        ? cart.summary.shippingNone
                        : priced.shippingCents === 0
                          ? cart.summary.shippingFree
                          : formatEUR(priced.shippingCents)}
                    </dd>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-light-3 pt-3 text-base font-medium">
                    <dt className="text-dark-1">{cart.summary.total}</dt>
                    <dd className="text-dark-1">
                      {formatEUR(priced.totalCents)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-1 text-xs text-mid-2">
                  {formatDdvLine(priced.totalCents, settings.vatRatePercent)}
                </p>
                {hasSoldOutLine ? (
                  <p id="cart-sold-out" role="alert" className="mt-4 text-xs text-error" data-cart-sold-out>
                    {cart.checkout.soldOutBlocked}
                  </p>
                ) : null}
                <div className="mt-4">
                  <BeginCheckoutButton
                    blockedBy={hasSoldOutLine ? "cart-sold-out" : null}
                    items={priced.lines.map((line) => ({
                      sku: line.sku,
                      title: line.title,
                      priceCents: line.unitPriceCents,
                      quantity: line.quantity,
                    }))}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-mid-2">
                  {cart.checkout.note}
                </p>
              </div>
              <PaymentIcons label={cart.checkout.paymentMethods(paymentMethods)} klarnaEnabled={klarnaEnabled} />
            </aside>
          </div>

          {/* Cross-sell shelf */}
          {crossSell.length > 0 ? (
            <section className="mt-16">
              <h2 className="text-2xl md:text-[2rem]">{cart.crossSell}</h2>
              <ul className="mt-8 grid grid-cols-2 gap-x-2 gap-y-8 md:grid-cols-4 md:gap-x-5">
                {crossSell.slice(0, 4).map((product) => (
                  <li key={product.slug}>
                    <CatalogCard product={product} testToken={testToken} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

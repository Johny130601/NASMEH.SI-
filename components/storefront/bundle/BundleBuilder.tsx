"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addBundleToCartAction } from "@/app/(storefront)/actions/cart";
import type { BundleBuilderView } from "@/lib/bundle/load";
import { quoteKey } from "@/lib/bundle/quote";
import { formatDdvLine, formatEUR, formatUnitPrice } from "@/lib/pricing";
import { bundle as copy } from "@/lib/copy/bundle";
import { cart } from "@/lib/copy/cart";
import { catalog } from "@/lib/copy/catalog";
import { promo } from "@/lib/copy/promo";
import { UiIcon } from "../ui/UiIcon";
import { UiPill } from "../ui/UiPill";
import { UiButton } from "../ui/UiButton";

/**
 * Bundle builder (§7.1) — the step a product page hands off to.
 *
 * ONE selection state drives both summaries. The island owns the selection
 * only: every price, saving, delivery cost and total it renders is looked up
 * in the quote table the server priced with the promo engine for that exact
 * combination (AGENTS §5.2/§8.3), so each discount is applied once, by the
 * engine, and the figure on this page is the figure the cart charges one
 * click later. Nothing reaches the basket until the closing button; the
 * submit then sends variant ids and a unit count — never a price, never a
 * code.
 *
 * The upper card always prices the main-product offer on its own (the mask-0
 * entry); the closing summary prices the whole selection. With no add-ons
 * ticked they are the same entry, so the two agree by construction rather
 * than by arithmetic repeated in two places.
 */
export function BundleBuilder({ view }: { view: BundleBuilderView }) {
  const router = useRouter();
  const [offerIndex, setOfferIndex] = useState(view.defaultOfferIndex);
  const [mask, setMask] = useState(view.defaultMask);
  const [interest, setInterest] = useState(false);
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [notice, setNotice] = useState<{ kind: "capped" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const offer = view.offers[offerIndex] ?? view.offers[0];
  /** The whole selection. */
  const quote = view.table[quoteKey(offerIndex, mask)] ?? view.table[quoteKey(0, 0)];
  /** The main-product offer on its own — what the upper card describes. */
  const offerQuote = view.table[quoteKey(offerIndex, 0)] ?? quote;

  const selectedAddOns = useMemo(
    () => view.addOns.filter((_, index) => (mask & (1 << index)) !== 0),
    [mask, view.addOns],
  );

  // The closing button is the only way to the cart, so a compact bar carries
  // it while it is scrolled out of view on a phone. It mounts absent and
  // appears on scroll — nothing in the first viewport moves on load (§8.23).
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaOffScreen, setCtaOffScreen] = useState(false);
  useEffect(() => {
    const element = ctaRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setCtaOffScreen(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toggleAddOn = (index: number) => {
    setMask((current) => current ^ (1 << index));
    setNotice(null);
  };

  const submit = () => {
    setState("busy");
    setNotice(null);
    startTransition(async () => {
      let done = false;
      try {
        const result = await addBundleToCartAction({
          baseVariantId: view.base.variantId,
          units: offer.units,
          addOnVariantIds: selectedAddOns.map((addOn) => addOn.variantId),
        });
        if (result.ok) {
          done = true;
          // The cart is the confirmation: it re-prices the whole basket and
          // names the code, so nothing has to be restated here.
          router.push("/cart");
          router.refresh();
        } else {
          setNotice({
            kind: result.capped ? "capped" : "error",
            text: result.capped ? copy.notices.capped : copy.notices.failed,
          });
        }
      } catch {
        // A throwing action must never leave the button spinning for good.
        setNotice({ kind: "error", text: copy.notices.failed });
      } finally {
        if (!done) setState("idle");
      }
    });
  };

  // The variant line only earns its place when it says something the product
  // name does not; a single-variant product seeds the two to the same string.
  const variantLine =
    view.base.variantTitle && view.base.variantTitle !== view.base.title
      ? view.base.variantTitle
      : copy.product.variantLabel(view.base.sku);

  return (
    <div data-bundle-builder={view.base.productSlug}>
      <header>
        <h1 className="text-[2rem] font-semibold tracking-tight text-dark-1 md:text-[2.75rem]">
          {copy.title}
        </h1>
        <p className="mt-2 text-lg text-mid-1 md:text-[1.375rem]">{copy.subtitle}</p>
      </header>

      {/* ---------- the product, and the four cards that price it ---------- */}
      <section className="mt-8 grid gap-5 md:grid-cols-[45fr_55fr]">
        <div>
          {/* The largest element in the first viewport: it is the LCP image,
              so it is eager and high priority (AGENTS §8.20). object-contain
              keeps a packshot whole on the tinted tile. */}
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-panel bg-brand/8 p-6 md:p-10">
            {view.base.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.base.imageUrl}
                alt={view.base.imageAlt}
                fetchPriority="high"
                className="h-full w-full object-contain"
                data-bundle-photo
              />
            ) : null}
          </div>
          <h2 className="mt-4 text-lg font-semibold text-dark-1">{view.base.title}</h2>
          <p className="mt-0.5 text-sm text-mid-1" data-bundle-variant>
            {variantLine}
          </p>
        </div>

        <fieldset
          className="grid grid-cols-2 gap-5 max-[370px]:grid-cols-1"
          disabled={state === "busy"}
        >
          <legend className="sr-only">{copy.offers.legend}</legend>

          {view.offers.map((item) => {
            const selected = item.index === offerIndex;
            return (
              <label
                key={item.units}
                className="relative min-w-0 cursor-pointer"
                data-bundle-offer={item.units}
                data-bundle-offer-selected={selected ? "true" : undefined}
              >
                <input
                  type="radio"
                  name="bundle-offer"
                  className="peer sr-only"
                  checked={selected}
                  onChange={() => {
                    setOfferIndex(item.index);
                    setNotice(null);
                  }}
                />
                <span
                  // justify-center: the summary card makes its grid row tall,
                  // so a quantity card that stretches beside it reads as
                  // composed rather than as an empty box with a label on top.
                  className={`flex h-full min-w-0 flex-col justify-center rounded-panel border bg-white p-5 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${
                    selected ? "border-brand bg-brand/5" : "border-light-2 hover:border-mid-3"
                  }`}
                >
                  {view.badgeOfferIndex === item.index ? (
                    <span className="absolute -top-2 right-3">
                      <UiPill variant="brand">{copy.offers.badge}</UiPill>
                    </span>
                  ) : null}

                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? "border-brand" : "border-light-1"
                      }`}
                    >
                      {selected ? <span className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
                    </span>
                    <span className="text-lg font-semibold text-dark-1">
                      {copy.offers.units(item.units)}
                    </span>
                  </span>
                  <span className="mt-1 block pl-8 text-sm text-mid-1">
                    {copy.offers.subtitle(item.units)}
                  </span>
                  {item.redundant ? (
                    <span className="mt-3 pl-8">
                      <UiPill variant="grey">{copy.offers.redundant}</UiPill>
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}

          {/* The fourth card — every figure for the chosen quantity, and the
              only place in this grid that states one. Not a control. */}
          <div
            className="flex min-w-0 flex-col rounded-panel border border-brand/30 bg-brand/8 p-5"
            data-bundle-offer-summary
          >
            <p className="text-sm font-semibold text-dark-1">{copy.offerSummary.title}</p>
            <p className="mt-1 text-sm text-mid-1">
              {copy.offerSummary.quantity}: {copy.offers.units(offerQuote.units)}
            </p>

            <dl className="mt-3 space-y-1 text-sm">
              {offerQuote.discountCents > 0 ? (
                <SummaryRow
                  label={copy.offerSummary.saving}
                  value={`−${formatEUR(offerQuote.discountCents)}`}
                  tone="success"
                  hook="data-bundle-offer-line"
                  name="saving"
                />
              ) : null}
              <SummaryRow
                label={copy.summary.shipping}
                value={
                  offerQuote.freeShipping
                    ? copy.summary.shippingFree
                    : formatEUR(offerQuote.shippingCents)
                }
                hook="data-bundle-offer-line"
                name="shipping"
              />
            </dl>

            <p className="mt-4 text-xs uppercase tracking-wide text-mid-1">
              {copy.offerSummary.pay}
            </p>
            <p
              aria-live="polite"
              aria-label={copy.offerSummary.liveLabel}
              className="text-[2rem] font-semibold leading-none text-brand"
              data-bundle-offer-total
            >
              {formatEUR(offerQuote.totalCents)}
            </p>
            <p className="mt-2 text-xs text-mid-2">
              {formatUnitPrice(offer.priceCents, offer.units, cart.line.perUnit)}
            </p>
          </div>
        </fieldset>
      </section>

      {/* ---------------- monthly delivery — interest only ---------------- */}
      {view.subscriptionRow ? (
        <section className="mt-5">
          <label className="flex cursor-pointer items-center gap-4 rounded-panel border border-light-2 bg-white px-6 py-4">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={interest}
              onChange={() => setInterest((value) => !value)}
              data-bundle-subscription
            />
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-input border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${
                interest ? "border-brand bg-brand text-white" : "border-light-1"
              }`}
            >
              {interest ? <UiIcon name="check" className="h-3.5 w-3.5" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-medium text-dark-1">{copy.subscription.title}</span>
                <UiPill variant="grey">{copy.subscription.soon}</UiPill>
              </span>
              <span className="mt-0.5 block text-sm text-mid-1">
                {interest ? copy.subscription.acknowledged : copy.subscription.interest}
              </span>
            </span>
          </label>
        </section>
      ) : null}

      {/* ---------------- the optional add-ons ---------------- */}
      {view.addOns.length > 0 ? (
        <section className="mt-12" aria-labelledby="bundle-addons-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="bundle-addons-title" className="text-2xl font-semibold text-dark-1">
                {copy.addOns.title}
              </h2>
              <p className="mt-1 text-mid-1">{copy.addOns.subtitle}</p>
            </div>
            <p className="text-sm text-mid-1" data-bundle-count>
              {copy.addOns.selected(selectedAddOns.length)}
            </p>
          </div>

          <div
            className={`mt-5 grid gap-5 ${
              view.addOns.length === 1
                ? "md:grid-cols-1"
                : view.addOns.length === 2
                  ? "md:grid-cols-2"
                  : "md:grid-cols-3"
            }`}
          >
            {view.addOns.map((addOn, index) => {
              const selected = (mask & (1 << index)) !== 0;
              return (
                <label
                  key={addOn.variantId}
                  className="min-w-0 cursor-pointer"
                  data-bundle-addon={addOn.productSlug}
                  data-bundle-addon-selected={selected ? "true" : undefined}
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={selected}
                    disabled={state === "busy"}
                    onChange={() => toggleAddOn(index)}
                    aria-label={copy.addOns.toggleLabel(addOn.title)}
                  />
                  <span
                    className={`flex h-full min-w-0 items-center gap-4 rounded-panel border bg-white p-4 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand md:flex-col md:items-stretch md:p-6 ${
                      selected ? "border-brand bg-brand/5" : "border-light-2 hover:border-mid-3"
                    }`}
                  >
                    {/* One image box at every width: a compact thumb in the
                        mobile row, a centred square of a fixed size on desktop
                        so every card's image area is the same height. */}
                    <span className="h-20 w-20 shrink-0 overflow-hidden rounded-card bg-light-3 md:mx-auto md:h-44 md:w-44">
                      <span className="block aspect-square">
                        {addOn.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={addOn.imageUrl}
                            alt={addOn.imageAlt}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                    </span>

                    <span className="min-w-0 flex-1 md:mt-4 md:flex md:flex-col">
                      {/* Two lines on a phone rather than one truncated one:
                          the product name is what the row is for. */}
                      <span className="line-clamp-2 block font-semibold text-dark-1 md:line-clamp-none">
                        {addOn.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-baseline gap-2">
                        <span className="text-base font-semibold text-dark-1">
                          {formatEUR(addOn.priceCents)}
                        </span>
                        {addOn.reduction ? (
                          <>
                            {/* The only strikethrough on the page: a history-backed Art. 6a prior price. */}
                            <span className="text-sm text-mid-2 line-through">
                              {formatEUR(addOn.reduction.priorPriceCents)}
                            </span>
                            <span className="text-sm font-medium text-sale" data-percent-off>
                              {catalog.card.percentOff(addOn.reduction.percentOff)}
                            </span>
                          </>
                        ) : null}
                        {addOn.existingQuantity > 0 ? (
                          <span className="text-xs text-mid-2">{copy.addOns.inCart}</span>
                        ) : null}
                      </span>
                      {addOn.reduction ? (
                        <span className="mt-1 block text-xs text-mid-2" data-omnibus-line>
                          {cart.line.omnibusPrefix}: {formatEUR(addOn.reduction.priorPriceCents)}
                        </span>
                      ) : null}

                      <span
                        className={`mt-4 flex items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-sm font-medium transition-colors md:mt-auto ${
                          selected ? "bg-brand/10 text-brand" : "bg-light-3 text-dark-1"
                        }`}
                      >
                        {selected ? <UiIcon name="check" className="h-4 w-4" /> : null}
                        {selected ? copy.addOns.added : copy.addOns.add}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ---------------- the whole selection, and the way out ---------------- */}
      <section
        className="mt-8 rounded-panel border border-brand/30 bg-brand/5 p-6"
        aria-labelledby="bundle-summary-title"
        data-bundle-summary
      >
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
          <div className="min-w-0">
            <h2 id="bundle-summary-title" className="text-lg font-semibold text-dark-1">
              {copy.summary.title}
            </h2>
            <p className="mt-1 text-sm text-mid-1">
              {copy.summary.contents(quote.units, selectedAddOns.length)}
            </p>

            <ul className="mt-3 space-y-0.5 text-sm text-dark-1">
              <li data-bundle-main-line>
                {copy.summary.mainLine(view.base.title, quote.units)}
              </li>
              {selectedAddOns.length > 0 ? (
                selectedAddOns.map((addOn) => (
                  <li key={addOn.variantId} data-bundle-summary-addon={addOn.productSlug}>
                    {addOn.title}
                  </li>
                ))
              ) : (
                <li className="text-mid-2">{copy.summary.noAddOns}</li>
              )}
            </ul>
            {view.otherLineCount > 0 ? (
              <p className="mt-2 text-xs text-mid-2">
                {copy.summary.otherLines(view.otherLineCount)}
              </p>
            ) : null}

            <dl className="mt-4 max-w-sm space-y-1.5 text-sm">
              <SummaryRow
                label={copy.summary.subtotal}
                value={formatEUR(quote.subtotalCents)}
                hook="data-bundle-line"
                name="subtotal"
              />
              {quote.discountCents > 0 ? (
                <SummaryRow
                  label={copy.summary.totalSaving}
                  value={`−${formatEUR(quote.discountCents)}`}
                  tone="success"
                  hook="data-bundle-line"
                  name="discount"
                />
              ) : null}
              <SummaryRow
                label={copy.summary.shipping}
                value={
                  quote.freeShipping ? copy.summary.shippingFree : formatEUR(quote.shippingCents)
                }
                hook="data-bundle-line"
                name="shipping"
              />
            </dl>
            {quote.discountCents > 0 && view.applyCouponCode ? (
              <>
                <p className="mt-2 text-xs text-mid-2">
                  {copy.summary.discountCode(view.applyCouponCode)}
                </p>
                {/* every code carries its terms sentence, as on the cart (§9.1, QA C2-F14) */}
                <p className="mt-1 text-xs text-mid-2" data-bundle-code-terms>
                  {promo.termsFor(view.applyCouponType)}
                </p>
              </>
            ) : null}
          </div>

          <div ref={ctaRef} className="md:text-right">
            <p className="text-xs uppercase tracking-wide text-mid-1">{copy.summary.pay}</p>
            <p
              aria-live="polite"
              aria-label={copy.summary.liveLabel}
              className="mt-1 text-[2.5rem] font-semibold leading-none text-brand"
              data-bundle-total
            >
              {formatEUR(quote.totalCents)}
            </p>
            <p className="mt-2 text-xs text-mid-2">
              {formatDdvLine(quote.totalCents, view.vatRatePercent)}
            </p>
            <div className="mt-4">
              <UiButton
                variant="sale"
                fullWidth
                disabled={state === "busy"}
                aria-busy={state === "busy" || undefined}
                onClick={submit}
                data-bundle-submit
              >
                {state === "busy" ? copy.notices.adding : copy.summary.cta}
                {state === "busy" ? null : <UiIcon name="arrow-right" className="h-4 w-4" />}
              </UiButton>
            </div>
            <p className="mt-3 max-w-xs text-xs text-mid-2 md:ml-auto">{copy.summary.vatNote}</p>
          </div>
        </div>

        {notice ? (
          <p
            role={notice.kind === "capped" ? "status" : "alert"}
            className={`mt-4 text-sm ${notice.kind === "capped" ? "text-warning" : "text-error"}`}
            data-bundle-notice={notice.kind}
          >
            {notice.text}
          </p>
        ) : null}
      </section>

      {/* The closing button, carried along on a phone while it is off screen. */}
      {ctaOffScreen ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-light-2 bg-white/95 backdrop-blur md:hidden"
          data-bundle-sticky
        >
          <div className="mx-auto flex max-w-(--container-narrow) items-center gap-4 px-(--padding) py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-mid-1">{copy.summary.pay}</p>
              <p className="truncate text-lg font-semibold text-brand">
                {formatEUR(quote.totalCents)}
              </p>
            </div>
            <UiButton
              variant="sale"
              fullWidth={false}
              className="!h-11 shrink-0 px-6"
              disabled={state === "busy"}
              aria-busy={state === "busy" || undefined}
              onClick={submit}
              data-bundle-submit-sticky
            >
              {state === "busy" ? copy.notices.adding : copy.summary.cta}
            </UiButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  hook,
  name,
}: {
  label: string;
  value: string;
  tone?: "success";
  hook: "data-bundle-line" | "data-bundle-offer-line";
  name: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-mid-1">{label}</dt>
      <dd
        className={tone === "success" ? "font-medium text-success" : "font-medium text-dark-1"}
        {...{ [hook]: name }}
      >
        {value}
      </dd>
    </div>
  );
}

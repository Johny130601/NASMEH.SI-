import { formatEUR, klarnaInstallmentCents } from "@/lib/pricing";
import type { CheckoutQuote, QuoteFailure } from "@/lib/orders/quote";
import { checkout } from "@/lib/copy/checkout";
import { promo } from "@/lib/copy/promo";
import { DiscountField } from "./DiscountField";

/** Why the rail has no totals: each quote failure says what to do instead of one dead-end sentence (QA M11). */
const failureMessage: Record<QuoteFailure, string> = {
  invalid_email: checkout.fields.email,
  empty_cart: checkout.errors.quoteEmptyCart,
  sold_out: checkout.errors.quoteSoldOut,
  invalid_shipping_method: checkout.errors.shippingUnavailable,
  failed: checkout.errors.quoteFailed,
};

/** "ali 3 obroki po X s Klarno": the total split in three, the same rounding as the cart and the PDP (§8.2, QA C2-F13). */
export function KlarnaRecap({ totalCents }: { totalCents: number }) {
  return (
    <p className="text-xs text-mid-1" data-klarna-recap>
      {checkout.summary.klarnaRecap} {formatEUR(klarnaInstallmentCents(totalCents))} {checkout.summary.klarnaSuffix}
    </p>
  );
}

export function CheckoutSummary({ quote, failure = null, pending, activeCode, klarnaEnabled = false }: {
  quote: CheckoutQuote | null;
  failure?: QuoteFailure | null;
  pending: boolean;
  activeCode: string | null;
  klarnaEnabled?: boolean;
}) {
  return <aside className="h-fit rounded-card border border-light-2 bg-white p-5" data-checkout-summary aria-busy={pending}>
    <h2 className="text-lg">{checkout.summary.title}</h2>
    {quote ? <>
      <ul className="mt-4 flex flex-col gap-3">{quote.lines.map(line => <li key={line.variantId} className="flex justify-between gap-3 text-sm">
        <span>{line.quantity} × {line.title}</span><span>{formatEUR(line.lineTotalCents)}</span>
      </li>)}</ul>
      <dl className="mt-4 flex flex-col gap-2 border-t border-light-3 pt-4 text-sm">
        <div className="flex justify-between"><dt>{checkout.summary.subtotal}</dt><dd>{formatEUR(quote.subtotalCents)}</dd></div>
        {quote.discountCents > 0 ? <div className="flex justify-between text-success" data-discount-line><dt>{promo.discountLabel} ({quote.couponCode})</dt><dd>−{formatEUR(quote.discountCents)}</dd></div> : null}
        <div className="flex justify-between"><dt>{checkout.summary.shipping}</dt><dd data-checkout-shipping>{formatEUR(quote.shippingCents)}</dd></div>
        <div className="flex justify-between"><dt>{checkout.summary.vat} ({quote.vatRatePercent} %)</dt><dd data-checkout-vat>{formatEUR(quote.vatCents)}</dd></div>
        <div className="flex justify-between text-lg font-medium"><dt>{checkout.summary.total}</dt><dd data-checkout-total>{formatEUR(quote.totalCents)}</dd></div>
      </dl>
      {klarnaEnabled ? <div className="mt-2"><KlarnaRecap totalCents={quote.totalCents} /></div> : null}
    </> : <p role="status" className="mt-4 text-sm" data-quote-failure={failure ?? "failed"}>{failureMessage[failure ?? "failed"]}</p>}
    <div className="mt-4"><DiscountField activeCode={activeCode}
      error={quote?.couponRejection ? promo.errors[quote.couponRejection] : null} /></div>
    {/* A free-shipping code gets its own terms sentence: the uniform one excludes delivery (QA T6-10). */}
    {activeCode ? <p className="mt-2 text-xs text-mid-2">{promo.termsFor(quote?.couponType)}</p> : null}
    {pending ? <p role="status" className="mt-2 text-xs">{checkout.summary.updating}</p> : null}
  </aside>;
}

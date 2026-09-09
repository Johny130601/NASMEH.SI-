import { formatEUR } from "@/lib/pricing";
import type { CheckoutQuote } from "@/lib/orders/quote";
import { checkout, promo } from "@/lib/copy";
import { DiscountField } from "./DiscountField";

export function CheckoutSummary({ quote, pending, activeCode }: { quote: CheckoutQuote | null; pending: boolean; activeCode: string | null }) {
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
    </> : <p role="status" className="mt-4 text-sm">{checkout.errors.shippingUnavailable}</p>}
    <div className="mt-4"><DiscountField activeCode={activeCode}
      error={quote?.couponRejection ? promo.errors[quote.couponRejection] : null} /></div>
    {activeCode ? <p className="mt-2 text-xs text-mid-2">{promo.terms}</p> : null}
    {pending ? <p role="status" className="mt-2 text-xs">{checkout.summary.updating}</p> : null}
  </aside>;
}

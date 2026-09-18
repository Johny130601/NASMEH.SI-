import Link from "next/link";
import { trust as copy } from "@/lib/copy/pdp";
import { UiIcon, type UiIconName } from "../ui/UiIcon";

/**
 * Trust row (research 04 §8, 02 §5.2): delivery estimate, free-shipping
 * threshold, guarantee, secure payment — three to four signals at the point
 * of purchase. Both figures come from the shipping Setting; the guarantee
 * links its terms page. Shared by the PDP buy box and the homepage hero.
 */
export function TrustRow({
  estimate,
  freeThreshold,
  className = "",
  variant = "list",
  guarantee = true,
}: {
  estimate: string | null;
  /** Formatted threshold, or null when every order ships free. */
  freeThreshold: string | null;
  className?: string;
  /** "list": compact rows (PDP); "strip": icon tiles across the width (home). */
  variant?: "list" | "strip";
  /** Off where the guarantee pill already sits right above (the PDP buy box). */
  guarantee?: boolean;
}) {
  const items: Array<{ icon: UiIconName; label: string; detail?: string; href?: string }> = [
    { icon: "truck", label: copy.delivery(estimate) },
    { icon: "box", label: copy.freeShipping(freeThreshold) },
    ...(guarantee ? [{ icon: "shield" as const, label: copy.guarantee, href: copy.guaranteeHref }] : []),
    { icon: "lock", label: copy.securePayment, detail: copy.securePaymentDetail },
  ];

  if (variant === "strip") {
    return (
      <ul
        aria-label={copy.label}
        data-trust-row
        className={["grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4 md:gap-8", className].filter(Boolean).join(" ")}
      >
        {items.map((item) => (
          <li key={item.label} className="group flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-white text-brand shadow-card transition-transform duration-300 ease-out-quart group-hover:-translate-y-0.5">
              <UiIcon name={item.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-sm leading-5 text-dark-1">
              {item.href ? (
                <Link href={item.href} className="underline-offset-2 hover:underline">{item.label}</Link>
              ) : (
                item.label
              )}
              {item.detail ? <span className="block text-xs text-mid-2">{item.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul aria-label={copy.label} data-trust-row className={["flex flex-col gap-2.5", className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2.5 text-sm text-dark-1">
          <UiIcon name={item.icon} className="h-4.5 w-4.5 shrink-0 text-brand" />
          <span className="min-w-0">
            {item.href ? (
              <Link href={item.href} className="underline-offset-2 hover:underline">{item.label}</Link>
            ) : (
              item.label
            )}
            {item.detail ? <span className="text-mid-2"> · {item.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

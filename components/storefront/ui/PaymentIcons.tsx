/** Payment-method badge row (shared by footer + cart checkout block). */
export const PAYMENT_METHODS = [
  "Visa",
  "Mastercard",
  "PayPal",
  "Apple Pay",
  "Google Pay",
  "Klarna",
] as const;

export function PaymentIcons({ label, klarnaEnabled = false }: { label: string; klarnaEnabled?: boolean }) {
  return (
    <>
      <p className="sr-only">{label}</p>
      <ul className="flex flex-wrap items-center gap-2" aria-hidden="true">
        {PAYMENT_METHODS.filter(name => name !== "Klarna" || klarnaEnabled).map((name) => (
          <li
            key={name}
            className="flex h-8 items-center rounded-input border border-light-2 bg-light-4 px-3 text-xs font-medium text-mid-1"
          >
            {name}
          </li>
        ))}
      </ul>
    </>
  );
}

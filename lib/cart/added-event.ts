/**
 * Browser-side contract between the add-to-cart buttons and the confirmation
 * card (components/storefront/cart/CartToast.tsx): a DOM CustomEvent on
 * `window`, so any button anywhere on the page confirms through the one
 * card mounted by the storefront layout. Display data only — the cart itself
 * was already written by the Server Action (AGENTS §5.2), and the price here
 * is the one the page rendered, shown back to the visitor, never sent anywhere.
 */
export const CART_ADDED_EVENT = "nasmeh:cart-added";

export interface CartAddedDetail {
  title: string;
  priceCents: number;
  quantity: number;
  imageUrl: string | null;
  /** Dispatch time, so a second add of the same item restarts the card. */
  at: number;
}

export function dispatchCartAdded(detail: Omit<CartAddedDetail, "at">): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CartAddedDetail>(CART_ADDED_EVENT, { detail: { ...detail, at: Date.now() } }));
}

import { permanentRedirect } from "next/navigation";

/** Delivery belongs in checkout; old links keep a useful destination. */
export default function DeliveryRedirect() {
  permanentRedirect("/checkout");
}

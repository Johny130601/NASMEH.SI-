import type { Metadata } from "next";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { getCartLines } from "@/lib/cart/server";
import { hydrateCartLines } from "@/lib/cart/hydrate";
import { getLegalLinks, getShippingSettings } from "@/lib/settings";
import { readKodaCode } from "@/lib/koda";
import { listAvailableProviders } from "@/lib/payments";
import { getEnv } from "@/lib/env";
import { isTestMode } from "@/lib/turnstile";
import { buildMetadata } from "@/lib/seo";
import { checkout } from "@/lib/copy";
import { buildCheckoutPricing } from "@/lib/orders/quote";
import { CheckoutWizard } from "@/components/storefront/checkout/CheckoutWizard";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildMetadata({ title: checkout.title, path: "/checkout", noindex: true });

export default async function CheckoutPage() {
  const session = await auth();
  const hydrated = await hydrateCartLines(await getCartLines(session?.user?.id ?? null));
  if (!hydrated.length) return <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
    <h1 className="text-[2rem]">{checkout.empty.title}</h1><p className="mt-4 text-sm text-mid-1">{checkout.empty.body}</p>
    <div className="mt-8 flex justify-center"><UiButton href="/trgovina">{checkout.empty.cta}</UiButton></div>
  </section>;
  const [{ methods }, legalLinks] = await Promise.all([getShippingSettings(), getLegalLinks()]);
  const defaultEmail = session?.user?.email ?? "";
  const initial = await buildCheckoutPricing({ email: defaultEmail, country: "SI", shippingMethodId: methods.find(method => method.countries.includes("SI"))?.id ?? "" }).catch(() => null);
  const env = getEnv();
  const providers = listAvailableProviders().filter(provider => provider !== "stripe" || !!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  return <div className="mx-auto max-w-(--container-narrow) px-(--padding) py-10">
    <h1 className="text-[2rem]">{checkout.title}</h1>
    <div className="mt-8"><CheckoutWizard providers={providers} shippingMethods={methods}
      checkoutKey={crypto.randomBytes(16).toString("hex")} defaultEmail={defaultEmail}
      testToken={isTestMode() ? env.TURNSTILE_TEST_TOKEN ?? null : null}
      stripePublishableKey={env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null} paypalClientId={env.PAYPAL_CLIENT_ID ?? null}
      turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} initialQuote={initial?.quote ?? null} activeCode={await readKodaCode()} legalLinks={legalLinks} />
    </div>
  </div>;
}

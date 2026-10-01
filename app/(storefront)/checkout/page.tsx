import type { Metadata } from "next";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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
import { soldOutLineTitles } from "@/lib/orders/sold-out";
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
  const userId = session?.user?.id ?? null;
  const [{ methods }, legalLinks, account] = await Promise.all([
    getShippingSettings(),
    getLegalLinks(),
    // A signed-in shopper starts from the account name and the address book (QA M12).
    userId
      ? db.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          addresses: {
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            select: { id: true, label: true, fullName: true, line1: true, line2: true, postalCode: true, city: true, country: true, phone: true, isDefault: true },
          },
        },
      })
      : null,
  ]);
  const defaultEmail = session?.user?.email ?? "";
  // A line that sold out in the cart: the quote refuses it, the wizard opens on the notice (QA 2026-09-30).
  const soldOutLines = soldOutLineTitles(hydrated);
  const initial = await buildCheckoutPricing({ email: defaultEmail, country: "SI", shippingMethodId: methods.find(method => method.countries.includes("SI"))?.id ?? "" }).catch(() => null);
  const env = getEnv();
  const providers = listAvailableProviders().filter(provider => provider !== "stripe" || !!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  return <div className="mx-auto max-w-(--container-narrow) px-(--padding) py-10">
    <h1 className="text-[2rem]">{checkout.title}</h1>
    <div className="mt-8"><CheckoutWizard providers={providers} shippingMethods={methods}
      checkoutKey={crypto.randomBytes(16).toString("hex")} defaultEmail={defaultEmail}
      defaultName={account?.name ?? ""} savedAddresses={account?.addresses ?? []}
      klarnaEnabled={env.STRIPE_KLARNA_ENABLED === "true" && providers.includes("stripe")}
      testToken={isTestMode() ? env.TURNSTILE_TEST_TOKEN ?? null : null}
      stripePublishableKey={env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null} paypalClientId={env.PAYPAL_CLIENT_ID ?? null}
      turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} initialQuote={initial?.quote ?? null} soldOutLines={soldOutLines} activeCode={await readKodaCode()} legalLinks={legalLinks} />
    </div>
  </div>;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { formatEUR } from "@/lib/pricing";
import {
  captureCheckoutEmailAction,
  checkEmailExistsAction,
  placeOrderAction,
} from "@/app/(storefront)/actions/checkout";
import { EU_COUNTRIES, isValidPostalCode, type ShippingMethodSetting } from "@/lib/orders/checkout-schema";
import { checkout } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

import { quoteCheckoutAction } from "@/app/(storefront)/actions/payment";
import type { CheckoutQuote } from "@/lib/orders/quote";
import type { PlaceOrderResult } from "@/lib/orders/create";
import { CheckoutSummary } from "./CheckoutSummary";
import { ProviderPaymentPanel } from "./ProviderPaymentPanel";
import { TurnstileWidget } from "../chrome/TurnstileWidget";

type Provider = "stripe" | "paypal" | "test";

interface WizardProps {
  providers: Provider[];
  shippingMethods: ShippingMethodSetting[];
  checkoutKey: string;
  testToken: string | null;
  defaultEmail: string;
  stripePublishableKey: string | null;
  paypalClientId: string | null;
  turnstileSiteKey: string | null;
  initialQuote: CheckoutQuote | null;
  activeCode: string | null;
}

interface FormState {
  email: string;
  phone: string;
  fullName: string;
  street: string;
  streetNumber: string;
  city: string;
  postalCode: string;
  country: string;
  shippingMethodId: string;
  provider: Provider;
  marketingOptIn: boolean;
}

/** One-page checkout accordion: Kontakt → Dostava → Plačilo → Pregled (§8). */
export function CheckoutWizard({
  providers,
  shippingMethods,
  checkoutKey,
  testToken,
  defaultEmail,
  stripePublishableKey,
  paypalClientId,
  turnstileSiteKey,
  initialQuote,
  activeCode,
}: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [stableCheckoutKey] = useState(checkoutKey);
  const [turnstileToken, setTurnstileToken] = useState(testToken ?? "");
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const [quote, setQuote] = useState(initialQuote);
  const [quotePending, setQuotePending] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [form, setForm] = useState<FormState>({
    email: defaultEmail,
    phone: "",
    fullName: "",
    street: "",
    streetNumber: "",
    city: "",
    postalCode: "",
    country: "SI",
    shippingMethodId: initialQuote?.shippingMethodId ?? shippingMethods.find(method => (method.countries ?? ["SI"]).includes("SI"))?.id ?? "",
    provider: providers[0] ?? "test",
    marketingOptIn: false,
  });
  const [emailExists, setEmailExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payInfo, setPayInfo] = useState<Extract<PlaceOrderResult, {ok: true}> | null>(null);
  const [pending, startTransition] = useTransition();
  const [, startEmailCheck] = useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (payInfo) return;
    let cancelled = false;
    setQuotePending(true);
    const timer = setTimeout(() => {
      quoteCheckoutAction({ email: form.email, country: form.country, shippingMethodId: form.shippingMethodId })
        .then(result => { if (!cancelled) { setQuote(result.ok ? result.quote : null); setQuotePending(false); } })
        .catch(() => { if (!cancelled) { setQuote(null); setQuotePending(false); } });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.email, form.country, form.shippingMethodId, initialQuote?.token, activeCode, quoteRefresh, payInfo]);

  const onEmailBlur = () => {
    if (!form.email.includes("@")) return;
    startEmailCheck(async () => {
      const result = await checkEmailExistsAction({ email: form.email });
      setEmailExists(result.exists);
    });
  };

  const continueFromContact = () => {
    setError(null);

    startTransition(async () => {
      try {
        await captureCheckoutEmailAction({
          email: form.email,
          checkoutKey: stableCheckoutKey,
        });
        setStep(1);
      } catch {
        setError(checkout.errors.orderFailed);
      }
    });
  };

  const placeOrder = () => {
    setError(null);
    if (!quote || quotePending) return;
    startTransition(async () => {
      try {
      const result = await placeOrderAction({
        ...form,
        turnstileToken,
        checkoutKey: stableCheckoutKey,
        quoteToken: quote.token,
      });
      if (result.ok) {
        if (result.paymentStatus && result.paymentStatus !== "PENDING") router.push(`/potrditev/${result.orderNumber}`);
        setPayInfo(result);
      } else {
        setQuoteRefresh(value => value + 1);
        setError(
          result.error === "quote_changed" ? checkout.errors.quoteChanged : result.error === "bot_check"
            ? checkout.errors.botCheck
            : result.error === "empty_cart"
              ? checkout.errors.emptyCart
              : result.error.startsWith("stock:")
                ? `${checkout.errors.stock}: ${result.error.slice(6)}`
                : checkout.errors.orderFailed,
        );
      }
      } catch {
        setError(checkout.errors.orderFailed);
      } finally {
        setWidgetAttempt(value => value + 1);
        if (!testToken) setTurnstileToken("");
      }
    });
  };

  const selectedMethod = shippingMethods.find(
    (method) => method.id === form.shippingMethodId,
  );

  if (payInfo) {
    return <ProviderPaymentPanel initial={payInfo} stripeKey={stripePublishableKey} paypalClientId={paypalClientId}
      onComplete={number => router.push(`/potrditev/${number}`)} />;
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
    <div className="flex flex-col gap-4" data-checkout-wizard>
      <StepShell
        index={0}
        title={checkout.steps.contact}
        step={step}
        onOpen={setStep}
      >
        <div className="flex flex-col gap-4">
          <div>
            <UiInput
              label={checkout.contact.emailLabel}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={onEmailBlur}
            />
            {emailExists ? (
              <p className="mt-1 text-xs text-link">
                <Link href="/prijava" className="underline underline-offset-2">
                  {checkout.contact.accountHint}
                </Link>
              </p>
            ) : null}
          </div>
          <label className="flex items-start gap-2 text-sm text-mid-1">
            <input
              type="checkbox"
              checked={form.marketingOptIn}
              onChange={(e) => set("marketingOptIn", e.target.checked)}
              className="mt-1"
              data-marketing-optin
            />
            {checkout.contact.marketingOptIn}
          </label>
          {error ? (<p role="alert" className="text-sm text-error">{error}</p>) : null}
          <UiButton
            variant="primary"
            onClick={continueFromContact}
            disabled={pending || !form.email.includes("@")}
            data-continue-contact
          >
            {checkout.contact.continue}
          </UiButton>
        </div>
      </StepShell>

      <StepShell
        index={1}
        title={checkout.steps.shipping}
        step={step}
        onOpen={setStep}
      >
        <div className="flex flex-col gap-4">
          <UiInput
            label={checkout.shipping.phoneLabel}
            name="phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
          <UiInput
            label={checkout.shipping.nameLabel}
            name="fullName"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
          />
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <UiInput
              label={checkout.shipping.streetLabel}
              name="street"
              autoComplete="address-line1"
              required
              value={form.street}
              onChange={(e) => set("street", e.target.value)}
            />
            <UiInput
              label={checkout.shipping.streetNumberLabel}
              name="streetNumber"
              autoComplete="address-line2"
              required
              value={form.streetNumber}
              onChange={(e) => set("streetNumber", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <UiInput
              label={checkout.shipping.cityLabel}
              name="city"
              autoComplete="address-level2"
              required
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
            <UiInput
              label={checkout.shipping.postalLabel}
              name="postalCode"
              autoComplete="postal-code"
              required
              value={form.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
            />
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-dark-1">
            {checkout.shipping.countryLabel}
            <select
              name="country"
              value={form.country}
              onChange={(e) => {
                const country = e.target.value;
                setForm(previous => ({ ...previous, country, shippingMethodId: shippingMethods.find(method => (method.countries ?? ["SI"]).includes(country))?.id ?? "" }));
              }}
              className="h-[3.25rem] rounded-input border border-light-1 bg-white px-4 text-base text-dark-1 outline-none focus:border-brand"
            >
              {EU_COUNTRIES.filter(country => shippingMethods.some(method => (method.countries ?? ["SI"]).includes(country.code))).map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-dark-1">
              {checkout.shipping.methodLabel}
            </legend>
            {shippingMethods.filter(method => (method.countries ?? ["SI"]).includes(form.country)).map((method) => (
              <label
                key={method.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-card border p-4 text-sm transition-colors ${
                  form.shippingMethodId === method.id
                    ? "border-brand bg-light-4"
                    : "border-light-2 bg-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="shippingMethod"
                    value={method.id}
                    checked={form.shippingMethodId === method.id}
                    onChange={() => set("shippingMethodId", method.id)}
                  />
                  <span>
                    <span className="block font-medium text-dark-1">
                      {method.label}
                    </span>
                    <span className="block text-xs text-mid-2">
                      {method.estimate}
                    </span>
                  </span>
                </span>
                <span className="text-dark-1" data-method-price={method.id}>
                  {formatEUR(quote?.shippingMethodId === method.id && quote.country === form.country ? quote.shippingCents : method.priceCents)}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex gap-3">
            <UiButton variant="ghost" onClick={() => setStep(0)}>
              {checkout.shipping.back}
            </UiButton>
            <UiButton
              variant="primary"
              onClick={() => setStep(2)}
              disabled={
                !form.fullName ||
                !form.street ||
                !form.streetNumber ||
                !form.city ||
                !isValidPostalCode(form.country, form.postalCode) ||
                !form.shippingMethodId || !quote || quotePending
              }
              data-continue-shipping
            >
              {checkout.shipping.continue}
            </UiButton>
          </div>
        </div>
      </StepShell>

      <StepShell
        index={2}
        title={checkout.steps.payment}
        step={step}
        onOpen={setStep}
      >
        <div className="flex flex-col gap-4">
          {providers.length === 0 ? <p role="alert">{checkout.errors.noProvider}</p> : null}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-dark-1">
              {checkout.payment.providerLabel}
            </legend>
            {providers.map((provider) => (
              <label
                key={provider}
                className={`flex cursor-pointer items-center gap-3 rounded-card border p-4 text-sm transition-colors ${
                  form.provider === provider
                    ? "border-brand bg-light-4"
                    : "border-light-2 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider}
                  checked={form.provider === provider}
                  onChange={() => set("provider", provider)}
                />
                {checkout.payment[provider]}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-mid-2">
            {checkout.payment.legalNote}{" "}
            <Link href="/pogoji-poslovanja" className="underline underline-offset-2">
              {checkout.payment.terms}
            </Link>{" "}
            {checkout.payment.and}{" "}
            <Link href="/odstop-od-pogodbe" className="underline underline-offset-2">
              {checkout.payment.withdrawal}
            </Link>
            .
          </p>
          <div className="flex gap-3">
            <UiButton variant="ghost" onClick={() => setStep(1)}>
              {checkout.shipping.back}
            </UiButton>
            <UiButton variant="primary" disabled={providers.length === 0} onClick={() => setStep(3)} data-continue-payment>
              {checkout.payment.continue}
            </UiButton>
          </div>
        </div>
      </StepShell>

      <StepShell
        index={3}
        title={checkout.steps.review}
        step={step}
        onOpen={setStep}
      >
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mid-2">{checkout.review.contactLabel}</dt>
              <dd className="text-dark-1">{form.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mid-2">{checkout.review.shippingLabel}</dt>
              <dd className="text-right text-dark-1">
                {form.fullName}, {form.street} {form.streetNumber},{" "}
                {form.postalCode} {form.city}
                {selectedMethod ? ` — ${selectedMethod.label}` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mid-2">{checkout.review.paymentLabel}</dt>
              <dd className="text-dark-1">{checkout.payment[form.provider]}</dd>
            </div>
          </dl>

          {error ? (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          ) : null}

          {quote ? <p className="text-lg font-medium" data-review-total>{checkout.summary.total}: {formatEUR(quote.totalCents)}</p> : null}
          {turnstileSiteKey && !testToken ? <TurnstileWidget key={widgetAttempt} siteKey={turnstileSiteKey} onToken={setTurnstileToken} /> : null}
          <UiButton
            variant="sale"
            fullWidth
            disabled={pending || quotePending || !quote || providers.length === 0 || (!testToken && !!turnstileSiteKey && !turnstileToken)}
            onClick={placeOrder}
            data-place-order
          >
            {pending ? checkout.pay.processing : checkout.review.placeOrder}
          </UiButton>
        </div>
      </StepShell>
    </div>
    <CheckoutSummary quote={quote} pending={quotePending} activeCode={activeCode} />
    </div>
  );
}
function StepShell({
  index,
  title,
  step,
  onOpen,
  children,
}: {
  index: number;
  title: string;
  step: number;
  onOpen: (index: number) => void;
  children: ReactNode;
}) {
  const open = step === index;
  const done = step > index;
  return (
    <section
      className={`rounded-card border bg-white ${open ? "border-brand" : "border-light-2"}`}
      data-step={index}
      data-open={open}
    >
      <button
        type="button"
        onClick={() => done && onOpen(index)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3 text-base font-medium text-dark-1">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-btn text-xs ${
              done ? "bg-brand text-white" : "bg-light-3 text-mid-1"
            }`}
          >
            {done ? "✓" : index + 1}
          </span>
          {title}
        </span>
      </button>
      {open ? <div className="border-t border-light-3 px-5 py-5">{children}</div> : null}
    </section>
  );
}

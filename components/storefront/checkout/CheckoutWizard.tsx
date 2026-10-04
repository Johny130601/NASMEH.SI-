"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { formatEUR } from "@/lib/pricing";
import {
  captureCheckoutEmailAction,
  checkEmailExistsAction,
  placeOrderAction,
} from "@/app/(storefront)/actions/checkout";
import {
  CHECKOUT_LIMITS, EU_COUNTRIES, fieldErrorsFromPaths, isPlausibleEmail, parseStreetLine, savedStreetLine,
  validateCheckoutAddress, validateCheckoutContact,
  type CheckoutField, type CheckoutFieldErrors, type ShippingMethodSetting,
} from "@/lib/orders/checkout-constants";
import { checkout } from "@/lib/copy/checkout";
import { common } from "@/lib/copy/common";
import { promo } from "@/lib/copy/promo";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

import { quoteCheckoutAction } from "@/app/(storefront)/actions/payment";
import type { CheckoutQuote, QuoteFailure } from "@/lib/orders/quote";
import type { PlaceOrderResult } from "@/lib/orders/create";
import { paymentSubmittedPath } from "@/lib/orders/confirmation-view";
import { CheckoutSummary, KlarnaRecap } from "./CheckoutSummary";
import dynamic from "next/dynamic";
import { TurnstileWidget } from "../chrome/TurnstileWidget";

// The payment panel (Stripe and PayPal React bindings, 14 kB gzipped) loads when an
// order has been placed, not with the address form (Phase 9 step 2).
const ProviderPaymentPanel = dynamic(
  () => import("./ProviderPaymentPanel").then((module) => module.ProviderPaymentPanel),
  { ssr: false, loading: () => <div data-pay-panel-loading aria-hidden="true" className="h-24 animate-pulse rounded-card bg-light-3" /> },
);

type Provider = "stripe" | "paypal" | "test";

/**
 * Terms, withdrawal and privacy links inside the wizard open in a new tab: the
 * wizard keeps everything the shopper entered in component state, so a
 * same-tab visit to a legal page would discard the form (review finding S6).
 * Screen readers announce the new tab through the link's description (one
 * hidden hint the wizard renders), so the visible sentences stay unchanged.
 */
export const NEW_TAB_HINT_ID = "checkout-new-tab-hint";

export function LegalLink({ href, children, ...data }: { href: string; children: ReactNode } & Record<`data-${string}`, boolean>) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-describedby={NEW_TAB_HINT_ID}
      className="underline underline-offset-2"
      {...data}
    >
      {children}
    </Link>
  );
}

export function NewTabHint() {
  return <span id={NEW_TAB_HINT_ID} hidden>{common.actions.opensInNewTab}</span>;
}

/** A row of the signed-in shopper's address book, offered on the Dostava step (QA M12). */
export interface SavedAddress {
  id: string;
  label: string | null;
  fullName: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
}

interface WizardProps {
  providers: Provider[];
  shippingMethods: ShippingMethodSetting[];
  checkoutKey: string;
  testToken: string | null;
  defaultEmail: string;
  /** The account name, prefilled as the recipient when no saved address supplies one. */
  defaultName?: string;
  savedAddresses?: SavedAddress[];
  stripePublishableKey: string | null;
  paypalClientId: string | null;
  turnstileSiteKey: string | null;
  initialQuote: CheckoutQuote | null;
  /** Titles of the cart lines that sold out while they sat in the cart; the wizard stops on them (QA 2026-09-30). */
  soldOutLines?: string[];
  activeCode: string | null;
  /** `legal.links` Setting: privacy at the e-mail field, terms and withdrawal directly above the order button. */
  legalLinks: { terms: string; withdrawal: string; privacy: string };
  /** Klarna instalments enabled at Stripe: the summary adds the "3 × …" recap (§8.2, QA C2-F13). */
  klarnaEnabled?: boolean;
}

interface FormState {
  email: string;
  phone: string;
  fullName: string;
  /** "Ulica in hišna številka" as typed or autofilled; split into the order's two fields on submit. */
  streetLine: string;
  city: string;
  postalCode: string;
  country: string;
  shippingMethodId: string;
  provider: Provider;
  marketingOptIn: boolean;
}

type AddressFields = Pick<FormState, "phone" | "fullName" | "streetLine" | "city" | "postalCode" | "country">;

const methodServes = (method: ShippingMethodSetting, country: string) => (method.countries ?? ["SI"]).includes(country);

/**
 * The address-book row as Dostava fields; the country falls back to Slovenia when no method serves it.
 * The supplement follows the street line after a comma, where `parseStreetLine` keeps it with the street.
 */
function addressToFields(address: SavedAddress, shippingMethods: ShippingMethodSetting[]): AddressFields {
  const country = shippingMethods.some(method => methodServes(method, address.country)) ? address.country : "SI";
  return {
    phone: address.phone ?? "", fullName: address.fullName,
    streetLine: savedStreetLine(address.line1, address.line2),
    city: address.city, postalCode: address.postalCode, country,
  };
}

/**
 * Empty Dostava fields for a new address: the account name stays as the
 * recipient (as on a first visit) and the country keeps the delivery method
 * that is already picked, so only the address itself is cleared.
 */
function blankAddress(fullName: string, country: string): AddressFields {
  return { phone: "", fullName, streetLine: "", city: "", postalCode: "", country };
}

const fieldMessage = (field: CheckoutField, kind: NonNullable<CheckoutFieldErrors[CheckoutField]>): string => {
  if (field === "email") return checkout.fields.email;
  if (field === "phone") return checkout.fields.phone;
  if (field === "postalCode" && kind !== "required") return checkout.fields.postalCode;
  if (field === "fullName" && kind === "invalid") return checkout.fields.fullName;
  if (field === "streetLine" && kind === "invalid") return checkout.fields.streetLine;
  return checkout.fields[kind];
};

/** One-page checkout accordion: Kontakt → Dostava → Plačilo → Pregled (§8). */
export function CheckoutWizard({
  providers,
  shippingMethods,
  checkoutKey,
  testToken,
  defaultEmail,
  defaultName = "",
  savedAddresses = [],
  stripePublishableKey,
  paypalClientId,
  turnstileSiteKey,
  initialQuote,
  soldOutLines = [],
  activeCode,
  legalLinks,
  klarnaEnabled = false,
}: WizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedAddressId = useId();
  const [step, setStep] = useState(0);
  // The furthest step this visit has reached: Back/Forward and ?korak= move within it, never past it.
  const [reached, setReached] = useState(0);
  const [stableCheckoutKey] = useState(checkoutKey);
  const [turnstileToken, setTurnstileToken] = useState(testToken ?? "");
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const [quote, setQuote] = useState(initialQuote);
  const [quoteFailure, setQuoteFailure] = useState<QuoteFailure | null>(initialQuote ? null : soldOutLines.length ? "sold_out" : "failed");
  // Lines that sold out in the cart: named above the steps, every continue closed until the cart is fixed.
  const [soldOut, setSoldOut] = useState<string[]>(soldOutLines);
  const [quotePending, setQuotePending] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [form, setForm] = useState<FormState>(() => {
    // The default (or only) saved address fills the delivery step; the account name is the fallback recipient (QA M12).
    const preset = savedAddresses.find(address => address.isDefault) ?? savedAddresses[0];
    const fields: AddressFields = preset ? addressToFields(preset, shippingMethods) : blankAddress(defaultName, "SI");
    return {
      email: defaultEmail,
      ...fields,
      shippingMethodId: (initialQuote && initialQuote.country === fields.country ? initialQuote.shippingMethodId : null)
        ?? shippingMethods.find(method => methodServes(method, fields.country))?.id ?? "",
      provider: providers[0] ?? "test",
      marketingOptIn: false,
    };
  });
  const [savedAddress, setSavedAddress] = useState<string>(() => (savedAddresses.find(address => address.isDefault) ?? savedAddresses[0])?.id ?? "");
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [emailExists, setEmailExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payInfo, setPayInfo] = useState<Extract<PlaceOrderResult, {ok: true}> | null>(null);
  const [pending, startTransition] = useTransition();
  const [, startEmailCheck] = useTransition();

  /**
   * Opens a step and records it in the browser history (`?korak=`, Next keeps the page), so the
   * system Back gesture returns to the previous step instead of leaving the checkout
   * (QA 2026-10-03 T2-03).
   */
  const goTo = (next: number) => {
    setStep(next);
    setReached(previous => Math.max(previous, next));
    window.history.pushState(null, "", next === 0 ? "/checkout" : `/checkout?korak=${next + 1}`);
  };

  // Back/Forward (and a reload or typed ?korak=) open the step the address names, clamped to what
  // this visit has reached: the fields are not kept across a reload, so a later step would be empty.
  useEffect(() => {
    const requested = Number(searchParams.get("korak") ?? "1") - 1;
    const target = Number.isInteger(requested) && requested > 0 ? Math.min(requested, reached) : 0;
    setStep(target);
    if (target !== Math.max(0, requested)) window.history.replaceState(null, "", target === 0 ? "/checkout" : `/checkout?korak=${target + 1}`);
    // only the address drives this; `reached` is read at the moment it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /** On a phone the first refused field can sit below the fold: bring it into view and focus it (QA 2026-10-03 T2-06). */
  const focusFirstInvalid = () => {
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>("[data-checkout-wizard] [aria-invalid='true']");
      if (!field) return;
      field.scrollIntoView({ block: "center" });
      field.focus({ preventScroll: true });
    });
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // A field's error clears as soon as it is edited; the next continue re-validates it.
    setFieldErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as CheckoutField];
      return next;
    });
  };
  const fieldError = (field: CheckoutField) => {
    const kind = fieldErrors[field];
    return kind ? fieldMessage(field, kind) : undefined;
  };

  // The quote is priced with the e-mail only once it is a plausible address, so
  // typing one never blanks the summary or trips the e-mail rule (QA C2-F7):
  // while the address is incomplete the last totals stand, priced without it.
  const quoteEmail = isPlausibleEmail(form.email) ? form.email.trim().toLowerCase() : "";

  useEffect(() => {
    if (payInfo) return;
    let cancelled = false;
    setQuotePending(true);
    const timer = setTimeout(() => {
      quoteCheckoutAction({ email: quoteEmail, country: form.country, shippingMethodId: form.shippingMethodId })
        .then(result => {
          if (cancelled) return;
          if (result.ok) { setQuote(result.quote); setQuoteFailure(null); setSoldOut([]); }
          else if (result.reason === "sold_out") { setQuote(null); setQuoteFailure("sold_out"); setSoldOut(result.soldOut ?? []); }
          else if (result.reason === "invalid_email") {
            // The client mirror let through an address the server refuses: mark it and reopen Kontakt.
            // (The e-mail is checked before the cart, so a sold-out refusal already on screen stands.)
            setQuoteFailure(current => (current === "sold_out" ? current : null));
            setFieldErrors(prev => ({ ...prev, email: "invalid" }));
            setStep(current => (current > 0 ? 0 : current));
          }
          else {
            setQuote(null); setQuoteFailure(result.reason);
            // The server checks the cart's stock after the cart itself and before the method, so these two clear it.
            if (result.reason === "empty_cart" || result.reason === "invalid_shipping_method") setSoldOut([]);
          }
          setQuotePending(false);
        })
        .catch(() => { if (!cancelled) { setQuote(null); setQuoteFailure("failed"); setQuotePending(false); } });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [quoteEmail, form.country, form.shippingMethodId, initialQuote?.token, activeCode, quoteRefresh, payInfo]);

  const onEmailBlur = () => {
    if (!isPlausibleEmail(form.email)) return;
    startEmailCheck(async () => {
      const result = await checkEmailExistsAction({ email: form.email });
      setEmailExists(result.exists);
    });
  };

  const continueFromContact = () => {
    setError(null);
    const errors = validateCheckoutContact(form);
    if (errors.email) { setFieldErrors(prev => ({ ...prev, ...errors })); focusFirstInvalid(); return; }
    // The server already refused this address (the quote marked it); it stays marked until edited.
    if (fieldErrors.email) return;
    const email = form.email.trim().toLowerCase();
    if (email !== form.email) setForm(prev => ({ ...prev, email }));

    startTransition(async () => {
      try {
        const captured = await captureCheckoutEmailAction({
          email,
          checkoutKey: stableCheckoutKey,
        });
        // An address the client mirror let through but the server refuses stops here, not at the order button (QA M11).
        if (!captured.ok && captured.reason === "invalid_email") {
          setFieldErrors(prev => ({ ...prev, email: "invalid" }));
          focusFirstInvalid();
          return;
        }
        goTo(1);
      } catch {
        setError(checkout.errors.orderFailed);
      }
    });
  };

  const continueFromShipping = () => {
    setError(null);
    const errors = validateCheckoutAddress(form);
    if (Object.keys(errors).length) { setFieldErrors(prev => ({ ...prev, ...errors })); focusFirstInvalid(); return; }
    goTo(2);
  };

  // A saved row fills the fields; "Vnesite nov naslov" empties them, so no part of the previous
  // address can ride along with a half-typed new one. The e-mail and the choices stay.
  const applySavedAddress = (id: string) => {
    setSavedAddress(id);
    const address = savedAddresses.find(row => row.id === id);
    setForm(prev => {
      const fields = address ? addressToFields(address, shippingMethods) : blankAddress(defaultName, prev.country);
      return {
        ...prev, ...fields,
        shippingMethodId: prev.country === fields.country ? prev.shippingMethodId : shippingMethods.find(method => methodServes(method, fields.country))?.id ?? "",
      };
    });
    setFieldErrors({});
  };

  const placeOrder = () => {
    setError(null);
    if (!quote || quotePending) return;
    // Dostava only continues with a line that splits; one that does not still reaches the
    // server without a number, and its `invalid_form` answer reopens the field.
    const { streetLine, ...fields } = form;
    const parts = parseStreetLine(streetLine);
    startTransition(async () => {
      try {
      const result = await placeOrderAction({
        ...fields,
        street: parts?.street ?? streetLine.trim(),
        streetNumber: parts?.streetNumber ?? "",
        streetSupplement: parts?.supplement ?? "",
        email: form.email.trim().toLowerCase(),
        turnstileToken,
        checkoutKey: stableCheckoutKey,
        quoteToken: quote.token,
      });
      if (result.ok) {
        // A payment already with the provider opens the waiting face; any other state speaks for itself.
        if (result.paymentStatus && result.paymentStatus !== "PENDING") {
          router.push(result.paymentStatus === "AWAITING_WEBHOOK" ? paymentSubmittedPath(result.orderNumber) : `/potrditev/${result.orderNumber}`);
        }
        setPayInfo(result);
      } else if (result.error === "invalid_form") {
        // The server names the fields; the wizard marks them and reopens the step that holds the first one (QA M11).
        const marked = fieldErrorsFromPaths(result.fields ?? []);
        setFieldErrors(prev => ({ ...prev, ...marked }));
        setError(Object.keys(marked).length ? checkout.errors.invalidForm : checkout.errors.orderFailed);
        if (marked.email) goTo(0);
        else if (Object.keys(marked).length) goTo(1);
        if (Object.keys(marked).length) focusFirstInvalid();
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
  // The recap names the method the signed quote was priced with, not a selection still being re-quoted.
  const quotedMethod = quote ? shippingMethods.find((method) => method.id === quote.shippingMethodId) : undefined;
  // Free shipping (threshold or a free-shipping code) never depends on the method, so every method reads free (QA C2-F10).
  // The quote says why delivery is free: a 0 € method picked below the threshold leaves the others at their price.
  const shippingFree = !!quote && quote.country === form.country && quote.freeShippingReached;

  if (payInfo) {
    return <ProviderPaymentPanel initial={payInfo} stripeKey={stripePublishableKey} paypalClientId={paypalClientId}
      onComplete={number => router.push(paymentSubmittedPath(number))} />;
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
    <div className="flex flex-col gap-4" data-checkout-wizard>
      <NewTabHint />
      {soldOut.length > 0 ? (
        <div role="alert" className="rounded-card border border-error bg-white p-5 text-sm" data-checkout-sold-out>
          <p className="font-medium text-error">{checkout.soldOut.title}</p>
          <ul className="mt-2 list-disc pl-5 text-dark-1">
            {soldOut.map((title, index) => <li key={`${index}-${title}`} data-checkout-sold-out-line>{title}</li>)}
          </ul>
          <p className="mt-2 text-mid-1">{checkout.soldOut.body}</p>
          <div className="mt-4">
            <UiButton href="/cart" variant="outline">{checkout.soldOut.cta}</UiButton>
          </div>
        </div>
      ) : null}
      <StepShell
        index={0}
        title={checkout.steps.contact}
        step={step}
        onOpen={goTo}
      >
        <div className="flex flex-col gap-4">
          <div>
            <UiInput
              label={checkout.contact.emailLabel}
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={CHECKOUT_LIMITS.email}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={onEmailBlur}
              error={fieldError("email")}
              aria-describedby={fieldError("email") ? "email-message checkout-email-notice" : "checkout-email-notice"}
            />
            <p id="checkout-email-notice" className="mt-1 text-xs text-mid-2" data-checkout-email-notice>
              {checkout.contact.emailNotice} {checkout.contact.privacyLead}{" "}
              <LegalLink href={legalLinks.privacy} data-legal-privacy>
                {checkout.contact.privacyLink}
              </LegalLink>
              .
            </p>
            {emailExists ? (
              <p className="mt-1 text-xs text-link">
                {/* Sign-in returns here: the wizard is the page the shopper was on (QA T3-F1). */}
                <Link href={{ pathname: "/prijava", query: { callbackUrl: "/checkout" } }} className="underline underline-offset-2">
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
            disabled={pending || soldOut.length > 0}
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
        onOpen={goTo}
      >
        <div className="flex flex-col gap-4">
          {savedAddresses.length > 0 ? (
            <label htmlFor={savedAddressId} className="flex flex-col gap-1.5 text-sm font-medium text-dark-1">
              {checkout.shipping.savedAddresses}
              <select
                id={savedAddressId}
                name="savedAddress"
                value={savedAddress}
                onChange={(e) => applySavedAddress(e.target.value)}
                className="h-[3.25rem] rounded-input border border-light-1 bg-white px-4 text-base text-dark-1 outline-none focus:border-brand"
                data-saved-addresses
              >
                {savedAddresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {checkout.shipping.savedAddressOption(address.label ?? address.fullName, `${address.line1}, ${address.postalCode} ${address.city}`)}
                  </option>
                ))}
                <option value="">{checkout.shipping.savedAddressNew}</option>
              </select>
            </label>
          ) : null}
          <UiInput
            label={checkout.shipping.phoneLabel}
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={CHECKOUT_LIMITS.phone}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            error={fieldError("phone")}
          />
          <UiInput
            label={checkout.shipping.nameLabel}
            name="fullName"
            autoComplete="name"
            required
            maxLength={CHECKOUT_LIMITS.fullName}
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            error={fieldError("fullName")}
          />
          {/* One line, as autofill and the address book hold it: a separate number field
              tagged address-line2 stayed empty under autofill and stopped the step. */}
          <UiInput
            label={checkout.shipping.streetLineLabel}
            name="streetLine"
            autoComplete="address-line1"
            required
            maxLength={CHECKOUT_LIMITS.streetLine}
            value={form.streetLine}
            onChange={(e) => set("streetLine", e.target.value)}
            error={fieldError("streetLine")}
          />
          <div className="grid grid-cols-2 gap-3">
            <UiInput
              label={checkout.shipping.cityLabel}
              name="city"
              autoComplete="address-level2"
              required
              maxLength={CHECKOUT_LIMITS.city}
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              error={fieldError("city")}
            />
            <UiInput
              label={checkout.shipping.postalLabel}
              name="postalCode"
              autoComplete="postal-code"
              required
              maxLength={CHECKOUT_LIMITS.postalCode}
              value={form.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
              error={fieldError("postalCode")}
            />
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-dark-1">
            {checkout.shipping.countryLabel}
            <select
              name="country"
              value={form.country}
              onChange={(e) => {
                const country = e.target.value;
                setForm(previous => ({ ...previous, country, shippingMethodId: shippingMethods.find(method => methodServes(method, country))?.id ?? "" }));
                setFieldErrors(previous => (previous.postalCode ? { ...previous, postalCode: undefined } : previous));
              }}
              className="h-[3.25rem] rounded-input border border-light-1 bg-white px-4 text-base text-dark-1 outline-none focus:border-brand"
            >
              {EU_COUNTRIES.filter(country => shippingMethods.some(method => methodServes(method, country.code))).map((country) => (
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
            {shippingMethods.filter(method => methodServes(method, form.country)).map((method) => (
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
                  {shippingFree
                    ? checkout.shipping.free
                    : formatEUR(quote?.shippingMethodId === method.id && quote.country === form.country ? quote.shippingCents : method.priceCents)}
                </span>
              </label>
            ))}
          </fieldset>

          {error ? (<p role="alert" className="text-sm text-error">{error}</p>) : null}
          <div className="flex gap-3">
            <UiButton variant="ghost" onClick={() => goTo(0)}>
              {checkout.shipping.back}
            </UiButton>
            {/* Empty fields do not disable the button: continuing marks them, so the shopper sees what is missing (QA M11). */}
            <UiButton
              variant="primary"
              onClick={continueFromShipping}
              disabled={!form.shippingMethodId || !quote || quotePending}
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
        onOpen={goTo}
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
          <div className="flex gap-3">
            <UiButton variant="ghost" onClick={() => goTo(1)}>
              {checkout.shipping.back}
            </UiButton>
            <UiButton variant="primary" disabled={providers.length === 0} onClick={() => goTo(3)} data-continue-payment>
              {checkout.payment.continue}
            </UiButton>
          </div>
        </div>
      </StepShell>

      <StepShell
        index={3}
        title={checkout.steps.review}
        step={step}
        onOpen={goTo}
      >
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mid-2">{checkout.review.contactLabel}</dt>
              {/* an address has no break points: without min-w-0 it widens the phone layout (QA 2026-09-30) */}
              <dd className="min-w-0 text-right text-dark-1 [overflow-wrap:anywhere]">{form.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mid-2">{checkout.review.shippingLabel}</dt>
              <dd className="min-w-0 text-right text-dark-1 [overflow-wrap:anywhere]">
                {form.fullName}, {form.streetLine.trim()},{" "}
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

          {turnstileSiteKey && !testToken ? <TurnstileWidget key={widgetAttempt} siteKey={turnstileSiteKey} onToken={setTurnstileToken} /> : null}

          {/* Essentials right above the button at every breakpoint: the aside summary renders below the wizard on mobile. */}
          {quote ? (
            <section aria-labelledby="checkout-review-recap" aria-busy={quotePending} className="flex flex-col gap-3 border-t border-light-3 pt-4 text-sm" data-review-recap>
              <p id="checkout-review-recap" className="font-medium text-dark-1">{checkout.review.recapTitle}</p>
              <ul className="flex flex-col gap-2">
                {quote.lines.map((line) => (
                  <li key={line.variantId} className="flex justify-between gap-3" data-review-line={line.variantId}>
                    <span>{line.quantity} × {line.title}</span>
                    <span className="whitespace-nowrap">{formatEUR(line.lineTotalCents)}</span>
                  </li>
                ))}
              </ul>
              <dl className="flex flex-col gap-2 border-t border-light-3 pt-3">
                <div className="flex justify-between gap-3">
                  <dt>{checkout.summary.subtotal}</dt>
                  <dd className="whitespace-nowrap" data-review-subtotal>{formatEUR(quote.subtotalCents)}</dd>
                </div>
                {quote.discountCents > 0 ? (
                  <div className="flex justify-between gap-3 text-success">
                    <dt>{promo.discountLabel} ({quote.couponCode})</dt>
                    <dd className="whitespace-nowrap" data-review-discount>−{formatEUR(quote.discountCents)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt>{checkout.summary.shipping}{quotedMethod ? ` (${quotedMethod.label})` : ""}</dt>
                  <dd className="whitespace-nowrap" data-review-shipping>{quote.shippingCents === 0 ? checkout.shipping.free : formatEUR(quote.shippingCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{checkout.summary.vat} ({quote.vatRatePercent} %)</dt>
                  <dd className="whitespace-nowrap" data-review-vat>{formatEUR(quote.vatCents)}</dd>
                </div>
              </dl>
              <p className="text-lg font-medium" data-review-total>{checkout.summary.total}: {formatEUR(quote.totalCents)}</p>
              {klarnaEnabled ? <KlarnaRecap totalCents={quote.totalCents} /> : null}
            </section>
          ) : null}

          <p className="text-xs text-mid-2" data-review-legal>
            {checkout.review.legal.termsLead}{" "}
            <LegalLink href={legalLinks.terms} data-legal-terms>
              {checkout.review.legal.termsLink}
            </LegalLink>
            . {checkout.review.legal.withdrawalLead}{" "}
            <LegalLink href={legalLinks.withdrawal} data-legal-withdrawal>
              {checkout.review.legal.withdrawalLink}
            </LegalLink>{" "}
            {checkout.review.legal.withdrawalTail}
          </p>
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
    <CheckoutSummary quote={quote} failure={quoteFailure} pending={quotePending} activeCode={activeCode} klarnaEnabled={klarnaEnabled} />
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

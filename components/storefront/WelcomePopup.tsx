"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { subscribeNewsletterAction } from "@/app/(storefront)/actions/newsletter";
import { applyKodaAction } from "@/app/(storefront)/actions/koda";
import { common, footer, newsletter, promo } from "@/lib/copy";
import type { WelcomePopupSetting } from "@/lib/settings-types";
import { useConsent } from "./cmp/ConsentProvider";
import { ChallengeStatus, useLazyChallenge } from "./chrome/useLazyChallenge";
import { PrivacyNotice } from "./PrivacyNotice";
import { UiButton } from "./ui/UiButton";
import { UiInput } from "./ui/UiInput";
import { UiIcon } from "./ui/UiIcon";

const SESSION_FLAG = "nasmeh_welcome_seen";
const SUPPRESSED_PATHS = ["/cart", "/checkout", "/racun"];

/**
 * Welcome popup (§9.3): Setting-driven copy/timing/code/active. Suppressed on
 * /cart /checkout /racun, for known subscribers, and once-interacted-per-
 * session. It never opens (and hides) while the consent banner awaits a
 * choice, so it cannot cover the banner's buttons. Bottom sheet on mobile /
 * centered on desktop. Thank-you state auto-stores the code for checkout.
 * Capture = Phase 1 double opt-in with source "welcome-popup": its own lazily
 * mounted Turnstile widget, the fixed consent note and the privacy link under
 * the operator copy.
 */
export function WelcomePopup({
  setting,
  testToken,
  siteKey,
  privacyHref,
  knownSubscriber,
}: {
  setting: WelcomePopupSetting;
  testToken: string | null;
  siteKey: string | null;
  privacyHref: string;
  knownSubscriber: boolean;
}) {
  const pathname = usePathname();
  const { bannerOpen } = useConsent();
  const human = useLazyChallenge({ siteKey, testToken });
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suppressed =
    !setting.active ||
    knownSubscriber ||
    SUPPRESSED_PATHS.some((path) => pathname.startsWith(path));

  useEffect(() => {
    if (suppressed || bannerOpen) return;
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    const timer = setTimeout(
      () => setOpen(true),
      Math.max(1, setting.delaySeconds) * 1000,
    );
    return () => clearTimeout(timer);
  }, [suppressed, bannerOpen, setting.delaySeconds]);

  const dismiss = () => {
    sessionStorage.setItem(SESSION_FLAG, "1");
    setOpen(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sessionStorage.setItem(SESSION_FLAG, "1");
    setMessage(null);
    // A submit made before the widget answered goes out as soon as it does.
    human.submit((turnstileToken) => {
      startTransition(async () => {
        try {
          const result = await subscribeNewsletterAction({ email, turnstileToken, source: "welcome-popup" });
          if (result.ok) {
            await applyKodaAction({ code: setting.couponCode });
            setDone(true);
          } else {
            setMessage(result.message);
          }
        } catch {
          setMessage(newsletter.genericError);
        } finally {
          human.reset();
        }
      });
    });
  };

  if (!open || bannerOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={setting.title}
      data-welcome-popup
      className="fixed inset-x-0 bottom-0 z-50 border-t border-light-2 bg-white p-6 shadow-xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[26rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:border"
    >
      <button
        type="button"
        aria-label={promo.popup.closeLabel}
        onClick={dismiss}
        data-welcome-dismiss
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-btn bg-light-3 text-dark-1 transition-colors hover:bg-light-2"
      >
        <UiIcon name="close" className="h-4 w-4" />
      </button>

      {done ? (
        <div data-welcome-thanks>
          <h2 className="pr-10 text-2xl">{setting.thankYouTitle}</h2>
          <p className="mt-3 text-sm text-mid-1">{setting.thankYouBody}</p>
          <p className="mt-4 rounded-card bg-light-4 px-4 py-3 text-center text-lg font-medium text-dark-1" data-welcome-code>
            {setting.couponCode}
          </p>
          <p className="mt-2 text-xs text-mid-2">{promo.terms}</p>
          <UiButton variant="primary" fullWidth className="mt-4" onClick={dismiss}>
            {common.actions.close}
          </UiButton>
        </div>
      ) : (
        <>
          <h2 className="pr-10 text-2xl">{setting.title}</h2>
          <p className="mt-3 text-sm text-mid-1">{setting.body}</p>
          <form
            onSubmit={submit}
            onFocusCapture={human.arm}
            onPointerDownCapture={human.arm}
            className="mt-5 flex flex-col gap-3"
            data-welcome-form
          >
            <UiInput
              id="welcome-email"
              label={footer.newsletter.emailLabel}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {human.field}
            <UiButton type="submit" variant="primary" fullWidth disabled={pending || human.waiting}>
              {setting.cta}
            </UiButton>
            <ChallengeStatus challenge={human} className="text-sm" />
            {message ? (
              <p role="alert" className="text-sm text-error">
                {message}
              </p>
            ) : null}
            <div className="flex flex-col gap-1" data-welcome-consent-note>
              <p className="text-xs text-mid-2">{footer.newsletter.note}</p>
              <PrivacyNotice
                lead={footer.newsletter.privacyLead}
                link={footer.newsletter.privacyLink}
                href={privacyHref}
              />
            </div>
          </form>
        </>
      )}
    </div>
  );
}

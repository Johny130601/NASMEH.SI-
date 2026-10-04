"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConsent } from "./ConsentProvider";
import { cmp as copy } from "@/lib/copy/cmp";
import { SKIP_LINK_ID } from "../chrome/SkipLink";
import { UiButton } from "../ui/UiButton";
import { useDialogFocus } from "../ui/useDialogFocus";

type CategoryKey = "analytics" | "marketing";

const CATEGORY_KEYS: CategoryKey[] = ["analytics", "marketing"];

/**
 * Granular GDPR consent banner (spec §3.4): Nujni always on, Analitični /
 * Trženjski toggles, Sprejmi vse / Zavrni / Shrani izbiro. It is an
 * `aria-modal` dialog, so Tab and Shift+Tab stay inside it until a choice is
 * made (useDialogFocus, as the popup, drawer and search do — QA 2026-10-03
 * T1-05). Escape does nothing: the choice is explicit and the banner stays
 * until one is made. Accepting and refusing are buttons of the same look, so
 * neither answer is the easier one to see (no nudging).
 *
 * On the cookie policy page it links to, the banner is neither modal nor tall:
 * no focus trap and the category switches folded away, so the policy can be
 * read — by keyboard too — before choosing (QA 2026-10-03 V1-02).
 */
export function CmpBanner() {
  const { bannerOpen } = useConsent();
  // Mounted only while open, so every (re)open starts from the stored choice.
  return bannerOpen ? <CmpBannerDialog /> : null;
}

function CmpBannerDialog() {
  const { consent, save, banner, policyHref } = useConsent();
  const pathname = usePathname();
  const onPolicy = pathname === policyHref.split(/[?#]/)[0];
  const [toggles, setToggles] = useState<Record<CategoryKey, boolean>>({
    analytics: consent?.analytics ?? false,
    marketing: consent?.marketing ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Where focus goes once a choice closes the banner: back to the control that
  // reopened it (the footer's "Nastavitve piškotkov"), or — when the banner
  // opened with the page and nothing had focus — to the skip link at the start
  // of the page, never to <body>. Declared before the focus trap, so this
  // effect reads the opener before the dialog takes focus.
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const active = document.activeElement;
    returnTo.current =
      active instanceof HTMLElement && active !== document.body
        ? active
        : document.getElementById(SKIP_LINK_ID);
  }, []);
  useDialogFocus(!onPolicy, dialogRef, { returnTo });

  // Not modal on the policy page, so the page keeps room for the banner at its bottom: a
  // focused control is never hidden behind it, and the opener is brought into view above it
  // (QA 2026-10-03 W1-01).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!onPolicy || !dialog) return;
    const root = document.documentElement;
    const body = document.body;
    const before = { padding: body.style.paddingBottom, scrollPadding: root.style.scrollPaddingBottom };
    const reserve = () => {
      const height = `${dialog.offsetHeight}px`;
      body.style.paddingBottom = height;
      root.style.scrollPaddingBottom = height;
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(dialog);
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== body) active.scrollIntoView({ block: "nearest" });
    return () => {
      observer.disconnect();
      body.style.paddingBottom = before.padding;
      root.style.scrollPaddingBottom = before.scrollPadding;
    };
  }, [onPolicy]);

  // Without the trap there is no trap cleanup to hand focus back: on the policy page the
  // banner does it as it closes, as the trap does elsewhere (QA 2026-10-03 W1-02).
  const onPolicyNow = useRef(onPolicy);
  useEffect(() => {
    onPolicyNow.current = onPolicy;
  }, [onPolicy]);
  useEffect(() => {
    const back = returnTo;
    return () => {
      if (onPolicyNow.current) back.current?.focus({ preventScroll: true });
    };
  }, []);

  const persist = async (choices: { analytics: boolean; marketing: boolean }) => {
    setSaving(true);
    setFailed(false);
    const ok = await save(choices);
    // On success the dialog unmounts; only a failure updates its state.
    if (!ok) {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={onPolicy ? undefined : "true"}
      aria-labelledby="cmp-title"
      tabIndex={-1}
      data-cmp-banner
      className="fixed inset-x-0 bottom-0 z-50 max-h-dvh overflow-y-auto border-t border-light-2 bg-white p-5 shadow-xl outline-none md:inset-x-auto md:bottom-5 md:left-5 md:max-h-[calc(100dvh-2.5rem)] md:max-w-xl md:rounded-card md:border"
    >
      <h2 id="cmp-title" className="text-xl">
        {banner.title || copy.banner.title}
      </h2>
      {onPolicy ? null : (
        <p className="mt-2 text-sm text-mid-1">
          {banner.body || copy.banner.body}{" "}
          <Link href={policyHref} className="underline underline-offset-2" data-cmp-policy-link>
            {copy.banner.policyLink}
          </Link>
        </p>
      )}

      <CategoryFields folded={onPolicy}>
      <fieldset className="mt-4 flex flex-col gap-3">
        <legend className="sr-only">{copy.banner.settingsLabel}</legend>
        <CategoryRow
          label={copy.categories.necessary.label}
          description={copy.categories.necessary.description}
          checked
          disabled
        />
        {CATEGORY_KEYS.map((key) => (
          <CategoryRow
            key={key}
            label={copy.categories[key].label}
            description={copy.categories[key].description}
            checked={toggles[key]}
            onChange={(next) =>
              setToggles((prev) => ({ ...prev, [key]: next }))
            }
          />
        ))}
      </fieldset>
      </CategoryFields>

      {/* Accept and refuse share one look: the refusal is as easy to see and
          to reach as the acceptance (no nudging). */}
      <div className="mt-5 flex flex-col gap-2 md:flex-row">
        <UiButton
          variant="primary"
          disabled={saving}
          onClick={() => persist({ analytics: true, marketing: true })}
          data-cmp-choice="accept"
        >
          {copy.banner.acceptAll}
        </UiButton>
        <UiButton
          variant="primary"
          disabled={saving}
          onClick={() => persist({ analytics: false, marketing: false })}
          data-cmp-choice="reject"
        >
          {copy.banner.rejectAll}
        </UiButton>
        <UiButton
          variant="outline"
          disabled={saving}
          onClick={() => persist(toggles)}
          data-cmp-choice="save"
        >
          {copy.banner.saveChoice}
        </UiButton>
      </div>
      {failed ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {copy.banner.saveFailed}
        </p>
      ) : null}
    </div>
  );
}

/** The category switches; folded behind a disclosure on the policy page. */
function CategoryFields({ folded, children }: { folded: boolean; children: React.ReactNode }) {
  if (!folded) return <>{children}</>;
  return (
    <details className="mt-3" data-cmp-folded>
      <summary className="cursor-pointer text-sm font-medium text-dark-1">{copy.banner.settingsLabel}</summary>
      {children}
    </details>
  );
}

function CategoryRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-input border border-light-2 p-3">
      <div>
        <p className="text-sm font-medium text-dark-1">{label}</p>
        <p className="text-xs text-mid-2">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-btn transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? "bg-brand" : "bg-light-1"
        }`}
      >
        {/* The knob slides on transform, never on `left` (AGENTS §8.23, QA L5). */}
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-btn bg-white shadow transition-transform duration-200 ease-out-quart ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

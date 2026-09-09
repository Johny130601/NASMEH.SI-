"use client";

import { useEffect, useRef, useState } from "react";
import { useConsent } from "./ConsentProvider";
import { cmp as copy } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";

type CategoryKey = "analytics" | "marketing";

const CATEGORY_KEYS: CategoryKey[] = ["analytics", "marketing"];

/**
 * Granular GDPR consent banner (spec §3.4): Nujni always on, Analitični /
 * Trženjski toggles, Sprejmi vse / Zavrni / Shrani izbiro. Esc rejects nothing
 * (choice is explicit) but closes focus trap correctly — banner stays until
 * a choice is made.
 */
export function CmpBanner() {
  const { consent, bannerOpen, save } = useConsent();
  const [toggles, setToggles] = useState<Record<CategoryKey, boolean>>({
    analytics: consent?.analytics ?? false,
    marketing: consent?.marketing ?? false,
  });
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bannerOpen) dialogRef.current?.focus();
  }, [bannerOpen]);

  if (!bannerOpen) return null;

  const persist = async (choices: { analytics: boolean; marketing: boolean }) => {
    setSaving(true);
    try {
      await save(choices);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cmp-title"
      tabIndex={-1}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-light-2 bg-white p-5 shadow-xl outline-none md:inset-x-auto md:bottom-5 md:left-5 md:max-w-xl md:rounded-card md:border"
    >
      <h2 id="cmp-title" className="text-xl">
        {copy.banner.title}
      </h2>
      <p className="mt-2 text-sm text-mid-1">{copy.banner.body}</p>

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

      <div className="mt-5 flex flex-col gap-2 md:flex-row">
        <UiButton
          variant="primary"
          disabled={saving}
          onClick={() => persist({ analytics: true, marketing: true })}
        >
          {copy.banner.acceptAll}
        </UiButton>
        <UiButton
          variant="outline"
          disabled={saving}
          onClick={() => persist({ analytics: false, marketing: false })}
        >
          {copy.banner.rejectAll}
        </UiButton>
        <UiButton
          variant="ghost"
          disabled={saving}
          onClick={() => persist(toggles)}
        >
          {copy.banner.saveChoice}
        </UiButton>
      </div>
    </div>
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
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-btn bg-white shadow transition-all ${
            checked ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

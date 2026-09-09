"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatEUR } from "@/lib/pricing";
import { search as copy } from "@/lib/copy";
import { UiIcon } from "../ui/UiIcon";

interface InstantResult {
  slug: string;
  title: string;
  priceCents: number;
  imageUrl: string | null;
  imageAlt: string;
}

const iconClasses =
  "flex h-11 w-11 items-center justify-center rounded-btn text-dark-1 transition-colors hover:bg-light-3";

/**
 * Search overlay (§3.1): header icon is an SSR <Link> (no-JS still reaches
 * /iskanje) and upgrades to a button after mount. Instant results as you
 * type, Esc closes, zero-result state.
 */
export function SearchOverlay() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Link href="/iskanje" aria-label={copy.open} className={iconClasses}>
        <UiIcon name="search" className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={copy.open}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={iconClasses}
      >
        <UiIcon name="search" className="h-5 w-5" />
      </button>
      {open ? <Overlay onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Overlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstantResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
        );
        const data = (await response.json()) as { results: InstantResult[] };
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim()) {
      onClose();
      router.push(`/iskanje?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white" role="dialog" aria-modal="true" aria-label={copy.title}>
      <div className="mx-auto max-w-(--container-narrow) px-(--padding) py-6">
        <div className="flex items-center gap-3">
          <form onSubmit={submit} className="flex-1" role="search">
            <label htmlFor="search-overlay-input" className="sr-only">
              {copy.title}
            </label>
            <input
              ref={inputRef}
              id="search-overlay-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.placeholder}
              className="h-[3.25rem] w-full rounded-input border border-light-1 bg-white px-4 text-base text-dark-1 outline-none transition-colors focus:border-brand"
            />
          </form>
          <button
            type="button"
            aria-label={copy.close}
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-light-3 text-dark-1 transition-colors hover:bg-light-2"
          >
            <UiIcon name="close" />
          </button>
        </div>

        <div className="mt-6" aria-live="polite">
          {loading ? (
            <ul className="flex flex-col gap-3" aria-hidden="true">
              {[0, 1, 2].map((n) => (
                <li key={n} className="flex animate-pulse items-center gap-4">
                  <div className="h-16 w-16 rounded-card bg-light-3" />
                  <div className="h-4 w-1/2 rounded bg-light-3" />
                </li>
              ))}
            </ul>
          ) : results !== null && results.length === 0 ? (
            <p className="text-sm text-mid-1">{copy.instantEmpty}</p>
          ) : results !== null ? (
            <>
              <ul className="flex flex-col divide-y divide-light-3">
                {results.map((result) => (
                  <li key={result.slug}>
                    <Link
                      href={`/izdelek/${result.slug}`}
                      onClick={onClose}
                      className="flex items-center gap-4 py-3 transition-colors hover:bg-light-4"
                      data-search-result={result.slug}
                    >
                      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-card bg-light-3">
                        {result.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={result.imageUrl}
                            alt={result.imageAlt}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span className="flex-1 text-sm text-dark-1">{result.title}</span>
                      <span className="text-sm text-brand">
                        {formatEUR(result.priceCents)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={`/iskanje?q=${encodeURIComponent(query.trim())}`}
                onClick={onClose}
                className="mt-4 inline-block text-sm font-medium text-dark-1 underline underline-offset-4"
              >
                {copy.allResults} →
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

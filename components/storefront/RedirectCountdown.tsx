"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { notFound as copy } from "@/lib/copy/notFound";

/**
 * 404 auto-redirect countdown (§3.6). The visitor can stop it (WCAG 2.2.1
 * timing adjustable), and the ticking number is not a live region, so a
 * screen reader is not interrupted every second; stopping is announced once.
 */
export function RedirectCountdown({
  seconds = 10,
  to = "/",
}: {
  seconds?: number;
  to?: string;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);
  const [stopped, setStopped] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (stopped) return;
    const interval = setInterval(
      () => setRemaining((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [stopped]);

  useEffect(() => {
    if (!stopped && remaining === 0) router.replace(to);
  }, [remaining, stopped, router, to]);

  // The stop button disappears with the countdown: focus moves to the confirmation
  // instead of falling back to the page body (WCAG 2.4.3).
  useEffect(() => {
    if (stopped) statusRef.current?.focus();
  }, [stopped]);

  return (
    <div className="flex flex-col items-center gap-2">
      {stopped ? null : (
        <>
          <p className="text-sm text-mid-2">
            {copy.countdownPrefix}{" "}
            <span data-countdown className="font-medium text-dark-1">
              {remaining}
            </span>{" "}
            {copy.countdownSuffix}
          </p>
          <button
            type="button"
            onClick={() => setStopped(true)}
            className="text-sm text-mid-1 underline underline-offset-4 transition-colors hover:text-dark-1"
            data-countdown-stop
          >
            {copy.stop}
          </button>
        </>
      )}
      {/* Mounted empty from the first render, so the stop is announced when its text arrives. */}
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className="text-sm text-mid-2 outline-none"
        data-countdown-stopped={stopped ? "" : undefined}
      >
        {stopped ? copy.stopped : null}
      </p>
    </div>
  );
}

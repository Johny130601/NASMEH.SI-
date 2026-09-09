"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { notFound as copy } from "@/lib/copy";

/** 404 auto-redirect countdown (§3.6). */
export function RedirectCountdown({
  seconds = 10,
  to = "/",
}: {
  seconds?: number;
  to?: string;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const interval = setInterval(
      () => setRemaining((value) => Math.max(0, value - 1)),
      1000,
    );
    const timeout = setTimeout(() => router.replace(to), seconds * 1000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [router, seconds, to]);

  return (
    <p className="text-sm text-mid-2" role="status">
      {copy.countdownPrefix}{" "}
      <span data-countdown className="font-medium text-dark-1">
        {remaining}
      </span>{" "}
      {copy.countdownSuffix}
    </p>
  );
}

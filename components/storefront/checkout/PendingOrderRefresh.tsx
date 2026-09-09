"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { orders } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";

/** Provider redirects are UX only; refresh until the verified webhook arrives. */
export function PendingOrderRefresh() {
  const router = useRouter();
  useEffect(() => {
    let attempts = 0;
    const interval = setInterval(() => {
      router.refresh();
      if (++attempts >= 24) clearInterval(interval);
    }, 2500);
    return () => clearInterval(interval);
  }, [router]);
  return <UiButton className="mt-4" variant="outline" onClick={() => router.refresh()}>{orders.confirmation.refreshStatus}</UiButton>;
}

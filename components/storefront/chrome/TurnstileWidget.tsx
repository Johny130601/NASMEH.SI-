"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void;
        "expired-callback": () => void; "error-callback": () => void }) => string;
      remove: (widgetId: string) => void;
    };
  }
}
const SCRIPT_ID = "cf-turnstile-script";

/** Each mounted widget owns its callbacks and cleans itself up on retry. */
export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  useEffect(() => {
    let widgetId: string | undefined;
    let disposed = false;
    const clear = () => callback.current("");
    const render = () => {
      if (!disposed && widgetId === undefined && containerRef.current && window.turnstile) {
        widgetId = window.turnstile.render(containerRef.current, { sitekey: siteKey,
          callback: token => callback.current(token), "expired-callback": clear, "error-callback": clear });
      }
    };
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script"); script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true; script.defer = true; document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    script.addEventListener("error", clear);
    render();
    return () => {
      disposed = true; script?.removeEventListener("load", render); script?.removeEventListener("error", clear);
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [siteKey]);
  return <div ref={containerRef} data-turnstile-widget />;
}

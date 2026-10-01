import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * QA C2-F2 (round 2): the /koda refusal parameters must leave the App Router's
 * own URL, not just the address bar, or the next router refresh puts them back
 * and a reload repeats the notice. The notice keeps what it showed after the
 * router replace re-renders the page without them.
 */

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { KodaNotice, kodaNoticeText, withoutKodaParams } from "@/components/storefront/cart/KodaNotice";

describe("kodaNoticeText", () => {
  it("names a code-shaped code, and a malformed one not at all", () => {
    expect(kodaNoticeText({ code: "FAKE99" }, null)).toBe("Koda FAKE99 ni veljavna.");
    expect(kodaNoticeText({ code: null }, null)).toBe("Koda ni veljavna.");
  });

  it("says the active code stays only while another code is active", () => {
    expect(kodaNoticeText({ code: "FAKE99" }, "TEST10")).toBe("Koda FAKE99 ni veljavna. Aktivna ostaja koda TEST10.");
    expect(kodaNoticeText({ code: "TEST10" }, "TEST10")).toBe("Koda TEST10 ni veljavna.");
  });
});

describe("withoutKodaParams", () => {
  it("drops the refusal's parameters and keeps everything else", () => {
    expect(withoutKodaParams("https://nasmeh.si/cart?koda=neveljavna&vnos=FAKE99")).toBe("/cart");
    expect(withoutKodaParams("https://nasmeh.si/cart?koda=neveljavna")).toBe("/cart");
    expect(withoutKodaParams("https://nasmeh.si/cart?x=1&koda=neveljavna&vnos=A#top")).toBe("/cart?x=1#top");
  });

  it("answers null when there is nothing to take off, so no replace is issued", () => {
    expect(withoutKodaParams("https://nasmeh.si/cart")).toBeNull();
    expect(withoutKodaParams("https://nasmeh.si/cart?x=1")).toBeNull();
  });
});

describe("KodaNotice", () => {
  it("renders the refusal in the server HTML and nothing without one", () => {
    const html = renderToStaticMarkup(React.createElement(KodaNotice, { refusal: { code: "FAKE99" }, activeCode: "TEST10" }));
    expect(html).toContain("data-koda-notice");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Koda FAKE99 ni veljavna. Aktivna ostaja koda TEST10.");
    expect(renderToStaticMarkup(React.createElement(KodaNotice, { refusal: null, activeCode: "TEST10" }))).toBe("");
  });
});

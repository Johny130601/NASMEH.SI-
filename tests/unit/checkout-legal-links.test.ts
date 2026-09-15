import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Review finding S6: the terms, withdrawal and privacy links inside the
 * checkout wizard navigated the same tab and discarded everything the shopper
 * had entered. They now open in a new tab and announce it to screen readers,
 * while the visible sentences (and the e2e text and href checks) stay as they were.
 */

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

vi.mock("@/app/(storefront)/actions/checkout", () => ({
  captureCheckoutEmailAction: vi.fn(), checkEmailExistsAction: vi.fn(), placeOrderAction: vi.fn(),
}));
vi.mock("@/app/(storefront)/actions/payment", () => ({ quoteCheckoutAction: vi.fn() }));

import { LegalLink, NEW_TAB_HINT_ID, NewTabHint } from "@/components/storefront/checkout/CheckoutWizard";
import { common } from "@/lib/copy";

describe("checkout legal links", () => {
  it("open in a new tab without an opener and point at the hidden hint", () => {
    const html = renderToStaticMarkup(React.createElement(LegalLink, { href: "/pogoji-poslovanja", "data-legal-terms": true } as never, "pogoji poslovanja"));
    expect(html).toContain('href="/pogoji-poslovanja"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(`aria-describedby="${NEW_TAB_HINT_ID}"`);
    expect(html).toContain("data-legal-terms");
    // The link text itself is unchanged.
    expect(html).toMatch(/>pogoji poslovanja<\/a>$/);
    const hint = renderToStaticMarkup(React.createElement(NewTabHint));
    expect(hint).toBe(`<span id="${NEW_TAB_HINT_ID}" hidden="">${common.actions.opensInNewTab}</span>`);
  });

  it("every legal link in the wizard uses it, and the wizard renders the hint", () => {
    const source = readFileSync(join(__dirname, "..", "..", "components", "storefront", "checkout", "CheckoutWizard.tsx"), "utf8");
    for (const marker of ["data-legal-privacy", "data-legal-terms", "data-legal-withdrawal"]) {
      expect(source).toMatch(new RegExp(`<LegalLink href=\\{legalLinks\\.\\w+\\} ${marker}>`));
      expect(source).not.toMatch(new RegExp(`<Link [^>]*${marker}`));
    }
    expect(source).toContain("<NewTabHint />");
  });
});

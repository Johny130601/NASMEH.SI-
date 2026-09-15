import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/(shell)/e-posta/actions", () => ({
  resetEmailTemplateAction: vi.fn(), saveEmailTemplateAction: vi.fn(), sendTestEmailAction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { buildEmailPreview } from "@/components/admin/EmailTemplateEditor";
import { renderSample } from "@/lib/email/templates/render";
import { EMAIL_TEMPLATE_DEFS } from "@/lib/email/template-defs";

/** The random legal-block marker differs per render; compare with it normalised. */
const stable = (html: string) => html.replace(/data-order-legal-[a-z0-9]+/g, "data-order-legal-x");

describe("admin e-mail template preview (X11 / U8 parity with the real render)", () => {
  it("shows the non-removable legal block after an override that leaves it out", () => {
    const preview = buildEmailPreview("orderConfirmation", "Hvala {{orderNumber}}", "<h1>Hvala</h1>");
    expect(preview.html).toContain("data-order-legal");
    expect(preview.html).toContain("Pogoji poslovanja");
    // delivery time is added by the block when the body leaves {{deliveryNote}} out
    expect(preview.html).toContain(EMAIL_TEMPLATE_DEFS.orderConfirmation.sample.estimate);
  });

  it("previews the sanitized body, as the mailer sends it", () => {
    const hostile = '<div style="display:none"><p>skrito</p></div><style>.x{}</style><script>alert(1)</script><!-- opomba --><p>Vidno</p>';
    const preview = buildEmailPreview("orderConfirmation", "Hvala", hostile);
    expect(preview.html).not.toMatch(/<script|<style[^>]*>\.x|display:\s*none|opomba/i);
    expect(preview.html).toContain("Vidno");
  });

  it.each(["orderConfirmation", "verifySubscription", "resetPassword"] as const)("matches renderSample for %s", (key) => {
    const def = EMAIL_TEMPLATE_DEFS[key];
    const preview = buildEmailPreview(key, def.defaultSubject, def.defaultBody);
    const sample = renderSample(key, null, null);
    expect(stable(preview.html)).toBe(stable(sample.html));
    expect(preview.subject.replace(/\s+/g, " ").trim()).toBe(sample.subject);
  });
});

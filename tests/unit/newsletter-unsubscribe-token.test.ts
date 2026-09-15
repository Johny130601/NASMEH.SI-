import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({ getSeoDefaults: async () => ({ titleTemplate: "%s", description: "", indexable: true }) }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));

import robots from "@/app/robots";
import {
  newsletterUnsubscribePath,
  signNewsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken,
} from "@/lib/newsletter/unsubscribe-token";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";

/** Phase 9 step 4 (GDPR Art. 7(3)): signed, purpose-separated newsletter withdrawal links. */

const id = "cmf0newslettersubscriber1";
const secret = "unit-newsletter-secret";

describe("newsletter unsubscribe tokens", () => {
  it("round-trips a subscriber id under a hyphen-joined, dot-free route path", () => {
    const token = signNewsletterUnsubscribeToken(id, secret);
    expect(token.startsWith(`${id}-`)).toBe(true);
    expect(verifyNewsletterUnsubscribeToken(token, secret)).toBe(id);
    // The middleware matcher skips dotted paths; this route keeps the CSP nonce and the maintenance gate.
    expect(newsletterUnsubscribePath(id, secret)).toBe(`/odjava-novice/${token}`);
    expect(newsletterUnsubscribePath(id, secret)).not.toContain(".");
  });

  it("rejects tampering, foreign secrets and malformed input", () => {
    const token = signNewsletterUnsubscribeToken(id, secret);
    const signature = token.slice(id.length + 1);
    const flipped = signature.endsWith("A") ? `${signature.slice(0, -1)}B` : `${signature.slice(0, -1)}A`;
    expect(verifyNewsletterUnsubscribeToken(`${id}-${flipped}`, secret)).toBeNull();
    expect(verifyNewsletterUnsubscribeToken(token, "other-secret")).toBeNull();
    expect(verifyNewsletterUnsubscribeToken(`${id}2-${signature}`, secret)).toBeNull();
    for (const bad of ["", "nohyphen", "-sig", `${id}-`, `${id}-short`, `${"x".repeat(200)}-${signature}`, null, undefined]) {
      expect(verifyNewsletterUnsubscribeToken(bad, secret)).toBeNull();
    }
  });

  it("never verifies a restock-alert token for the same id, nor the other way round", () => {
    const restock = signUnsubscribeToken(id, secret);
    const newsletter = signNewsletterUnsubscribeToken(id, secret);
    // Both now use the hyphen separator; the HMAC purpose alone keeps them apart.
    expect(verifyNewsletterUnsubscribeToken(restock, secret)).toBeNull();
    expect(verifyUnsubscribeToken(newsletter, secret)).toBeNull();
    expect(verifyUnsubscribeToken(newsletter.replace("-", "."), secret)).toBeNull();
  });

  it("refuses to sign anything that is not a subscriber id", () => {
    expect(() => signNewsletterUnsubscribeToken("../etc", secret)).toThrow();
    expect(() => signNewsletterUnsubscribeToken("", secret)).toThrow();
  });
});

describe("robots.txt keeps the signed token links out of crawlers (finding X1)", () => {
  it("disallows the confirm and withdraw routes of both stores", async () => {
    const rules = (await robots()).rules;
    const disallow = [rules].flat().flatMap((rule) => [rule.disallow ?? []].flat());
    for (const route of ["/potrdi", "/potrdi-zalogo", "/odjava-novice", "/odjava-zaloga"]) {
      expect(disallow).toContain(route);
    }
  });
});

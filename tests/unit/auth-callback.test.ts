import { describe, expect, it } from "vitest";
import { customerLanding, safeCallbackPath, signInPath, staffLanding } from "@/lib/auth-callback";

/** QA T3-F1: sign-in returns to the requested page, but only to a same-origin relative path. */
describe("safeCallbackPath", () => {
  it.each([
    ["/checkout", "/checkout"],
    ["/racun/narocilo/NS-2026-00012", "/racun/narocilo/NS-2026-00012"],
    ["/trgovina?kolekcija=paketi#top", "/trgovina?kolekcija=paketi#top"],
    [" /racun ", "/racun"],
    ["/admin/narocila", "/admin/narocila"],
    ["/racun/./narocilo/../podatki", "/racun/podatki"],
  ])("keeps %j", (raw, expected) => {
    expect(safeCallbackPath(raw)).toBe(expected);
  });

  it.each([
    "https://evil.example/racun",
    "//evil.example/racun",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "racun",
    "/racun\nSet-Cookie: x=1",
    "/prijava",
    "/prijava/naprej?callbackUrl=/racun",
    "/registracija",
    "/api/health",
    // dot segments that normalise into a protocol-relative "//host"
    "/.//evil.example",
    "/..//evil.example",
    "/%2e//evil.example",
    "/%2E%2E//evil.example/racun",
    "/a/..//evil.example",
    "/racun/../..//evil.example?x=1",
    "/./prijava",
    "/racun/../api/health",
    `/${"a".repeat(600)}`,
    "",
    null,
    undefined,
    42,
  ])("refuses %j", (raw) => {
    expect(safeCallbackPath(raw)).toBeNull();
  });
});

describe("landing after sign-in", () => {
  it("sends customers to the requested page, never into the admin", () => {
    expect(customerLanding("/checkout")).toBe("/checkout");
    expect(customerLanding(null)).toBe("/racun");
    expect(customerLanding("/admin/narocila")).toBe("/racun");
    expect(customerLanding("/admin")).toBe("/racun");
    expect(customerLanding("/administracija-ni")).toBe("/administracija-ni");
  });

  it("a signed-in visit with a dot-segment callback stays on the site", () => {
    expect(customerLanding(safeCallbackPath("/.//evil.example"))).toBe("/racun");
    expect(staffLanding(safeCallbackPath("/..//evil.example"))).toBe("/admin");
  });

  it("keeps staff in the admin", () => {
    expect(staffLanding("/admin/narocila?stanje=placano")).toBe("/admin/narocila?stanje=placano");
    expect(staffLanding("/checkout")).toBe("/admin");
    expect(staffLanding(null)).toBe("/admin");
  });
});

/** QA 2026-10-03 V2-02: a guard that refuses a session (revoked at sign-out elsewhere) returns the visitor where they were. */
describe("signInPath", () => {
  it("carries a same-site path and nothing else", () => {
    expect(signInPath("/racun")).toBe("/prijava?callbackUrl=%2Fracun");
    expect(signInPath("/admin/narocila?stanje=placano")).toBe("/prijava?callbackUrl=%2Fadmin%2Fnarocila%3Fstanje%3Dplacano");
    for (const unsafe of ["//evil.example", "https://evil.example/x", "/prijava", "", null, undefined]) expect(signInPath(unsafe)).toBe("/prijava");
  });
});

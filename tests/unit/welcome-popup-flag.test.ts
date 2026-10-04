import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIES } from "@/lib/copy/cmp";
import { markWelcomeSeen, WELCOME_SEEN_KEY, welcomeSeenThisSession } from "@/lib/welcome-popup-flag";

/**
 * A `document.cookie` stand-in (the unit environment is node, which has none):
 * reading lists the jar, writing stores one `name=value` and keeps the raw
 * assignment so its attributes can be checked.
 */
function cookieDocument(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    jar,
    writes,
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(assignment: string) {
      writes.push(assignment);
      const [pair] = assignment.split(";");
      const separator = pair.indexOf("=");
      jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("welcome popup session flag (QA T7-F14, QA 2026-10-03 T1-07)", () => {
  it("is the cookie the cookie table lists, and the table calls it a session cookie", () => {
    expect(WELCOME_SEEN_KEY).toBe("nasmeh_welcome_seen");
    const row = COOKIES.find((cookie) => cookie.name === WELCOME_SEEN_KEY);
    expect(row).toMatchObject({ provider: "Nasmeh.si", category: "necessary", duration: "seja" });
    expect(row!.purpose).not.toMatch(/sessionStorage|zavihka/);
  });

  it("reads as not seen until something marks it, then as seen — in every tab, since tabs share cookies", () => {
    const doc = cookieDocument({ nasmeh_cart: "abc" });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("location", { protocol: "http:" });
    expect(welcomeSeenThisSession()).toBe(false);
    markWelcomeSeen();
    expect(welcomeSeenThisSession()).toBe(true);
    // a session cookie for the whole site: no Max-Age, no Expires
    expect(doc.writes).toEqual([`${WELCOME_SEEN_KEY}=1; Path=/; SameSite=Lax`]);
    // only that cookie is written; the others are left as they were
    expect([...doc.jar.keys()]).toEqual(["nasmeh_cart", WELCOME_SEEN_KEY]);
  });

  it("is Secure over https", () => {
    const doc = cookieDocument();
    vi.stubGlobal("document", doc);
    vi.stubGlobal("location", { protocol: "https:" });
    markWelcomeSeen();
    expect(doc.writes).toEqual([`${WELCOME_SEEN_KEY}=1; Path=/; SameSite=Lax; Secure`]);
  });

  it("matches the cookie by its exact name", () => {
    vi.stubGlobal("document", cookieDocument({ [`${WELCOME_SEEN_KEY}_old`]: "1", [`x${WELCOME_SEEN_KEY}`]: "1" }));
    expect(welcomeSeenThisSession()).toBe(false);
  });

  it("treats a missing document or blocked cookies as not seen and never throws", () => {
    vi.stubGlobal("document", undefined);
    expect(welcomeSeenThisSession()).toBe(false);
    expect(() => markWelcomeSeen()).not.toThrow();

    vi.stubGlobal("document", {
      get cookie(): string { throw new DOMException("blocked", "SecurityError"); },
      set cookie(value: string) { throw new DOMException(`blocked: ${value}`, "SecurityError"); },
    });
    expect(welcomeSeenThisSession()).toBe(false);
    expect(() => markWelcomeSeen()).not.toThrow();
  });
});

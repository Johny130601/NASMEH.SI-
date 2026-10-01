import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIES } from "@/lib/copy/cmp";
import { markWelcomeSeen, WELCOME_SEEN_KEY, welcomeSeenThisSession } from "@/lib/welcome-popup-flag";

/** A sessionStorage stand-in (the unit environment is node, which has none). */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("welcome popup session flag (QA T7-F14)", () => {
  it("is the sessionStorage key the cookie table lists, not a new one", () => {
    expect(WELCOME_SEEN_KEY).toBe("nasmeh_welcome_seen");
    expect(COOKIES.map((row) => row.name)).toContain(WELCOME_SEEN_KEY);
  });

  it("reads as not seen until something marks it, then as seen for the rest of the session", () => {
    const storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    expect(welcomeSeenThisSession()).toBe(false);
    markWelcomeSeen();
    expect(storage.values.get(WELCOME_SEEN_KEY)).toBe("1");
    expect(welcomeSeenThisSession()).toBe(true);
    // Only that key is written: nothing else lands in the visitor's storage.
    expect([...storage.values.keys()]).toEqual([WELCOME_SEEN_KEY]);
  });

  it("treats missing or blocked storage as not seen and never throws", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(welcomeSeenThisSession()).toBe(false);
    expect(() => markWelcomeSeen()).not.toThrow();

    vi.stubGlobal("sessionStorage", {
      getItem: () => { throw new DOMException("blocked", "SecurityError"); },
      setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
    });
    expect(welcomeSeenThisSession()).toBe(false);
    expect(() => markWelcomeSeen()).not.toThrow();
  });
});

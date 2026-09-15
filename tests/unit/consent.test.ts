import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  headerGet: vi.fn(),
  auth: vi.fn(),
  getConsentConfig: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { consentLog: { create: mocks.create, findFirst: mocks.findFirst } } }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/settings", () => ({ getConsentConfig: mocks.getConsentConfig }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }),
  headers: async () => ({ get: mocks.headerGet }),
}));

import { saveConsentAction } from "@/app/(storefront)/actions/consent";
import { PRE_AUTH_COOKIE } from "@/lib/admin/pre-auth";
import { GUEST_CART_COOKIE } from "@/lib/cart/codec";
import {
  clientConsent,
  CONSENT_ALL_ACCEPTED,
  CONSENT_ALL_DENIED,
  CONSENT_COOKIE,
  consentIdFromCookie,
  consentModeSnippet,
  decodeConsentCookie,
  encodeConsentCookie,
  parseConsent,
  serializeConsent,
  storedCategoriesFromCookie,
  withdrawalCookiePatterns,
  withdrawsConsent,
} from "@/lib/consent";
import { trackerCookieExpiry } from "@/lib/analytics";
import { cmp, CONSENT_CLEAR_COOKIES, COOKIES } from "@/lib/copy/cmp";
import { KODA_COOKIE } from "@/lib/koda";
import { MAINTENANCE_COOKIE } from "@/lib/maintenance";
import { orderAccessCookieName } from "@/lib/orders/access-token";
import { __resetRateLimits } from "@/lib/rate-limit";
import { consentCookiesSchema } from "@/lib/settings-schemas";

const ID = "3b241101-e2bb-4255-8caf-4136c566a962";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("consent serialize/parse", () => {
  it("round-trips a valid choice", () => {
    const raw = serializeConsent(CONSENT_ALL_ACCEPTED, 1757400000000);
    const parsed = parseConsent(raw);
    expect(parsed).toEqual({
      v: 1,
      necessary: true,
      analytics: true,
      marketing: true,
      ts: 1757400000000,
    });
  });

  it("round-trips all-denied", () => {
    const raw = serializeConsent(CONSENT_ALL_DENIED, 1757400000000);
    expect(parseConsent(raw)).toMatchObject({
      analytics: false,
      marketing: false,
    });
  });

  it("carries the random consent id, and cookies written before the id still parse", () => {
    expect(parseConsent(serializeConsent({ ...CONSENT_ALL_ACCEPTED, id: ID }, 1))).toMatchObject({ id: ID, analytics: true });
    const legacy = JSON.stringify({ v: 1, necessary: true, analytics: true, marketing: false, ts: 1 });
    expect(parseConsent(legacy)).toEqual({ v: 1, necessary: true, analytics: true, marketing: false, ts: 1 });
  });

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["not json", "not-json{"],
    ["wrong shape", JSON.stringify({ hello: "world" })],
    ["wrong version", JSON.stringify({ v: 2, necessary: true, analytics: true, marketing: false, ts: 1 })],
    ["necessary false", JSON.stringify({ v: 1, necessary: false, analytics: true, marketing: false, ts: 1 })],
    ["missing ts", JSON.stringify({ v: 1, necessary: true, analytics: true, marketing: false })],
    ["a malformed id", JSON.stringify({ v: 1, necessary: true, analytics: true, marketing: false, ts: 1, id: "x" })],
  ])("returns null for %s", (_label, raw) => {
    expect(parseConsent(raw)).toBeNull();
  });
});

describe("consent cookie wire codec (base64url)", () => {
  it("encode → decode → parse round-trip", () => {
    const json = serializeConsent(CONSENT_ALL_ACCEPTED, 1757400000000);
    const wire = encodeConsentCookie(json);
    expect(wire).not.toContain("{");
    expect(wire).not.toContain(",");
    expect(parseConsent(decodeConsentCookie(wire))).toMatchObject({
      analytics: true,
      marketing: true,
    });
  });

  it("decode returns null for garbage", () => {
    expect(decodeConsentCookie(null)).toBeNull();
  });
});

describe("consent id and the client view", () => {
  it("reads the id of a stored cookie whatever its version, null without one", () => {
    const oldVersion = encodeConsentCookie(serializeConsent({ ...CONSENT_ALL_DENIED, v: 7, id: ID }, 1));
    expect(consentIdFromCookie(oldVersion)).toBe(ID);
    expect(consentIdFromCookie(encodeConsentCookie(serializeConsent(CONSENT_ALL_DENIED, 1)))).toBeNull();
    expect(consentIdFromCookie(encodeConsentCookie('{"id":"not-a-uuid"}'))).toBeNull();
    expect(consentIdFromCookie("%%%")).toBeNull();
    expect(consentIdFromCookie(undefined)).toBeNull();
  });

  it("never hands the id to client components", () => {
    const stored = parseConsent(serializeConsent({ ...CONSENT_ALL_ACCEPTED, id: ID }, 5));
    expect(clientConsent(stored)).toEqual({ v: 1, necessary: true, analytics: true, marketing: true, ts: 5 });
    expect(clientConsent(null)).toBeNull();
  });
});

/** Runs the inline snippet the way the browser does and returns what it left behind. */
function runSnippet(source: string) {
  const sandbox = createContext({}) as { window?: unknown; dataLayer?: unknown[]; __nasmehConsent?: unknown };
  sandbox.window = sandbox;
  runInContext(source, sandbox);
  const entries = (sandbox.dataLayer ?? []).map((entry) =>
    // gtag() pushes its `arguments` object; plain objects are pushed as they are
    JSON.parse(JSON.stringify(typeof entry === "object" && entry !== null && "length" in entry ? Array.from(entry as ArrayLike<unknown>) : entry)));
  return { entries, mirror: sandbox.__nasmehConsent === undefined ? undefined : JSON.parse(JSON.stringify(sandbox.__nasmehConsent)) };
}

describe("Consent Mode snippet (server-rendered, nonce'd)", () => {
  const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };

  it("without a stored choice sets only the all-denied default", () => {
    const { entries, mirror } = runSnippet(consentModeSnippet(null));
    expect(entries).toEqual([["consent", "default", { ...denied, wait_for_update: 500 }]]);
    expect(mirror).toBeUndefined();
  });

  it("keeps the default and then applies a stored choice before anything else runs", () => {
    const { entries, mirror } = runSnippet(consentModeSnippet({ analytics: true, marketing: false }));
    expect(entries).toEqual([
      ["consent", "default", { ...denied, wait_for_update: 500 }],
      ["consent", "update", { ...denied, analytics_storage: "granted" }],
      { event: "nasmeh_consent", analytics: true, marketing: false },
    ]);
    expect(mirror).toEqual({ analytics: true, marketing: false });
    expect(runSnippet(consentModeSnippet({ analytics: false, marketing: true })).entries[1])
      .toEqual(["consent", "update", { analytics_storage: "denied", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" }]);
  });

  it("emits booleans only, whatever reaches it at runtime", () => {
    const hostile = { analytics: "');alert(1);//", marketing: 1 } as unknown as { analytics: boolean; marketing: boolean };
    const source = consentModeSnippet(hostile);
    expect(source).not.toContain("alert");
    expect(runSnippet(source).mirror).toEqual({ analytics: false, marketing: false });
  });
});

describe("saveConsentAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetRateLimits();
    mocks.headerGet.mockImplementation((name: string) => (name === "x-forwarded-for" ? "203.0.113.7" : null));
    mocks.getConsentConfig.mockResolvedValue({ version: 3, cookies: COOKIES, banner: { title: "", body: "" } });
    mocks.auth.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "log-1" });
    mocks.cookieGet.mockReturnValue(undefined);
  });

  function grantCookie() {
    return encodeConsentCookie(serializeConsent({ ...CONSENT_ALL_ACCEPTED, id: ID }, 1));
  }

  async function exhaustLimit() {
    for (let index = 0; index < 120; index += 1) await saveConsentAction({ analytics: false, marketing: false });
    expect(mocks.create).toHaveBeenCalledTimes(120);
    mocks.create.mockClear();
    mocks.cookieSet.mockClear();
  }

  function storedCookie() {
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
    const [name, wire, options] = mocks.cookieSet.mock.calls[0];
    return { name, payload: JSON.parse(decodeConsentCookie(wire)!), options };
  }

  it("writes the ConsentLog row first, then the cookie with the same id, version and timestamp", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    expect(await saveConsentAction({ analytics: true, marketing: false })).toMatchObject({ ok: true });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const { data } = mocks.create.mock.calls[0][0];
    expect(data).toMatchObject({ kind: "cookie", version: "3", userId: "user-1", choices: { analytics: true, marketing: false } });
    expect(data.visitorId).toMatch(UUID);
    expect(data).not.toHaveProperty("ip");

    const cookie = storedCookie();
    expect(cookie.name).toBe(CONSENT_COOKIE);
    expect(cookie.payload).toEqual({ v: 3, necessary: true, analytics: true, marketing: false, id: data.visitorId, ts: data.choices.ts });
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.cookieSet.mock.invocationCallOrder[0]);
  });

  it("reuses the id of the browser's earlier choice, so a withdrawal chains to the consent", async () => {
    mocks.cookieGet.mockReturnValue({ value: encodeConsentCookie(serializeConsent({ ...CONSENT_ALL_ACCEPTED, id: ID }, 1)) });
    expect(await saveConsentAction({ analytics: false, marketing: false })).toMatchObject({ ok: true });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ visitorId: ID, userId: null, choices: { analytics: false, marketing: false } });
    expect(storedCookie().payload.id).toBe(ID);
  });

  it("logs without a user when the session lookup fails", async () => {
    mocks.auth.mockRejectedValue(new Error("jwt"));
    expect(await saveConsentAction({ analytics: true, marketing: true })).toMatchObject({ ok: true });
    expect(mocks.create.mock.calls[0][0].data.userId).toBeNull();
  });

  it("stores no grant without its log row, but never blocks a first refusal", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.create.mockRejectedValue(new Error("db down"));
    expect(await saveConsentAction({ analytics: true, marketing: false })).toEqual({ ok: false });
    expect(mocks.cookieSet).not.toHaveBeenCalled();

    expect(await saveConsentAction({ analytics: false, marketing: false })).toMatchObject({ ok: true });
    expect(storedCookie().payload).toMatchObject({ analytics: false, marketing: false });
    error.mockRestore();
  });

  it("never stores a withdrawal without its log row: a failed write keeps the grant cookie and answers ok:false", async () => {
    // Review finding U2: the log must not end on a grant the visitor took back.
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.cookieGet.mockReturnValue({ value: grantCookie() });
    mocks.create.mockRejectedValue(new Error("db down"));
    expect(await saveConsentAction({ analytics: false, marketing: false })).toEqual({ ok: false });
    expect(await saveConsentAction({ analytics: false, marketing: true })).toEqual({ ok: false });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("refuses invalid input before touching the log or the cookie", async () => {
    expect(await saveConsentAction({ analytics: "yes", marketing: false } as never)).toEqual({ ok: false });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("bounds log writes per client: over the limit a grant is refused and a first refusal is stored without a row", async () => {
    await exhaustLimit();

    expect(await saveConsentAction({ analytics: true, marketing: true })).toEqual({ ok: false });
    expect(await saveConsentAction({ analytics: false, marketing: false })).toMatchObject({ ok: true });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(storedCookie().payload).toMatchObject({ analytics: false, marketing: false });

    mocks.headerGet.mockImplementation((name: string) => (name === "x-forwarded-for" ? "198.51.100.2" : null));
    expect(await saveConsentAction({ analytics: true, marketing: true })).toMatchObject({ ok: true });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("exempts a withdrawal of a logged grant from the rate limit, partial or full (finding U2)", async () => {
    await exhaustLimit();
    mocks.cookieGet.mockReturnValue({ value: grantCookie() });
    mocks.findFirst.mockResolvedValue({ choices: { analytics: true, marketing: true, ts: 1 } });

    expect(await saveConsentAction({ analytics: false, marketing: true })).toMatchObject({ ok: true });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { visitorId: ID, kind: "cookie" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { choices: true },
    });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ visitorId: ID, choices: { analytics: false, marketing: true } });
    expect(storedCookie().payload).toMatchObject({ id: ID, analytics: false, marketing: true });

    mocks.cookieSet.mockClear();
    expect(await saveConsentAction({ analytics: false, marketing: false })).toMatchObject({ ok: true });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(storedCookie().payload).toMatchObject({ analytics: false, marketing: false });
  });

  it("over the limit a forged grant cookie buys no row: a refusal is stored without one, a partial change is refused", async () => {
    await exhaustLimit();
    mocks.cookieGet.mockReturnValue({ value: grantCookie() });
    // The newest logged row for this id is already a refusal, or there is none at all.
    mocks.findFirst.mockResolvedValue({ choices: { analytics: false, marketing: false, ts: 1 } });
    expect(await saveConsentAction({ analytics: false, marketing: false })).toMatchObject({ ok: true });
    mocks.findFirst.mockResolvedValue(null);
    expect(await saveConsentAction({ analytics: true, marketing: false })).toEqual({ ok: false });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(storedCookie().payload).toMatchObject({ analytics: false, marketing: false });
  });

  it("refuses a withdrawal over the limit when the log cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await exhaustLimit();
    mocks.cookieGet.mockReturnValue({ value: grantCookie() });
    mocks.findFirst.mockRejectedValue(new Error("db down"));
    expect(await saveConsentAction({ analytics: false, marketing: false })).toEqual({ ok: false });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("returns the cookies to expire for the denied categories, live table rows included (finding U1)", async () => {
    const tiktok = { name: "_tt_enable_cookie, ttcsid*", provider: "TikTok", purpose: "Oglasi.", duration: "13 mesecev", category: "marketing" as const };
    mocks.getConsentConfig.mockResolvedValue({ version: 3, cookies: [...COOKIES, tiktok], banner: { title: "", body: "" } });
    const result = await saveConsentAction({ analytics: true, marketing: false });
    if (!result.ok) throw new Error("save failed");
    expect(result.clearCookies).toEqual(expect.arrayContaining([...CONSENT_CLEAR_COOKIES.marketing, "_tt_enable_cookie", "ttcsid*"]));
    expect(result.clearCookies.some((pattern) => pattern.startsWith("_ga"))).toBe(false);
  });
});

describe("withdrawal detection and the cookies a save expires", () => {
  it("reads the stored categories whatever the version, and spots a withdrawal of any granted category", () => {
    const oldVersion = encodeConsentCookie(serializeConsent({ ...CONSENT_ALL_ACCEPTED, v: 9 }, 1));
    expect(storedCategoriesFromCookie(oldVersion)).toEqual({ analytics: true, marketing: true });
    expect(storedCategoriesFromCookie("%%%")).toBeNull();
    expect(storedCategoriesFromCookie(encodeConsentCookie('{"analytics":"yes","marketing":true}'))).toBeNull();
    expect(storedCategoriesFromCookie(undefined)).toBeNull();

    expect(withdrawsConsent({ analytics: true, marketing: false }, { analytics: false, marketing: true })).toBe(true);
    expect(withdrawsConsent({ analytics: false, marketing: true }, { analytics: false, marketing: false })).toBe(true);
    expect(withdrawsConsent({ analytics: false, marketing: false }, { analytics: false, marketing: false })).toBe(false);
    expect(withdrawsConsent({ analytics: true, marketing: false }, { analytics: true, marketing: true })).toBe(false);
    expect(withdrawsConsent(null, { analytics: false, marketing: false })).toBe(false);
  });

  it("expires the fixed list plus the live rows of each denied category, and nothing for a full grant", () => {
    const live = [
      ...COOKIES,
      { name: "_clck, _clsk", provider: "Microsoft Clarity", purpose: "x", duration: "1 leto", category: "analytics" as const },
      { name: "_tt_enable_cookie, ttcsid*", provider: "TikTok", purpose: "x", duration: "13 mesecev", category: "marketing" as const },
    ];
    expect(withdrawalCookiePatterns({ analytics: true, marketing: true }, live)).toEqual([]);
    expect(withdrawalCookiePatterns({ analytics: false, marketing: true }, live))
      .toEqual([...CONSENT_CLEAR_COOKIES.analytics, "_clck", "_clsk"]);
    const both = withdrawalCookiePatterns({ analytics: false, marketing: false }, live);
    expect(both).toEqual(expect.arrayContaining(["_ga_*", "_fbp", "_clck", "_tt_enable_cookie", "ttcsid*"]));
    expect(new Set(both).size).toBe(both.length);
  });

  it("never lets a mis-filed live row expire a necessary cookie or anything that is not a plain name", () => {
    const live = [
      ...COOKIES,
      { name: "nasmeh_*, nasmeh_cart, __Secure-authjs.session-token", provider: "x", purpose: "x", duration: "x", category: "analytics" as const },
      { name: "*, _*, Google Ads (več piškotkov), a;b", provider: "x", purpose: "x", duration: "x", category: "marketing" as const },
      { name: "shop_session", provider: "x", purpose: "x", duration: "x", category: "necessary" as const },
      { name: "shop_*", provider: "x", purpose: "x", duration: "x", category: "marketing" as const },
    ];
    const patterns = withdrawalCookiePatterns({ analytics: false, marketing: false }, live);
    expect(patterns).toEqual([...CONSENT_CLEAR_COOKIES.analytics, ...CONSENT_CLEAR_COOKIES.marketing]);
    const documentCookie = "nasmeh_cart=1; nasmeh_consent=2; shop_session=3; __Secure-authjs.session-token=4; _ga=5; _ga_ABC=6";
    expect(trackerCookieExpiry(documentCookie, patterns, "nasmeh.si").names).toEqual(["_ga", "_ga_ABC"]);
  });
});

describe("cookie table (ZEKom-2 Art. 225 information)", () => {
  const names = COOKIES.map((row) => row.name);
  const covers = (pattern: string, name: string) =>
    pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name;

  it("lists every cookie and storage key the code sets", () => {
    for (const constant of [CONSENT_COOKIE, GUEST_CART_COOKIE, KODA_COOKIE, PRE_AUTH_COOKIE, MAINTENANCE_COOKIE, "nasmeh_welcome_seen"]) {
      expect(names).toContain(constant);
    }
    expect(names.some((name) => covers(name, orderAccessCookieName("NS-2026-0001")))).toBe(true);
    // Auth.js names as issued over https (AUTH_URL is https in production)
    for (const authName of ["__Secure-authjs.session-token", "__Host-authjs.csrf-token", "__Secure-authjs.callback-url"]) {
      expect(names).toContain(authName);
    }
    for (const provider of ["Stripe", "PayPal", "Cloudflare"]) {
      expect(COOKIES.some((row) => row.provider === provider && row.category === "necessary")).toBe(true);
    }
  });

  it("is a valid consent.cookies value, and duplicate names are refused", () => {
    expect(consentCookiesSchema.safeParse(COOKIES).success).toBe(true);
    const parsed = consentCookiesSchema.safeParse([COOKIES[0], { ...COOKIES[1], name: COOKIES[0].name }]);
    expect(parsed.success).toBe(false);
  });

  it("clears every optional cookie it lists when that category is withdrawn", () => {
    for (const row of COOKIES.filter((cookie) => cookie.category !== "necessary")) {
      const patterns: readonly string[] = CONSENT_CLEAR_COOKIES[row.category as "analytics" | "marketing"];
      for (const name of row.name.split(",").map((part) => part.trim())) {
        expect(patterns.some((pattern) => covers(pattern, name.replace(/\*$/, "x")))).toBe(true);
      }
    }
    // nothing necessary is ever expired by a withdrawal
    for (const pattern of [...CONSENT_CLEAR_COOKIES.analytics, ...CONSENT_CLEAR_COOKIES.marketing]) {
      expect(names.filter((name) => COOKIES.find((row) => row.name === name)!.category === "necessary").some((name) => covers(pattern, name))).toBe(false);
    }
  });

  it("shows each row's category on the policy page", () => {
    expect(cmp.policy.columns).toContain("Kategorija");
    for (const row of COOKIES) expect(cmp.categories[row.category].label.length).toBeGreaterThan(0);
  });

  it("the data migration carries exactly COOKIES and only replaces the untouched phase 7 default", () => {
    const migrations = join(__dirname, "..", "..", "prisma", "migrations");
    const phase7 = readFileSync(join(migrations, "20260911120000_phase7_settings", "migration.sql"), "utf8");
    const phase9 = readFileSync(join(migrations, "20260913100000_phase9_cookie_table", "migration.sql"), "utf8");
    const phase7Default = JSON.parse(/\('consent\.cookies', '(\[[\s\S]*?\])'::jsonb/.exec(phase7)![1]);
    const [, next, guard] = /SET "value" = '(\[[\s\S]*?\])'::jsonb[\s\S]*?AND "value" = '(\[[\s\S]*?\])'::jsonb;/.exec(phase9)!;
    expect(JSON.parse(next)).toEqual(COOKIES);
    expect(JSON.parse(guard)).toEqual(phase7Default);
    expect(phase9).toContain(`WHERE "key" = 'consent.cookies'`);
  });
});

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { MAINTENANCE_PASSWORD, dismissCookieBanner, prisma, setMaintenanceEnabled } from "./helpers";

/** Phase 9 step 1: no-JavaScript login (B14), security headers with a nonce-based CSP, the report sink, login and /koda limits. */

const PASSWORD = "Hardening123!";

test.afterAll(async () => { await prisma.$disconnect(); });

async function customer(key: string) {
  return prisma.user.create({ data: { email: `hardening-${key}@test.si`, name: "Utrjevanje Test", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(PASSWORD, 4) } });
}

test("the login form works without JavaScript: a wrong password shows the error, the right one reaches the account", async ({ browser }) => {
  const key = randomUUID().slice(0, 8);
  const user = await customer(key);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/prijava");
    const form = page.locator("[data-login-form]");
    await form.getByLabel("E-pošta").fill(user.email);
    await form.getByLabel("Geslo", { exact: true }).fill("napacno-geslo");
    await form.getByLabel("Geslo", { exact: true }).press("Enter"); // native submit, no script
    await page.waitForURL(/\/prijava\?error=credentials/);
    await expect(page.locator("p[role='alert']")).toContainText("Napačna e-pošta ali geslo.");
    await form.getByLabel("E-pošta").fill(user.email);
    await form.getByLabel("Geslo", { exact: true }).fill(PASSWORD);
    await form.getByLabel("Geslo", { exact: true }).press("Enter");
    await page.waitForURL(/\/racun$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await context.close();
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

// The CSP ships report-only until a real-traffic pass stays clean, then CSP_ENFORCE=true enforces the same
// policy without a rebuild (Phase 9 step 1). The suite runs against either mode: the header name follows the switch.
const CSP_HEADER = process.env.CSP_ENFORCE === "true" ? "content-security-policy" : "content-security-policy-report-only";
const OTHER_CSP_HEADER = process.env.CSP_ENFORCE === "true" ? "content-security-policy-report-only" : "content-security-policy";

test("every page carries the static headers and a nonce-based CSP (report-only or enforced per CSP_ENFORCE) that its inline scripts honour; API responses carry the static headers", async ({ page, request }) => {
  const violations: string[] = [];
  page.on("console", (message) => { if (/content security policy|csp/i.test(message.text())) violations.push(message.text()); });
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  const csp = headers[CSP_HEADER];
  expect(csp).toBeDefined();
  expect(headers[OTHER_CSP_HEADER]).toBeUndefined();
  const nonce = /'nonce-([^']+)'/.exec(csp!)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("report-uri /api/csp-report");
  const html = await response!.text();
  expect(html).toContain(`<script id="consent-defaults" nonce="${nonce}"`);
  await dismissCookieBanner(page);
  await expect(page.locator("[data-cart-link]")).toBeVisible(); // hydration ran under the policy
  const second = await page.goto("/trgovina");
  expect(/'nonce-([^']+)'/.exec(second!.headers()[CSP_HEADER])?.[1]).not.toBe(nonce);
  // The middleware itself (not only the page guards) turns anonymous staff and account requests away, with the callback URL.
  for (const path of ["/admin", "/admin/narocila", "/racun"]) {
    const gate = await request.get(path, { maxRedirects: 0 });
    expect(gate.status(), path).toBe(307);
    // A relative Location (same origin as whatever the browser used) with a relative callback path: an absolute one on the
    // server's internal origin is cross-origin for the browser, and an RSC prefetch following it trips connect-src (F7).
    expect(gate.headers()["location"], path).toBe(`/prijava?callbackUrl=${encodeURIComponent(path)}`);
    expect(gate.headers()[CSP_HEADER], path).toContain("'nonce-");
  }
  const api = await request.get("/api/health");
  expect(api.headers()["x-content-type-options"]).toBe("nosniff");
  expect(api.headers()["x-frame-options"]).toBe("DENY");
  expect(violations, violations.join(" | ")).toEqual([]); // a report-only policy still logs to the console
});

test("a deep unknown path — the shape of a bot probe — serves the 404 with the request's nonce and hydrates", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => { if (/content security policy|csp/i.test(message.text())) violations.push(message.text()); });
  // Two segments or more match no route and no storefront layout: this is the GLOBAL
  // not-found. Prerendered, its script tags carry no nonce and 'strict-dynamic' refuses
  // every one of them — no hydration and one [csp] report per tag, the very signal the
  // enforced policy is judged by (go-live row E2).
  const response = await page.goto("/ni-take-strani/sploh-ne");
  expect(response!.status()).toBe(404);
  const csp = response!.headers()[CSP_HEADER];
  const nonce = /'nonce-([^']+)'/.exec(csp!)?.[1];
  expect(nonce).toBeTruthy();
  const html = await response!.text();
  expect(html).toContain(`nonce="${nonce}"`);
  expect(html).not.toMatch(/<script(?![^>]*\bnonce=)[^>]*\bsrc=/); // every script is nonced
  await expect(page.locator("[data-countdown]")).not.toHaveText("10", { timeout: 5_000 }); // the counter ticks down: hydration ran under the policy
  expect(violations, violations.join(" | ")).toEqual([]);
});

test("a locked store refuses Server Actions on every gated path: the gate keeps its own address and the unlock still works", async ({ page, request }) => {
  await setMaintenanceEnabled(true);
  try {
    const gate = await request.get("/trgovina", { maxRedirects: 0 });
    expect(gate.status()).toBe(307);
    expect(gate.headers()["location"]).toContain("/vzdrzevanje?od=%2Ftrgovina");
    // A rewrite left the gate on /trgovina, and a POST carrying a Next-Action id is
    // dispatched from the action manifest whatever the path: add-to-cart, the checkout
    // capture and place-order stayed callable behind the wall. The redirect shrinks that
    // POST surface to ALLOWED_WHEN_LOCKED — the paths that must keep working while
    // locked — which is as far as the middleware can go: only the action id says which
    // action runs, and it cannot resolve it.
    const action = await request.post("/trgovina", {
      headers: { "next-action": "0".repeat(40), "content-type": "text/plain;charset=UTF-8" },
      data: "[]",
      maxRedirects: 0,
    });
    expect(action.status()).toBe(503);
    // …while the gate's own unlock posts to /vzdrzevanje, which the allow-list lets through.
    await page.goto("/trgovina");
    await expect(page).toHaveURL(/\/vzdrzevanje\?od=/);
    await page.getByLabel("Geslo za dostop").fill(MAINTENANCE_PASSWORD);
    await page.getByRole("button", { name: "Vstopi" }).click();
    await expect(page.getByRole("heading", { name: "Trgovina se pripravlja" })).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("[data-cart-link]")).toBeVisible();
  } finally {
    await setMaintenanceEnabled(false);
  }
});

test("the CSP report sink accepts browser reports and refuses junk", async ({ request }) => {
  const ok = await request.post("/api/csp-report", { headers: { "content-type": "application/csp-report" }, data: JSON.stringify({ "csp-report": { "document-uri": "http://127.0.0.1:4317/", "effective-directive": "script-src", "blocked-uri": "inline" } }) });
  expect(ok.status()).toBe(204);
  const junk = await request.post("/api/csp-report", { headers: { "content-type": "application/csp-report" }, data: "not json" });
  expect(junk.status()).toBe(400);
});

test("password attempts are bounded per address and coupon-link lookups per client", async ({ page, request }) => {
  const key = randomUUID().slice(0, 8);
  const user = await customer(key);
  try {
    await page.goto("/prijava");
    await dismissCookieBanner(page);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt > 0) await page.goto("/prijava"); // a fresh URL, so the next redirect is a real navigation to wait for
      const form = page.locator("[data-login-form]");
      await form.getByLabel("E-pošta").fill(user.email);
      await form.getByLabel("Geslo", { exact: true }).fill(`napacno-${attempt}`);
      await form.getByRole("button", { name: "Prijava", exact: true }).click();
      await page.waitForURL(/\/prijava\?error=credentials/);
    }
    await page.goto("/prijava");
    const form = page.locator("[data-login-form]");
    await form.getByLabel("E-pošta").fill(user.email);
    await form.getByLabel("Geslo", { exact: true }).fill(PASSWORD); // right password, but the address is over its limit
    await form.getByRole("button", { name: "Prijava", exact: true }).click();
    await page.waitForURL(/\/prijava\?error=rate_limited/);
    await expect(page.locator("p[role='alert']")).toContainText("Preveč poskusov prijave"); // p, not the route announcer

    // /koda: a distinct client (own forwarded address) gets 30 lookups, then 429 with Retry-After; the suite's own client is untouched.
    const ip = `203.0.113.${1 + (parseInt(key.slice(0, 2), 16) % 250)}`;
    for (let index = 0; index < 30; index += 1) {
      const hop = await request.get(`/koda/NEOBSTOJECA${index}`, { headers: { "x-forwarded-for": ip }, maxRedirects: 0 });
      expect(hop.status()).toBeGreaterThanOrEqual(300);
      expect(hop.status()).toBeLessThan(400);
    }
    const blocked = await request.get("/koda/NEOBSTOJECA31", { headers: { "x-forwarded-for": ip }, maxRedirects: 0 });
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
    const other = await request.get("/koda/TEST10", { maxRedirects: 0 });
    expect(other.status()).toBeGreaterThanOrEqual(300);
    expect(other.status()).toBeLessThan(400);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

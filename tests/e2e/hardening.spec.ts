import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { dismissCookieBanner, prisma } from "./helpers";

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

test("every page carries the static headers and a nonce-based report-only CSP that its inline scripts honour; API responses carry the static headers", async ({ page, request }) => {
  const violations: string[] = [];
  page.on("console", (message) => { if (/content security policy|csp/i.test(message.text())) violations.push(message.text()); });
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  const csp = headers["content-security-policy-report-only"];
  expect(csp).toBeDefined();
  expect(headers["content-security-policy"]).toBeUndefined();
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
  expect(/'nonce-([^']+)'/.exec(second!.headers()["content-security-policy-report-only"])?.[1]).not.toBe(nonce);
  // The middleware itself (not only the page guards) turns anonymous staff and account requests away, with the callback URL.
  for (const path of ["/admin", "/admin/narocila", "/racun"]) {
    const gate = await request.get(path, { maxRedirects: 0 });
    expect(gate.status(), path).toBe(307);
    // A relative Location (same origin as whatever the browser used) with a relative callback path: an absolute one on the
    // server's internal origin is cross-origin for the browser, and an RSC prefetch following it trips connect-src (F7).
    expect(gate.headers()["location"], path).toBe(`/prijava?callbackUrl=${encodeURIComponent(path)}`);
    expect(gate.headers()["content-security-policy-report-only"], path).toContain("'nonce-");
  }
  const api = await request.get("/api/health");
  expect(api.headers()["x-content-type-options"]).toBe("nosniff");
  expect(api.headers()["x-frame-options"]).toBe("DENY");
  expect(violations, violations.join(" | ")).toEqual([]); // a report-only policy still logs to the console
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

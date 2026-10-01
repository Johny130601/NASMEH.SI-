import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { MAILPIT_URL, prisma } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ trace: "retain-on-failure" });
const emails: string[] = [];
function newEmail(prefix: string) { const email = `${prefix}-${randomUUID()}@test.si`; emails.push(email); return email; }
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) await banner.getByRole("button", { name: "Zavrni" }).click();
}
async function registerViaUi(page: Page, email: string, password: string, marketing = false, name = "Test") {
  await page.goto("/registracija"); await dismissCmp(page);
  await page.getByLabel("Ime", { exact: true }).fill(name);
  await page.getByLabel("Priimek").fill("Uporabnik");
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.getByLabel(/Geslo/).fill(password);
  await expect(page.locator("[data-marketing-optin]")).not.toBeChecked();
  await expect(page.locator("[data-register-form] [data-privacy-notice] a")).toHaveAttribute("href", "/politika-zasebnosti");
  if (marketing) await page.locator("[data-marketing-optin]").check();
  await page.getByRole("button", { name: "Ustvari račun" }).click();
  await expect(page.locator("[data-register-success]")).toBeVisible({ timeout: 15_000 });
}
async function mailToken(email: string, path: "potrdi-racun" | "ponastavi-geslo", ignored: string[] = []) {
  let token: string | undefined;
  await expect.poll(async () => {
    const list = await (await fetch(`${MAILPIT_URL}/api/v1/messages?limit=100`, { signal: AbortSignal.timeout(5_000) })).json() as {
      messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
    };
    for (const message of list.messages.filter(item => item.To.some(to => to.Address === email))) {
      const mail = await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`, { signal: AbortSignal.timeout(5_000) })).json() as { Text?: string; HTML?: string };
      const match = `${mail.Text ?? ""}\n${mail.HTML ?? ""}`.match(new RegExp(`/${path}/([a-f0-9]{64})`));
      if (match && !ignored.includes(match[1])) { token = match[1]; return true; }
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);
  return token!;
}
async function activate(page: Page, email: string, ignored: string[] = []) {
  const token = await mailToken(email, "potrdi-racun", ignored);
  await page.goto(`/potrdi-racun/${token}`); await dismissCmp(page);
  expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBeNull();
  await page.getByRole("button", { name: "Potrdi e-pošto", exact: true }).click();
  await expect(page.locator("[data-verify-success]")).toBeVisible();
  return token;
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/prijava"); await dismissCmp(page);
  await page.getByLabel("E-pošta", { exact: true }).fill(email); await page.getByLabel("Geslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijava", exact: true }).click();
}
async function requestReset(page: Page, email: string, ignored: string[] = []) {
  await page.goto("/pozabljeno-geslo"); await dismissCmp(page);
  await page.getByLabel("E-pošta", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Pošlji povezavo" }).click();
  await expect(page.locator("[data-forgot-success]")).toBeVisible();
  return mailToken(email, "ponastavi-geslo", ignored);
}

test.afterEach(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  await prisma.consentLog.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  emails.length = 0;
});
test.afterAll(async () => { await prisma.$disconnect(); });

test("registration → read-only verification link → activation → login; consent and single use", async ({ page }) => {
  const email = newEmail("register"), password = "Geslo12345!";
  await registerViaUi(page, email, password);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  expect(user.marketingOptIn).toBe(false);
  expect(await prisma.consentLog.findFirst({ where: { userId: user.id, kind: "marketing-register" } }))
    .toMatchObject({ choices: expect.objectContaining({ marketing: false }) });
  const token = await activate(page, email);
  const tokenRow = await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: digest(token) } });
  expect(tokenRow.usedAt).not.toBeNull(); expect(JSON.stringify(tokenRow)).not.toContain(token);
  // The used link of an active account leads to sign-in, not back to registration (QA T3-F5).
  await page.goto(`/potrdi-racun/${token}`);
  await expect(page.getByRole("heading", { name: "Račun je že aktiven" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Na prijavo" })).toHaveAttribute("href", "/prijava");
  await login(page, email, password); await page.waitForURL(/\/racun/);
  await expect(page.getByText(/Živjo, Test/)).toBeVisible();
});

test("unverified login is blocked, while wrong passwords cannot reveal activation status", async ({ page }) => {
  const email = newEmail("unverified");
  await registerViaUi(page, email, "Geslo12345!");
  await login(page, email, "WrongPassword!");
  await expect(page.getByText("Napačna e-pošta ali geslo.")).toBeVisible();
  await expect(page.getByText(/E-pošta še ni potrjena/)).toHaveCount(0);
  await login(page, email, "Geslo12345!");
  await expect(page.getByText(/E-pošta še ni potrjena/)).toBeVisible();
});

test("activation binds the verified shopper's password, name and consent after an earlier registration", async ({ page }) => {
  const email = newEmail("pre-registration");
  await registerViaUi(page, email, "AttackerPassword!", true, "Earlier");
  const first = await mailToken(email, "potrdi-racun");
  await registerViaUi(page, email, "ShopperPassword!", false, "Shopper");
  const latest = await mailToken(email, "potrdi-racun", [first]);
  await page.goto(`/potrdi-racun/${first}`);
  await expect(page.getByRole("heading", { name: "Povezava ni veljavna" })).toBeVisible();
  await page.goto(`/potrdi-racun/${latest}`);
  await page.getByRole("button", { name: "Potrdi e-pošto", exact: true }).click();
  await expect(page.locator("[data-verify-success]")).toBeVisible();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  expect(user.name).toBe("Shopper Uporabnik"); expect(user.marketingOptIn).toBe(false);
  expect(await prisma.consentLog.findFirst({ where: { userId: user.id, kind: "marketing-activation" } }))
    .toMatchObject({ choices: { marketing: false, verified: true } });
  await login(page, email, "AttackerPassword!");
  await expect(page.getByText("Napačna e-pošta ali geslo.")).toBeVisible();
  await login(page, email, "ShopperPassword!"); await page.waitForURL(/\/racun/);
});

test("forgot/reset is single-use, invalidates older reset links and revokes an existing session", async ({ page, browser }) => {
  const email = newEmail("reset"), oldPassword = "StaroGeslo123!", newPassword = "NovoGeslo456!";
  await registerViaUi(page, email, oldPassword); await activate(page, email);
  await login(page, email, oldPassword); await page.waitForURL(/\/racun/);
  const oldVersion = (await prisma.user.findUniqueOrThrow({ where: { email } })).sessionVersion;
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL }); const resetPage = await context.newPage();
  try {
    const oldToken = await requestReset(resetPage, email);
    const token = await requestReset(resetPage, email, [oldToken]);
    await resetPage.goto(`/ponastavi-geslo/${oldToken}`);
    await expect(resetPage.getByRole("heading", { name: "Povezava ni veljavna" })).toBeVisible();
    await resetPage.goto(`/ponastavi-geslo/${token}`);
    await resetPage.getByLabel(/Novo geslo/).fill(newPassword);
    await resetPage.getByRole("button", { name: "Shrani novo geslo" }).click();
    await expect(resetPage.locator("[data-reset-success]")).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).sessionVersion).toBe(oldVersion + 1);
    await resetPage.goto(`/ponastavi-geslo/${token}`);
    await expect(resetPage.getByRole("heading", { name: "Povezava ni veljavna" })).toBeVisible();
    await page.goto("/racun"); await page.waitForURL(/\/prijava/);
    await login(page, email, oldPassword); await expect(page.getByText("Napačna e-pošta ali geslo.")).toBeVisible();
    await login(page, email, newPassword); await page.waitForURL(/\/racun/);
  } finally { await context.close(); }
});

test("simultaneous reset submissions commit one password change only", async ({ page, browser }) => {
  const email = newEmail("reset-race");
  await registerViaUi(page, email, "StaroGeslo123!"); await activate(page, email);
  const token = await requestReset(page, email);
  const oldVersion = (await prisma.user.findUniqueOrThrow({ where: { email } })).sessionVersion;
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL }); const second = await context.newPage();
  try {
    await Promise.all([page.goto(`/ponastavi-geslo/${token}`), second.goto(`/ponastavi-geslo/${token}`)]);
    await dismissCmp(second);
    await page.getByLabel(/Novo geslo/).fill("FirstPassword!"); await second.getByLabel(/Novo geslo/).fill("SecondPassword!");
    await Promise.all([
      page.getByRole("button", { name: "Shrani novo geslo" }).click(),
      second.getByRole("button", { name: "Shrani novo geslo" }).click(),
    ]);
    await expect.poll(async () => (await page.locator("[data-reset-success]").count()) + (await second.locator("[data-reset-success]").count())).toBe(1);
    const firstWon = await page.locator("[data-reset-success]").isVisible();
    await expect((firstWon ? second : page).locator("[data-reset-form]").getByRole("alert"))
      .toContainText("Povezava za ponastavitev je neveljavna");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.sessionVersion).toBe(oldVersion + 1);
    expect(await bcrypt.compare(firstWon ? "FirstPassword!" : "SecondPassword!", user.passwordHash!)).toBe(true);
    expect(await bcrypt.compare(firstWon ? "SecondPassword!" : "FirstPassword!", user.passwordHash!)).toBe(false);
  } finally { await context.close(); }
});

test("expired and malformed activation/reset links are read-only and show recovery", async ({ page }) => {
  const email = newEmail("expiry"); await registerViaUi(page, email, "StrongPassword!");
  const activation = await mailToken(email, "potrdi-racun");
  await prisma.authToken.update({ where: { tokenHash: digest(activation) }, data: { expiresAt: new Date(Date.now() - 1_000) } });
  await page.goto(`/potrdi-racun/${activation}`);
  await expect(page.getByRole("heading", { name: "Povezava ni veljavna" })).toBeVisible();
  expect((await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: digest(activation) } })).usedAt).toBeNull();
  expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBeNull();
  for (const path of ["/potrdi-racun/not-a-token", "/ponastavi-geslo/not-a-token"]) {
    await page.goto(path); await expect(page.getByRole("heading", { name: "Povezava ni veljavna" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zahtevaj novo povezavo" })).toBeVisible();
  }
  await registerViaUi(page, email, "StrongPassword!");
  await activate(page, email, [activation]);
  const reset = await requestReset(page, email);
  await prisma.authToken.update({ where: { tokenHash: digest(reset) }, data: { expiresAt: new Date(Date.now() - 1_000) } });
  await page.goto(`/ponastavi-geslo/${reset}`);
  await expect(page.getByRole("heading", { name: "Povezava ni veljavna" })).toBeVisible();
});

test("login rejects a missing challenge through the real provider boundary", async ({ page }) => {
  await page.goto("/prijava"); await dismissCmp(page);
  const form = page.locator("[data-login-form]");
  await form.getByLabel("E-pošta").fill("nobody@test.si"); await form.getByLabel("Geslo", { exact: true }).fill("StrongPassword!");
  await form.locator('input[name="turnstileToken"]').evaluate((node: HTMLInputElement) => { node.value = ""; });
  await form.getByRole("button", { name: "Prijava", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert"))
    .toHaveText("Preverjanje ni uspelo. Potrdite, da niste robot, in poskusite znova.");
  await expect(page).toHaveURL(/error=bot_check/);
});

test("sign-in returns to the requested page; a failed attempt keeps the page and the typed address", async ({ page }) => {
  const email = newEmail("callback"), password = "Geslo12345!";
  await prisma.user.create({ data: { email, name: "Povratek Test", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 4) } });
  await page.goto("/racun/podatki");
  await page.waitForURL(/\/prijava\?callbackUrl=%2Fracun%2Fpodatki/);
  await dismissCmp(page);
  const form = page.locator("[data-login-form]");
  await form.getByLabel("E-pošta").fill(email);
  await form.getByLabel("Geslo", { exact: true }).fill("NapacnoGeslo1!");
  await form.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/prijava\?error=credentials&callbackUrl=%2Fracun%2Fpodatki/);
  await expect(form.getByLabel("E-pošta")).toHaveValue(email);
  await form.getByLabel("Geslo", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/racun\/podatki$/);
  // A foreign target is never followed — nor a dot-segment path that normalises into "//host", signed in or not.
  for (const path of ["/prijava", "/prijava/naprej"]) {
    await page.goto(`${path}?callbackUrl=${encodeURIComponent("/.//evil.example/racun")}`);
    await page.waitForURL(/\/racun$/);
  }
  await page.goto("/racun");
  await page.context().clearCookies();
  await page.goto(`/prijava?callbackUrl=${encodeURIComponent("https://evil.example/racun")}`);
  await expect(page.locator("[data-login-form] input[name='callbackUrl']")).toHaveCount(0);
});

test("/racun/* redirects anonymous users to login", async ({ request }) => {
  for (const path of ["/racun", "/racun/podatki", "/admin/ocene"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect([302, 307]).toContain(response.status()); expect(response.headers()["location"]).toContain("/prijava");
  }
});

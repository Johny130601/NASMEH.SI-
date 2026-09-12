import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Page } from "@playwright/test";
import { encryptSecret } from "@/lib/admin/secrets";
import { base32Decode, generateTotpSecret, hotp, TOTP_STEP_SECONDS } from "@/lib/admin/totp";
import { PrismaClient } from "@prisma/client";

/** Shared e2e helpers: direct DB access for state assertions/mutations. */
export const prisma = new PrismaClient({
  datasourceUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5543/nasmeh",
});

export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:18025";

export const TURNSTILE_TEST_TOKEN = "e2e-turnstile-token";

export async function setGtmId(value: string) {
  await prisma.setting.upsert({
    where: { key: "analytics.gtmId" },
    update: { value },
    create: { key: "analytics.gtmId", value },
  });
}

export async function setMaintenanceEnabled(enabled: boolean) {
  // Stored as a bcrypt hash (Phase 9 step 1); the plain password is the test constant below.
  const value = { enabled, passwordHash: bcrypt.hashSync(MAINTENANCE_PASSWORD, 4) };
  await prisma.setting.upsert({
    where: { key: "maintenance" },
    update: { value },
    create: { key: "maintenance", value },
  });
}

export const MAINTENANCE_PASSWORD = "nasmeh-vzdrzevanje";

interface MailpitMessage {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

/** Poll Mailpit until a message to `address` arrives; returns full JSON. */
export async function waitForMailMessage(
  address: string,
  timeoutMs = 20_000,
): Promise<{
  ID: string;
  Subject: string;
  Text?: string;
  HTML?: string;
  Attachments?: Array<{ FileName: string }>;
}> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = (await (
      await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`)
    ).json()) as { messages?: MailpitMessage[] };
    const hit = list.messages?.find((message) =>
      message.To.some((to) => to.Address === address),
    );
    if (hit) {
      return (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${hit.ID}`)
      ).json()) as {
        ID: string;
        Subject: string;
        Text?: string;
        HTML?: string;
        Attachments?: Array<{ FileName: string }>;
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No Mailpit message to ${address} within ${timeoutMs}ms`);
}

/** Poll Mailpit until a message to `address` arrives; returns its body text. */
export async function waitForMailTo(
  address: string,
  timeoutMs = 20_000,
): Promise<string> {
  const message = await waitForMailMessage(address, timeoutMs);
  return `${message.Text ?? ""}\n${message.HTML ?? ""}`;
}

/** Sign a webhook payload exactly like the PSP (e2e test secret). */
export function signWebhook(
  body: string,
  secret: string,
  timestampS = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestampS}.${body}`)
    .digest("hex");
  return `t=${timestampS},v1=${signature}`;
}

export const WEBHOOK_SECRETS = {
  stripe: "whsec_e2e_stripe",
  paypal: "whsec_e2e_paypal",
} as const;

// ---------- Phase 7: staff fixtures and the two-step staff login ----------

/** Mirrors playwright.config.ts / e2e-env: the server signs with the same secret. */
export const E2E_AUTH_SECRET =
  process.env.AUTH_SECRET ?? "e2e-auth-secret-0123456789abcdef0123456789abcdef0123456789abcdef";

/** User fields for a staff fixture that has already completed TOTP enrolment. */
export function enrolledTotpFields(secret = generateTotpSecret()) {
  return {
    secret,
    data: { totpSecret: encryptSecret(secret, E2E_AUTH_SECRET), totpEnabledAt: new Date(), totpLastStep: null },
  };
}

const usedTotpSteps = new Map<string, number>();

/**
 * A code the server will accept now: the current step, or the next one when
 * the current step was already used by this test run (replay guard), waiting
 * for the clock when even that would fall outside the ±1 window.
 */
export async function freshTotpCode(secret: string): Promise<string> {
  const stepMs = TOTP_STEP_SECONDS * 1000;
  let step = Math.floor(Date.now() / stepMs);
  const last = usedTotpSteps.get(secret) ?? -1;
  if (last >= step) {
    step = last + 1;
    const earliest = (step - 1) * stepMs; // step-1 makes `step` the +1 window entry
    if (Date.now() < earliest) await new Promise((resolve) => setTimeout(resolve, earliest - Date.now() + 50));
  }
  usedTotpSteps.set(secret, step);
  return hotp(base32Decode(secret), step);
}

export async function dismissCookieBanner(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni", exact: true }).click();
    await banner.waitFor({ state: "hidden" });
  }
}

/** Password step, then the mandatory TOTP step; resolves inside /admin. */
export async function loginStaff(page: Page, email: string, password: string, secret: string) {
  await page.goto("/prijava");
  await dismissCookieBanner(page);
  const form = page.locator("[data-login-form]");
  await form.getByLabel("E-pošta").fill(email);
  await form.getByLabel("Geslo", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/prijava\/2fa/);
  const mfa = page.locator("[data-mfa-form]");
  await mfa.getByLabel("Koda").fill(await freshTotpCode(secret));
  await mfa.getByRole("button", { name: "Potrdi prijavo" }).click();
  await page.waitForURL(/\/admin/);
}

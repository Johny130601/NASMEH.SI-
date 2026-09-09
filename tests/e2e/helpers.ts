import { createHmac } from "node:crypto";
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
  await prisma.setting.upsert({
    where: { key: "maintenance" },
    update: { value: { enabled, password: "nasmeh-vzdrzevanje" } },
    create: {
      key: "maintenance",
      value: { enabled, password: "nasmeh-vzdrzevanje" },
    },
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

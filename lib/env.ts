import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  AUTH_URL: optionalString,
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  PORT: z.coerce.number().int().positive().default(3000),

  SEED_ADMIN_EMAIL: z.email().default("admin@nasmeh.si"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("ChangeMe123!"),

  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_KLARNA_ENABLED: z.enum(["true", "false"]).default("false"),

  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_WEBHOOK_ID: optionalString,
  PAYPAL_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  EMAIL_FROM: z.string().default("Nasmeh.si <info@nasmeh.si>"),

  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,
  // e2e-only bypass token — NEVER set outside tests (see lib/turnstile.ts)
  TURNSTILE_TEST_TOKEN: optionalString,

  // /api/jobs/daily bearer secret (host cron)
  JOBS_SECRET: optionalString,

  // Content-Security-Policy mode (Phase 9 step 1): "false" sends the Report-Only header, "true" enforces.
  CSP_ENFORCE: z.enum(["true", "false"]).default("false"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parse + cache process.env. Throws (fail fast) on malformed env. */
export function getEnv(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}

/** Boot-time validation hook (called from instrumentation.ts). */
export function validateEnv(): void {
  getEnv();
}

/** Test-only: reset the memoized parse. */
export function __resetEnvForTests(): void {
  cached = null;
}

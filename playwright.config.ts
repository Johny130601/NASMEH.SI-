import { defineConfig, devices } from "@playwright/test";

const PORT = 4317;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1, // suites mutate shared dev-DB state (gtm id, maintenance, consent log)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL },
  webServer: {
    // Production standalone build — tests the artifact Docker ships; the dev
    // watcher hits macOS EMFILE limits. NODE_ENV=test enables the documented
    // Turnstile e2e bypass (lib/turnstile.ts).
    // PORT/HOSTNAME reach the standalone server through `env` below, so the
    // command stays shell-agnostic (Windows cmd has no `PORT=… cmd` form).
    command: "npm run build && npm run start",
    url: `${baseURL}/api/health`,
    // Never reuse a stray server: a stale process serves a build whose chunks
    // a newer `npm run build` has overwritten → dead JS → false failures.
    // PW_REUSE_SERVER=1 opts in for phase-by-phase runs against one build that
    // was started deliberately with this same env and is not rebuilt meanwhile.
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
    timeout: 300_000,
    env: {
      NODE_ENV: "test",
      NASMEH_E2E: "1", // explicit e2e harness flag — NODE_ENV is inlined by the build
      TURNSTILE_TEST_TOKEN: "e2e-turnstile-token",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1", // loopback only: tests use 127.0.0.1, no firewall prompt on Windows
      // Auth.js resolves absolute redirects against AUTH_URL — must match this server
      AUTH_URL: baseURL,
      NEXT_PUBLIC_SITE_URL: baseURL,
      // webhook secrets for the e2e test driver (signatures are REAL HMACs)
      STRIPE_WEBHOOK_SECRET: "whsec_e2e_stripe",
      PAYPAL_WEBHOOK_SECRET: "whsec_e2e_paypal",
      JOBS_SECRET: "jobs_e2e_secret",
      STRIPE_KLARNA_ENABLED: "false", // Do not advertise unverified SI installments.
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

export async function register() {
  // Fail fast at boot on malformed env (AGENTS §8.2). Skip during `next build`,
  // where server env (DATABASE_URL, AUTH_SECRET) is legitimately absent.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
    // Fresh database (Phase 9 step 5): create the OWNER account from
    // SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD when none exists. Runs after the
    // entrypoint's `migrate deploy`; a database problem here must not stop the
    // server, /api/health reports it.
    const { ensureOwnerAccount } = await import("@/lib/bootstrap/owner");
    try {
      await ensureOwnerAccount();
    } catch (error) {
      console.error("[bootstrap] owner account check failed", error instanceof Error ? error.name : "unknown");
    }
  }
}

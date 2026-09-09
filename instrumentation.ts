export async function register() {
  // Fail fast at boot on malformed env (AGENTS §8.2). Skip during `next build`,
  // where server env (DATABASE_URL, AUTH_SECRET) is legitimately absent.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}

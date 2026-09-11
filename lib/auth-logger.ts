import { AuthError, CredentialsSignin } from "@auth/core/errors";

/**
 * Auth.js error logger. The staff password step hands over to the TOTP step
 * through the credentials-error channel (`MfaRequiredError`, code
 * `mfa_required`): that is the designed path, not an error worth a log line
 * (Phase 7 step 1 finding, quietened in step 7). Every other error keeps a
 * line in the default shape.
 */
export function authErrorLogger(error: Error): void {
  if (error instanceof CredentialsSignin && error.code === "mfa_required") return;
  // Production bundles minify class names; the Auth.js `type` is stable (the default logger prints it too).
  const name = error instanceof AuthError ? error.type : error.name;
  console.error(`[auth][error] ${name}: ${error.message}`, error.cause ?? "");
}

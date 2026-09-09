import { CredentialsSignin } from "@auth/core/errors";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { authEmailSchema, humanTokenSchema } from "@/lib/auth-validation";

class UnverifiedEmailError extends CredentialsSignin { code = "unverified"; }
class BotCheckError extends CredentialsSignin { code = "bot_check"; }
const schema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72),
  turnstileToken: humanTokenSchema,
});

/** This provider boundary also protects direct Auth.js callback requests. */
export async function authorizeCredentials(raw: unknown) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return null;
  if (!await verifyTurnstile(parsed.data.turnstileToken)) throw new BotCheckError();
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user?.passwordHash) return null;
  if (!await bcrypt.compare(parsed.data.password, user.passwordHash)) return null;
  // Show activation guidance only after the correct password and challenge.
  if (!user.emailVerified) throw new UnverifiedEmailError();
  return {
    id: user.id, email: user.email, name: user.name, role: user.role,
    sessionVersion: user.sessionVersion,
  };
}

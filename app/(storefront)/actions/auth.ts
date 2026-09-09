"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { issueAuthToken, applyAuthToken } from "@/lib/auth-tokens";
import { authActivationSchema, authEmailSchema, authTokenSchema, humanTokenSchema, newPasswordSchema } from "@/lib/auth-validation";
import { sendResetPasswordEmail, sendVerifyAccountEmail } from "@/lib/email/mailer";
import { auth as copy } from "@/lib/copy";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: authEmailSchema,
  password: newPasswordSchema,
  marketingOptIn: z.boolean().default(false),
  turnstileToken: humanTokenSchema,
});
export interface AuthFormResult { ok: boolean; error?: string }

/** Registration is consent-atomic; repeat submissions never overwrite an account. */
export async function registerAction(input: unknown): Promise<AuthFormResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.register.invalidInput };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheck };
  const { email, password, firstName, lastName, marketingOptIn } = parsed.data;
  try {
    let user = await db.user.findUnique({ where: { email } });
    if (user?.emailVerified) return { ok: true };
    const passwordHash = await bcrypt.hash(password, 10);
    const activation = { passwordHash, name: `${firstName} ${lastName}`, marketingOptIn };
    if (!user) {
      try {
        user = await db.$transaction(async tx => {
          const created = await tx.user.create({ data: {
            email, name: activation.name, role: "CUSTOMER", passwordHash, marketingOptIn: false,
          } });
          await tx.consentLog.create({ data: {
            userId: created.id, kind: "marketing-register", version: "1",
            choices: { marketing: marketingOptIn, pendingVerification: true },
          } });
          return created;
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        // Concurrent registration for the same email receives the same outcome.
        user = await db.user.findUnique({ where: { email } });
      }
    }
    if (user && !user.emailVerified) {
      const token = await issueAuthToken(user.id, "VERIFY_EMAIL", activation);
      await sendVerifyAccountEmail(email, token);
    }
    return { ok: true };
  } catch {
    console.error("Registration could not be completed");
    return { ok: false, error: copy.register.genericError };
  }
}

const verifySchema = z.object({ token: authTokenSchema, turnstileToken: humanTokenSchema });
/** Explicit POST activation: link previews and SSR never mutate the account. */
export async function verifyEmailAction(input: unknown): Promise<AuthFormResult> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.verify.bodyInvalid };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheck };
  try {
    const ok = await applyAuthToken(parsed.data.token, "VERIFY_EMAIL", async (tx, userId, activationData) => {
      const activation = authActivationSchema.parse(activationData);
      const result = await tx.user.updateMany({ where: { id: userId, emailVerified: null }, data: {
        ...activation, emailVerified: new Date(), sessionVersion: { increment: 1 },
      } });
      if (result.count !== 1) throw new Error("Account already activated");
      await tx.consentLog.create({ data: {
        userId, kind: "marketing-activation", version: "1",
        choices: { marketing: activation.marketingOptIn, verified: true },
      } });
    });
    return ok ? { ok: true } : { ok: false, error: copy.verify.bodyInvalid };
  } catch {
    return { ok: false, error: copy.verify.genericError };
  }
}

const emailOnlySchema = z.object({ email: authEmailSchema, turnstileToken: humanTokenSchema });
/** Uniform account-existence response; challenge errors are safely actionable. */
export async function forgotPasswordAction(input: unknown): Promise<AuthFormResult> {
  const parsed = emailOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.forgot.invalidEmail };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheck };
  try {
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (user?.emailVerified) {
      const token = await issueAuthToken(user.id, "RESET_PASSWORD");
      await sendResetPasswordEmail(user.email, token);
    }
  } catch {
    console.error("Password reset email could not be completed");
  }
  return { ok: true };
}

const resetSchema = z.object({
  token: authTokenSchema, password: newPasswordSchema, turnstileToken: humanTokenSchema,
});
export async function resetPasswordAction(input: unknown): Promise<AuthFormResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.reset.invalidInput };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheck };
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const ok = await applyAuthToken(parsed.data.token, "RESET_PASSWORD", async (tx, userId) => {
      const result = await tx.user.updateMany({
        where: { id: userId, emailVerified: { not: null } },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      if (result.count !== 1) throw new Error("Reset requires a verified account");
    });
    return ok ? { ok: true } : { ok: false, error: copy.reset.invalidBody };
  } catch {
    return { ok: false, error: copy.reset.genericError };
  }
}

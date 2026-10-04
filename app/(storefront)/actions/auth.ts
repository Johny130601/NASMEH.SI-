"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { marketingVersion, recordConsent } from "@/lib/consent-log";
import { verifyTurnstile } from "@/lib/turnstile";
import { allowAccountMail, allowActivationAttempt, applyAuthToken, issueAuthToken, readActivationLink } from "@/lib/auth-tokens";
import { withdrawnSince } from "@/lib/auth-activation";
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
export type RegisterField = "firstName" | "lastName" | "email" | "password";
export interface AuthFormResult {
  ok: boolean;
  error?: string;
  /** Registration names the fields the server refused, so the form can mark them (QA T3-F4). */
  fields?: Partial<Record<RegisterField, string>>;
}

const REGISTER_FIELDS: readonly RegisterField[] = ["firstName", "lastName", "email", "password"];

/**
 * Registration is consent-atomic; repeat submissions never overwrite an account.
 * Each submission for an unverified address gets its own activation link, bound
 * to the password chosen in it (QA 2026-10-03 T3-02), and at most three such
 * mails go to one address an hour (t3 N2); a throttled or already verified
 * address gets the same answer, with nothing stored or sent.
 */
export async function registerAction(input: unknown): Promise<AuthFormResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Partial<Record<RegisterField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = REGISTER_FIELDS.find(name => name === issue.path[0]);
      if (field) fields[field] = copy.register.fields[field];
    }
    return Object.keys(fields).length
      ? { ok: false, error: copy.register.invalidInput, fields }
      : { ok: false, error: copy.register.genericError };
  }
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheck };
  const { email, password, firstName, lastName, marketingOptIn } = parsed.data;
  try {
    let user = await db.user.findUnique({ where: { email } });
    if (user?.emailVerified) return { ok: true };
    if (!allowAccountMail("VERIFY_EMAIL", email)) return { ok: true };
    const passwordHash = await bcrypt.hash(password, 10);
    const activation = { passwordHash, name: `${firstName} ${lastName}`, marketingOptIn };
    let logged = false;
    if (!user) {
      try {
        user = await db.$transaction(async tx => {
          const created = await tx.user.create({ data: {
            email, name: activation.name, role: "CUSTOMER", passwordHash, marketingOptIn: false,
          } });
          await recordConsent(tx, {
            userId: created.id, kind: "marketing-register", version: marketingVersion("marketing-register"),
            choices: { marketing: marketingOptIn, pendingVerification: true, source: "register" },
          });
          return created;
        });
        logged = true;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        // Concurrent registration for the same email receives the same outcome.
        user = await db.user.findUnique({ where: { email } });
      }
    }
    if (user && !user.emailVerified) {
      // Every link carries its own snapshot, so this submitter's choice is logged
      // with it — never a register:false then an activation:true with nothing between.
      if (!logged) {
        await recordConsent(db, {
          userId: user.id, kind: "marketing-register", version: marketingVersion("marketing-register"),
          choices: { marketing: marketingOptIn, pendingVerification: true, source: "register" },
        });
      }
      const token = await issueAuthToken(user.id, "VERIFY_EMAIL", activation);
      await sendVerifyAccountEmail(email, token, { newsletter: marketingOptIn });
    }
    return { ok: true };
  } catch {
    console.error("Registration could not be completed");
    return { ok: false, error: copy.register.genericError };
  }
}

const verifySchema = z.object({
  token: authTokenSchema,
  // Checked against the link's snapshot; nothing longer than any password could be.
  password: z.string().max(256).default(""),
  turnstileToken: humanTokenSchema,
});
export interface VerifyResult extends AuthFormResult {
  /** The activation also confirmed the newsletter opt-in chosen with the account. */
  newsletter?: boolean;
}
/**
 * Explicit POST activation: link previews and SSR never mutate the account.
 * The link proves the inbox and the password chosen with the account proves
 * the registrant, so a link activates only for someone holding both: a later,
 * unauthenticated registration of the address can neither take the account
 * over nor void the owner's link (QA 2026-10-03 T3-02). A wrong password
 * leaves the link usable and is counted (allowActivationAttempt).
 * The link's snapshot carries the opt-in as it stood when the link was sent; a
 * newsletter withdrawal for the address made after that (/odjava-novice before
 * the click) wins, so activation never switches marketing back on.
 */
export async function verifyEmailAction(input: unknown): Promise<VerifyResult> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.verify.bodyInvalid };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheck };
  const { token, password } = parsed.data;
  try {
    const link = await readActivationLink(token);
    if (!link) return { ok: false, error: copy.verify.bodyInvalid };
    if (!allowActivationAttempt(link.userId)) return { ok: false, error: copy.verify.rateLimited };
    // bcrypt reads 72 bytes at most; registration refuses longer passwords, so a longer one is never the right one.
    const fits = password.length > 0 && Buffer.byteLength(password, "utf8") <= 72;
    if (!fits || !await bcrypt.compare(password, link.snapshot.passwordHash)) {
      return { ok: false, error: copy.verify.passwordMismatch };
    }
    let newsletter = false;
    const ok = await applyAuthToken(token, "VERIFY_EMAIL", async (tx, userId, activationData, issuedAt) => {
      const snapshot = authActivationSchema.parse(activationData);
      // The password was checked against this link's snapshot, which never changes while the link is usable.
      if (snapshot.passwordHash !== link.snapshot.passwordHash) throw new Error("Activation snapshot changed");
      const withdrawn = snapshot.marketingOptIn ? await withdrawnSince(tx, userId, issuedAt) : null;
      const activation = withdrawn ? { ...snapshot, marketingOptIn: false } : snapshot;
      const result = await tx.user.updateMany({ where: { id: userId, emailVerified: null }, data: {
        ...activation, emailVerified: new Date(), sessionVersion: { increment: 1 },
      } });
      if (result.count !== 1) throw new Error("Account already activated");
      await recordConsent(tx, {
        userId, kind: "marketing-activation", version: marketingVersion("marketing-activation"),
        choices: {
          marketing: activation.marketingOptIn, verified: true, source: "register",
          ...(withdrawn ? { requested: true, withdrawnAfterIssue: true, subscriberId: withdrawn.id } : {}),
        },
      });
      newsletter = activation.marketingOptIn;
    });
    return ok ? { ok: true, newsletter } : { ok: false, error: copy.verify.bodyInvalid };
  } catch {
    return { ok: false, error: copy.verify.genericError };
  }
}

const emailOnlySchema = z.object({ email: authEmailSchema, turnstileToken: humanTokenSchema });
/**
 * Uniform account-existence response; challenge errors are safely actionable.
 * At most three reset mails go to one address an hour (QA 2026-10-03 t3 N2);
 * a throttled request reads exactly like a sent one.
 */
export async function forgotPasswordAction(input: unknown): Promise<AuthFormResult> {
  const parsed = emailOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.forgot.invalidEmail };
  if (!await verifyTurnstile(parsed.data.turnstileToken)) return { ok: false, error: copy.botCheck };
  try {
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (user?.emailVerified && allowAccountMail("RESET_PASSWORD", parsed.data.email)) {
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

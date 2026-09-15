import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** The `.env.example` value: a store reachable from the internet must never start with it. */
export const EXAMPLE_ADMIN_PASSWORD = "ChangeMe123!";

export type EnsureOwnerResult =
  | { created: true }
  | { created: false; reason: "exists" | "example-password" | "email-taken" };

/**
 * First start of a fresh database (Phase 9 step 5): when no OWNER account
 * exists, one is created from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD so the
 * operator can sign in, enrol the mandatory second factor and enter the
 * company data through the admin. Called from instrumentation.ts on every
 * server start, after the entrypoint's `migrate deploy`. Idempotent: an
 * existing OWNER is never touched, and a non-owner account on the same address
 * is never promoted. In production the example password is refused: an
 * unattended store must not come up with a known password.
 */
export async function ensureOwnerAccount(now = new Date()): Promise<EnsureOwnerResult> {
  const owners = await db.user.count({ where: { role: "OWNER" } });
  if (owners > 0) return { created: false, reason: "exists" };

  const env = getEnv();
  if (process.env.NODE_ENV === "production" && env.SEED_ADMIN_PASSWORD === EXAMPLE_ADMIN_PASSWORD) {
    console.error(
      "[bootstrap] no OWNER account exists and SEED_ADMIN_PASSWORD is the .env.example value; set a strong password in .env and restart",
    );
    return { created: false, reason: "example-password" };
  }

  try {
    await db.user.create({
      data: {
        email: env.SEED_ADMIN_EMAIL.toLowerCase(),
        name: "Lastnik",
        role: "OWNER",
        passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 10),
        // Provisioned from the host's .env, not through the e-mail sign-up flow.
        emailVerified: now,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      console.error("[bootstrap] no OWNER account exists but SEED_ADMIN_EMAIL already belongs to another account; choose another address");
      return { created: false, reason: "email-taken" };
    }
    throw error;
  }
  // No address in the log line (DR-9): the operator knows which one they configured.
  console.log("[bootstrap] OWNER account created from SEED_ADMIN_EMAIL; sign in, enrol the second factor, then remove SEED_ADMIN_PASSWORD from .env");
  return { created: true };
}

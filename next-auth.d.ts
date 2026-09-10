import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      /** Staff only: true once TOTP enrolment completed (read from the database per request). */
      mfaEnrolled: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
    sessionVersion?: number;
    /** Staff sign-in time (ms); staff tokens expire 12 h after it. */
    staffIssuedAt?: number;
    mfaEnrolled?: boolean;
  }
}

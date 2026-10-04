import NextAuth from "next-auth";
import { authErrorLogger } from "@/lib/auth-logger";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { mergeGuestCartIntoUserCart } from "@/lib/cart/server";
import { authorizeCredentials } from "@/lib/auth-credentials";
import { revokeSession, validateSessionToken } from "@/lib/auth-session";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  logger: { error: authErrorLogger },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        turnstileToken: { label: "Verification", type: "text" },
        preAuthToken: { label: "Pre-auth", type: "text" },
        totpCode: { label: "Code", type: "text" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt: ({ token, user }) => validateSessionToken(token, user),
  },
  events: {
    // Every sign-out (the account and admin "Odjava", the password change, "Odjavi povsod") records
    // the ending session's id, so a copied cookie is refused from now on (QA 2026-10-03 T3-01).
    // A failed write must not keep anyone signed in: the cookie is cleared either way.
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (!token) return;
      try {
        await revokeSession(token.sid, token.exp);
      } catch (error) {
        console.error("session revocation on sign-out failed", error instanceof Error ? error.name : "unknown");
      }
    },
    // Merge-on-login (AGENTS §5.4): guest cookie cart folds into the DB cart,
    // caps re-applied, cookie cleared. Failure must not block sign-in.
    async signIn({ user }) {
      if (!user.id) return;
      try {
        await mergeGuestCartIntoUserCart(user.id);
      } catch (error) {
        console.error("cart merge-on-login failed", error instanceof Error ? error.name : "unknown");
      }
    },
  },
});

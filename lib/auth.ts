import NextAuth from "next-auth";
import { authErrorLogger } from "@/lib/auth-logger";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { mergeGuestCartIntoUserCart } from "@/lib/cart/server";
import { authorizeCredentials } from "@/lib/auth-credentials";
import { validateSessionToken } from "@/lib/auth-session";

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
    // Merge-on-login (AGENTS §5.4): guest cookie cart folds into the DB cart,
    // caps re-applied, cookie cleared. Failure must not block sign-in.
    async signIn({ user }) {
      if (!user.id) return;
      try {
        await mergeGuestCartIntoUserCart(user.id);
      } catch (error) {
        console.error("cart merge-on-login failed", error);
      }
    },
  },
});

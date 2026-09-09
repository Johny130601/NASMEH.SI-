import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no Prisma/bcrypt imports — middleware bundles this).
 * Providers are added in lib/auth.ts (Node runtime only).
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/prijava" },
  // Trust the incoming Host header (our own server / reverse proxy terminates
  // TLS). Without this, Auth.js v5 server actions build their internal
  // callback request from AUTH_URL — wrong port/origin in e2e and prod.
  trustHost: true,
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/admin")) {
        return auth?.user?.role === "ADMIN";
      }
      if (pathname.startsWith("/racun")) {
        return !!auth?.user;
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (token.role) {
        session.user.role = token.role;
      }
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

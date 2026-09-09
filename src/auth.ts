import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { authConfig } from "@/auth.config";
import {
  getDevAuthUser,
  isDevAuthBypassEnabled,
} from "@/lib/dev-auth";
import { getAllowedEmails } from "@/lib/auth-allowlist";

const providers: Provider[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret:
      process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
  }),
  /**
   * Passwordless email. This is a Credentials provider rather than the built-in
   * Email provider because the session strategy is JWT and there is no NextAuth
   * database adapter here; the token itself is issued, hashed, and redeemed in
   * lib/magic-link, so the provider only has to exchange a claimed token for a
   * user. The token is claimed exactly once inside consumeMagicLink.
   */
  Credentials({
    id: "email-link",
    name: "Email link",
    credentials: { token: { type: "text" } },
    async authorize(credentials) {
      const token = typeof credentials?.token === "string" ? credentials.token : "";
      // Imported here rather than at module scope: consumeMagicLink reaches
      // node:crypto and Prisma, and this module is on the edge middleware's
      // import path.
      const { consumeMagicLink } = await import("@/lib/magic-link");
      const email = await consumeMagicLink(token);
      if (!email) return null;
      return { id: email, email, name: email.split("@")[0] };
    },
  }),
];

if (isDevAuthBypassEnabled()) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev bypass",
      credentials: {},
      authorize() {
        if (!isDevAuthBypassEnabled()) return null;
        return getDevAuthUser();
      },
    }),
  );
}

const nextAuth = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    signIn({ user, account }) {
      if (account?.provider === "dev") {
        return isDevAuthBypassEnabled();
      }
      // The email-link provider already redeemed a single-use token against the
      // allowlist; re-running the check here is harmless and keeps one gate.
      const allowed = getAllowedEmails();
      if (!allowed.length) {
        return true;
      }
      const email = user.email?.toLowerCase();
      return email ? allowed.includes(email) : false;
    },
  },
});

export const { handlers, auth, signIn, signOut } = nextAuth;
export const { GET, POST } = handlers;

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { authConfig } from "@/auth.config";
import {
  getDevAuthUser,
  isDevAuthBypassEnabled,
} from "@/lib/dev-auth";
import { isDashboardEmailAuthorized } from "@/lib/auth-allowlist";

/** Imported on demand: two-step reaches Prisma and node:crypto, and this module is on the edge path. */
async function requireTwoStep(email: string, code: unknown) {
  const { requireTwoStepCode } = await import("@/lib/two-step-signin");
  await requireTwoStepCode(email, code);
}

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
    credentials: { token: { type: "text" }, code: { type: "text" } },
    async authorize(credentials) {
      const token = typeof credentials?.token === "string" ? credentials.token : "";
      // Imported here rather than at module scope: consumeMagicLink reaches
      // node:crypto and Prisma, and this module is on the edge middleware's
      // import path.
      const { consumeMagicLink, peekMagicLink } = await import("@/lib/magic-link");
      const pending = await peekMagicLink(token);
      if (!pending) return null;
      // Checked before the link is spent, so a missing code costs the owner nothing.
      await requireTwoStep(pending, credentials?.code);
      const email = await consumeMagicLink(token);
      if (!email) return null;
      const { dropUnverifiedPassword } = await import("@/lib/password-auth");
      await dropUnverifiedPassword(email);
      return { id: email, email, name: email.split("@")[0] };
    },
  }),
  Credentials({
    id: "password",
    name: "Email and password",
    credentials: { email: { type: "email" }, password: { type: "password" }, code: { type: "text" } },
    async authorize(credentials, request) {
      const email = typeof credentials?.email === "string" ? credentials.email : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      const { clientIp, sharedRateLimit } = await import("@/lib/rate-limit");
      const limit = await sharedRateLimit({
        key: `password-signin:${clientIp(request)}`,
        limit: 20,
        windowMs: 15 * 60 * 1000,
      });
      if (!limit.ok) return null;
      const { verifyPasswordLogin } = await import("@/lib/password-auth");
      const verified = await verifyPasswordLogin(email, password);
      if (!verified) return null;
      await requireTwoStep(verified, credentials?.code);
      return { id: verified, email: verified, name: verified.split("@")[0] };
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
    async signIn({ user, account, profile }) {
      if (account?.provider === "dev") {
        return isDevAuthBypassEnabled();
      }

      if (account?.provider === "google" && user.email && profile?.email_verified !== false) {
        const { dropUnverifiedPassword } = await import("@/lib/password-auth");
        await dropUnverifiedPassword(user.email);
      }

      if (user.email) {
        const { getPublicLaunchReadiness } = await import(
          "@/lib/public-launch-readiness"
        );
        if (getPublicLaunchReadiness().ready) return true;
      }

      return isDashboardEmailAuthorized(user.email, async (email) => {
        /*
         * Dynamic for the same reason consumeMagicLink is dynamic above:
         * auth.ts is reachable from edge middleware, but this callback runs on
         * the Node auth route. Pulling Prisma in at module scope breaks the edge
         * bundle; loading it only here lets an existing shop owner authenticate
         * without weakening the gate for unknown Google accounts.
         */
        const { hasAnyShopAccess } = await import("@/lib/workspace-access");
        return hasAnyShopAccess(email);
      });
    },
  },
});

export const { handlers, auth, signIn, signOut } = nextAuth;
export const { GET, POST } = handlers;

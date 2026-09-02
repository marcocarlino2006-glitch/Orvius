import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { authConfig } from "@/auth.config";
import {
  getDevAuthUser,
  isDevAuthBypassEnabled,
} from "@/lib/dev-auth";

function getAllowedEmails() {
  return (
    process.env.ORVIUS_AUTH_ALLOWED_EMAILS?.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

const providers: Provider[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret:
      process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
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

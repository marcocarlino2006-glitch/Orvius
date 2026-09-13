/*
  /domains is the DNS setup wizard. It renders the deployment's record table and
  webhook URLs, so it belongs behind the same door as /admin rather than sitting
  on the public site, which is where it was.
*/
const protectedPrefixes = ["/dashboard", "/admin", "/domains"];

export function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const authConfig = {
  pages: {
    signIn: "/signin",
  },
  providers: [],
  session: {
    strategy: "jwt" as const,
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }: {
      auth: { user?: unknown } | null;
      request: { nextUrl: URL };
    }) {
      if (!isProtectedPath(nextUrl.pathname)) {
        return true;
      }
      return !!auth?.user;
    },
  },
  trustHost: true,
};

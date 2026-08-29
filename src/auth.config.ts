const protectedPrefixes = ["/dashboard", "/admin"];

export function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const authConfig = {
  pages: {
    signIn: "/login",
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

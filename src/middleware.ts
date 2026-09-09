import NextAuth from "next-auth";
import { authConfig, isProtectedPath } from "@/auth.config";
import { getDomainConfig } from "@/lib/domains";
import { NextResponse } from "next/server";

/**
 * Middleware runs on the edge, so it reads the session from the provider-free
 * config rather than from @/auth. Importing the full instance would drag the
 * Google client, Prisma, and node:crypto into the edge bundle, which does not
 * build.
 */
const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const { pathname } = request.nextUrl;

  if (host) {
    const domains = getDomainConfig();

    if (
      host !== "localhost" &&
      !host.endsWith(".trycloudflare.com") &&
      !host.endsWith(".vercel.app") &&
      host === `www.${domains.primary}`
    ) {
      const url = request.nextUrl.clone();
      url.host = domains.primary;
      url.protocol = "https";
      return NextResponse.redirect(url, 308);
    }
  }

  if (isProtectedPath(pathname) && !request.auth?.user) {
    const signin = new URL("/signin", request.url);
    signin.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signin);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|icon|opengraph-image).*)",
  ],
};

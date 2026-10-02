import NextAuth from "next-auth";
import { authConfig, isProtectedPath } from "@/auth.config";
import { getDomainConfig } from "@/lib/domains";
import { ACQUISITION_COOKIE, ACQUISITION_MAX_AGE, nextAcquisition, parseAcquisition } from "@/lib/acquisition";
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

  const response = NextResponse.next();
  if (request.method === "GET" && !pathname.startsWith("/api") && !pathname.startsWith("/dashboard")) {
    const domains = getDomainConfig();
    const acquisition = nextAcquisition({
      url: request.nextUrl,
      referer: request.headers.get("referer"),
      existing: parseAcquisition(request.cookies.get(ACQUISITION_COOKIE)?.value),
      ownHosts: [domains.primary, domains.app, domains.api, domains.marketing, ...(host ? [host] : [])],
    });
    if (acquisition) {
      response.cookies.set(ACQUISITION_COOKIE, JSON.stringify(acquisition), {
        maxAge: ACQUISITION_MAX_AGE,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        // Shared across orvius.im and app.orvius.im so checkout on either host sees it.
        ...(host && (host === domains.primary || host.endsWith(`.${domains.primary}`)) ? { domain: domains.primary } : {}),
      });
    }
  }
  return response;
});

export const config = {
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|icon|opengraph-image).*)",
  ],
};

import { auth } from "@/auth";
import { isProtectedPath } from "@/auth.config";
import { getDomainConfig } from "@/lib/domains";
import { NextResponse } from "next/server";

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
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|icon|opengraph-image).*)",
  ],
};

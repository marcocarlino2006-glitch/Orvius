import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import { getDomainConfig } from "@/lib/domains";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();

  if (host) {
    const domains = getDomainConfig();

    if (
      host === "localhost" ||
      host.endsWith(".trycloudflare.com") ||
      host.endsWith(".vercel.app")
    ) {
      return NextResponse.next();
    }

    if (host === `www.${domains.primary}`) {
      const url = request.nextUrl.clone();
      url.host = domains.primary;
      url.protocol = "https";
      return NextResponse.redirect(url, 308);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|icon|opengraph-image).*)",
  ],
};

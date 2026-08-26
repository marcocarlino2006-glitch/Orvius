import { NextRequest, NextResponse } from "next/server";
import { getAllowedHosts, getDomainConfig } from "@/lib/domains";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!host) return NextResponse.next();

  const domains = getDomainConfig();
  const allowed = getAllowedHosts();

  // Local dev + tunnel hosts always pass through
  if (
    host === "localhost" ||
    host.endsWith(".trycloudflare.com") ||
    host.endsWith(".vercel.app")
  ) {
    return NextResponse.next();
  }

  // Redirect www → apex
  if (host === `www.${domains.primary}`) {
    const url = request.nextUrl.clone();
    url.host = domains.primary;
    url.protocol = "https";
    return NextResponse.redirect(url, 308);
  }

  // Unknown host — still serve (custom deploys), but log in dev
  if (!allowed.has(host) && process.env.NODE_ENV === "development") {
    console.warn(`Unknown host: ${host}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

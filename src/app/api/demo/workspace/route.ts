import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDemoWorkspace } from "@/lib/demo-workspace";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { ACTIVE_SHOP_COOKIE } from "@/lib/workspace-access";

/** Open (creating on first use) the signed-in person's own demo shop. */
export async function POST() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const limited = await sharedRateLimit({ key: `demo-workspace:${email}`, limit: 5, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const { business, created } = await ensureDemoWorkspace(email);
  const response = NextResponse.json({ ok: true, created, businessId: business.id, name: business.name });
  response.cookies.set(ACTIVE_SHOP_COOKIE, business.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

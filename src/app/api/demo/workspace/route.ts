import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDemoWorkspace, resetDemoWorkspace } from "@/lib/demo-workspace";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { ACTIVE_SHOP_COOKIE } from "@/lib/workspace-access";

/**
 * Open (creating on first use) the signed-in person's own demo shop, filled
 * with a current-date sample week. `reset: true` starts it over at today.
 * Only the demo shop is ever created or deleted here.
 */
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const limited = await sharedRateLimit({ key: `demo-workspace:${email}`, limit: 5, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const body = (await req.json().catch(() => ({}))) as { reset?: unknown; timezone?: unknown };
  const timezone = typeof body.timezone === "string" ? body.timezone.slice(0, 64) : null;
  const { business, created, seeded } =
    body.reset === true ? await resetDemoWorkspace(email, { timezone }) : await ensureDemoWorkspace(email, { seed: true, timezone });
  const response = NextResponse.json({ ok: true, created, seeded, businessId: business.id, name: business.name });
  response.cookies.set(ACTIVE_SHOP_COOKIE, business.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

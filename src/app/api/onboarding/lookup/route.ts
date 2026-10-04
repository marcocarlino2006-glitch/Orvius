import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { lookupShop, placesConfigured } from "@/lib/shop-lookup";

export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ google: placesConfigured(), found: [] });
  const limited = await sharedRateLimit({ key: `shop-lookup:${email}`, limit: 20, windowMs: 10 * 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "Too many lookups. Fill the form in by hand for now.");
  const result = await lookupShop(q);
  return NextResponse.json({ google: placesConfigured(), ...result });
}

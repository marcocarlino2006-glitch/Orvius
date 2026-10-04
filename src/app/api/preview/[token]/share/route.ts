import { NextRequest, NextResponse } from "next/server";
import { shareReplay } from "@/lib/call-replay";
import { getPrimaryDomain } from "@/lib/domains";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await sharedRateLimit({ key: `preview-share:${clientIp(request)}`, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } });
  }
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await shareReplay(token);
  if (!result.ok) {
    return result.reason === "not_found"
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : NextResponse.json({ error: "Make a preview call first. The replay appears after you hang up." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, id: result.id, url: `https://${getPrimaryDomain()}/p/${result.id}` });
}

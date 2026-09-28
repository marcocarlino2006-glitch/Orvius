import { NextRequest, NextResponse } from "next/server";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";
import { getPreviewStatus } from "@/lib/shop-preview";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await sharedRateLimit({ key: `preview-status:${clientIp(request)}`, limit: 240, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } });
  }
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const status = await getPreviewStatus(token);
  if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

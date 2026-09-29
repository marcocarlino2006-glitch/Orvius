import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { voiceLatencyRollup } from "@/lib/call-latency";
import { verifyAdminRequest } from "@/lib/env";
import { isFounderEmail } from "@/lib/founder";

/** How long real callers waited for replies, by stage. Founder session or admin token. `?days=` defaults to 7. */
export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    const email = (await auth())?.user?.email?.toLowerCase();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isFounderEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 7));
  return NextResponse.json(await voiceLatencyRollup(new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
}

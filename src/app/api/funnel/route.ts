import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { BEACON_EVENTS, isBot, isFunnelEvent, optedOutOfTracking, ownerWho, recordFunnel, visitorWho } from "@/lib/funnel";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";

/*
  The browser's half of the funnel: page views of pricing, sign-up, setup and
  the pay step. Always answers 204 so a blocked or refused count never shows
  up as an error in someone's console.
*/
export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });
  const agent = request.headers.get("user-agent");
  if (isBot(agent) || optedOutOfTracking(request.headers)) return done;
  const body = (await request.json().catch(() => null)) as { event?: unknown; detail?: unknown } | null;
  const event = body?.event;
  if (!isFunnelEvent(event) || !BEACON_EVENTS.includes(event)) return done;

  const ip = clientIp(request);
  const limited = await sharedRateLimit({ key: `funnel:${ip}`, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return done;

  const email = (await auth().catch(() => null))?.user?.email;
  const who = email ? ownerWho(email) : visitorWho(ip, agent ?? "");
  const detail = typeof body?.detail === "string" && /^[\w-]{1,20}$/.test(body.detail) ? body.detail : null;
  await recordFunnel(event, who, detail);
  return done;
}

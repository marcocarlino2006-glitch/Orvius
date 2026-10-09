import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { clientIp, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { checkTicket, createVapiWebCall, endWebDemo, joinLine, startWebDemo, WebDemoRefused } from "@/lib/web-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const configured = () => Boolean(process.env.VAPI_API_KEY?.trim());

async function limited(request: Request) {
  const r = await sharedRateLimit({ key: `public:web-demo:${clientIp(request)}`, limit: 40, windowMs: 60_000 });
  return r.ok ? null : tooManyRequests(r.retryAfterSec);
}

/** Where this visitor stands in line. Polled every few seconds while they wait. */
export async function GET(request: Request) {
  const tooMany = await limited(request);
  if (tooMany) return tooMany;
  const ticketId = new URL(request.url).searchParams.get("ticket") ?? "";
  if (!configured()) return NextResponse.json({ state: "closed", reason: "off" }, { headers: noStore });
  if (!ticketId) return NextResponse.json({ state: "open" }, { headers: noStore });
  return NextResponse.json(await checkTicket(ticketId), { headers: noStore });
}

export async function POST(request: Request) {
  const tooMany = await limited(request);
  if (tooMany) return tooMany;
  const body = (await request.json().catch(() => ({}))) as { action?: string; ticketId?: string };
  if (body.action === "end") {
    await endWebDemo({ ticketId: body.ticketId });
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (!configured()) return NextResponse.json({ state: "closed", reason: "off" }, { headers: noStore });
  if (body.action === "join") return NextResponse.json(await joinLine(clientIp(request)), { headers: noStore });
  if (body.action === "start" && body.ticketId) {
    try {
      return NextResponse.json({ call: await startWebDemo(body.ticketId, createVapiWebCall) }, { headers: noStore });
    } catch (error) {
      if (error instanceof WebDemoRefused) return NextResponse.json({ error: error.message }, { status: 409, headers: noStore });
      logError("web_demo.start_failed", { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: "The demo didn't connect. Try again in a minute, or watch a real call instead." }, { status: 502, headers: noStore });
    }
  }
  return NextResponse.json({ error: "Unknown request" }, { status: 400, headers: noStore });
}

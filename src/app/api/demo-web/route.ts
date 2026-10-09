import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { clientIp, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { z } from "zod";
import { createWebPreview } from "@/lib/shop-preview";
import { isHipaaTrade, TRADES } from "@/lib/trades";
import { checkTicket, createVapiWebCall, endWebDemo, hashVisitor, joinLine, startWebDemo, WebDemoRefused } from "@/lib/web-demo";

const businessSchema = z.object({
  name: z.string().trim().min(2).max(80),
  trade: z.enum(TRADES).optional(),
  city: z.string().trim().max(80).optional(),
});

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
  const ticketId = new URL(request.url).searchParams.get("ticket") ?? "";
  if (!ticketId) {
    /* Asked on every homepage view; answered from the CDN, no database. */
    return NextResponse.json(configured() ? { state: "open" } : { state: "closed", reason: "off" }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  }
  const tooMany = await limited(request);
  if (tooMany) return tooMany;
  if (!configured()) return NextResponse.json({ state: "closed", reason: "off" }, { headers: noStore });
  return NextResponse.json(await checkTicket(ticketId), { headers: noStore });
}

export async function POST(request: Request) {
  const tooMany = await limited(request);
  if (tooMany) return tooMany;
  const body = (await request.json().catch(() => ({}))) as { action?: string; ticketId?: string; business?: unknown };
  if (body.action === "end") {
    await endWebDemo({ ticketId: body.ticketId });
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (!configured()) return NextResponse.json({ state: "closed", reason: "off" }, { headers: noStore });
  if (body.action === "join") {
    const ip = clientIp(request);
    if (body.business == null) return NextResponse.json(await joinLine(ip), { headers: noStore });
    const parsed = businessSchema.safeParse(body.business);
    if (!parsed.success) return NextResponse.json({ error: "Type your business name (at least 2 letters)." }, { status: 400, headers: noStore });
    if (isHipaaTrade(parsed.data.trade)) {
      return NextResponse.json({ error: "Orvius doesn't answer for medical or dental offices yet." }, { status: 400, headers: noStore });
    }
    const preview = await createWebPreview({ shopName: parsed.data.name, trade: parsed.data.trade, serviceArea: parsed.data.city, visitorKey: hashVisitor(ip) });
    if (!preview.ok) {
      if (preview.reason === "daily_cap") return NextResponse.json({ state: "closed", reason: "daily" }, { headers: noStore });
      return NextResponse.json({ error: "You've tried a few businesses today. Start your line to keep it answering." }, { status: 429, headers: noStore });
    }
    const id = (await prisma.shopPreview.findUnique({ where: { token: preview.token }, select: { id: true } }))?.id;
    return NextResponse.json({ ...(await joinLine(ip, new Date(), id)), previewToken: preview.token }, { headers: noStore });
  }
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_LINE_DISPLAY, DEMO_LINE_TEL } from "@/lib/demo-line";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";
import { createShopPreview, PREVIEW_MAX_CALLS } from "@/lib/shop-preview";
import { HIPAA_TRADE_REFUSAL, isHipaaTrade, TRADES } from "@/lib/trades";

const previewSchema = z.object({
  shopName: z.string().trim().min(2).max(80),
  trade: z.enum(TRADES).optional(),
  serviceArea: z.string().trim().max(120).optional(),
  services: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  ownerPhone: z.string().trim().min(7).max(40),
  consent: z.literal(true),
  website: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const limited = await sharedRateLimit({ key: `preview:${clientIp(request)}`, limit: 3, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many previews from this network. Try again in an hour." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Add your shop name, your mobile number, and agree to the text." }, { status: 400 });
  }
  const body = parsed.data;
  if (isHipaaTrade(body.trade)) {
    return NextResponse.json({ error: HIPAA_TRADE_REFUSAL }, { status: 400 });
  }
  if (body.website?.trim()) {
    return NextResponse.json({ ok: true, token: "accepted", callNumber: DEMO_LINE_DISPLAY, callTel: DEMO_LINE_TEL });
  }

  const result = await createShopPreview({
    shopName: body.shopName,
    trade: body.trade,
    serviceArea: body.serviceArea,
    services: body.services,
    ownerPhone: body.ownerPhone,
    ip: clientIp(request),
  });
  if (!result.ok) {
    const error =
      result.reason === "invalid_phone"
        ? "That mobile number doesn't look right. Use the phone you'll call from."
        : "Previews are full for today. Watch Orvius take calls at orvius.im/watch, or call the live demo line.";
    return NextResponse.json({ error }, { status: result.reason === "invalid_phone" ? 400 : 503 });
  }

  return NextResponse.json({
    ok: true,
    token: result.token,
    reused: result.reused,
    maxCalls: PREVIEW_MAX_CALLS,
    callNumber: DEMO_LINE_DISPLAY,
    callTel: DEMO_LINE_TEL,
  });
}

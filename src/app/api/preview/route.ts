import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_LINE_DISPLAY, DEMO_LINE_TEL } from "@/lib/demo-line";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";
import { createShopPreview, PREVIEW_MAX_CALLS } from "@/lib/shop-preview";
import { UNTEXTABLE_PHONE_MESSAGE } from "@/lib/sms-destination";
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
  const ip = clientIp(request);
  const hourly = await sharedRateLimit({ key: `preview:${ip}`, limit: 3, windowMs: 60 * 60 * 1000, failClosed: true });
  const limited = hourly.ok
    ? await sharedRateLimit({ key: `preview-day:${ip}`, limit: 8, windowMs: 24 * 60 * 60 * 1000, failClosed: true })
    : hourly;
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many previews from this network. Try again in ${limited.retryAfterSec > 3600 ? "a day" : "an hour"}.` },
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
    ip,
  });
  if (!result.ok) {
    const refusal = {
      invalid_phone: { error: "That mobile number doesn't look right. Use the phone you'll call from.", status: 400 },
      unsupported_destination: { error: UNTEXTABLE_PHONE_MESSAGE, status: 400 },
      phone_cap: {
        error: "This number has used its free previews. Start your shop to keep Orvius answering, or call the live demo line.",
        status: 429,
      },
      daily_cap: {
        error: "Previews are full for today. Watch Orvius take calls at orvius.im/watch, or call the live demo line.",
        status: 503,
      },
    }[result.reason];
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
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

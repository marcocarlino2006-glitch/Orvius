import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personActor } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";
import {
  defaultWinBackMessage,
  renderWinBack,
  sendWinBack,
  winBackAudience,
  WIN_BACK_MAX_PER_SEND,
  WIN_BACK_MONTHS,
} from "@/lib/win-back";

const Months = z.coerce.number().refine((n) => (WIN_BACK_MONTHS as readonly number[]).includes(n));

export async function GET(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const months = Months.safeParse(request.nextUrl.searchParams.get("months") ?? 6);
  if (!months.success) return NextResponse.json({ error: "Pick 3, 6 or 12 months." }, { status: 400 });

  const [audience, shop] = await Promise.all([
    winBackAudience(business.id, months.data),
    prisma.business.findUniqueOrThrow({ where: { id: business.id }, select: { name: true, bookingPageOn: true } }),
  ]);
  const template = defaultWinBackMessage(shop.bookingPageOn);
  return NextResponse.json({
    months: months.data,
    count: audience.length,
    perSend: WIN_BACK_MAX_PER_SEND,
    sample: audience.slice(0, 5).map((c) => ({ name: c.name, lastSeenAt: c.lastSeenAt.toISOString() })),
    template,
    businessName: shop.name,
    preview: renderWinBack(template, {
      name: audience[0]?.name ?? "Ann",
      businessName: shop.name,
      link: shop.bookingPageOn ? "(your booking link)" : null,
    }),
  });
}

const SendBody = z.object({ months: Months, template: z.string().max(600) });

export async function POST(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business, role, email } = authResult;
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the owner can text customers in bulk." }, { status: 403 });
  }
  const parsed = SendBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick how long it's been and write the message." }, { status: 400 });

  const limited = await sharedRateLimit({ key: `win-back:${business.id}`, limit: 3, windowMs: 24 * 60 * 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "That's three win-back sends today. Try again tomorrow.");

  const result = await sendWinBack({
    businessId: business.id,
    months: parsed.data.months,
    template: parsed.data.template,
    by: personActor({ role, email }),
  });
  if (!result.ok) return NextResponse.json({ error: result.message, reason: result.reason }, { status: 400 });
  return NextResponse.json(result);
}

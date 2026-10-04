import { NextResponse } from "next/server";
import { z } from "zod";
import { busyCalendarHost, normalizeBusyCalendarUrl, refreshBusyCalendar } from "@/lib/busy-calendar";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

const bodySchema = z.object({ url: z.string().min(8).max(2000) });

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const business = authResult.business;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste the calendar's secret iCal address." }, { status: 400 });
  const checked = normalizeBusyCalendarUrl(parsed.data.url);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const now = new Date();
  const candidate = { ...business, busyCalendarUrl: checked.url, busyCalendarJson: null, busyCalendarSyncedAt: null };
  const result = await refreshBusyCalendar(candidate, now);
  if (result.error) {
    await prisma.business.update({ where: { id: business.id }, data: { busyCalendarError: business.busyCalendarError } });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await prisma.business.update({ where: { id: business.id }, data: { busyCalendarUrl: checked.url } });
  return NextResponse.json({
    connected: true,
    source: busyCalendarHost(checked.url),
    busyBlocks: result.windows.length,
    syncedAt: now.toISOString(),
  });
}

export async function DELETE() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  await prisma.business.update({
    where: { id: authResult.business.id },
    data: { busyCalendarUrl: null, busyCalendarJson: null, busyCalendarSyncedAt: null, busyCalendarError: null },
  });
  return NextResponse.json({ connected: false });
}

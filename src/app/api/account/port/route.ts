import { NextResponse } from "next/server";
import { PORT_STATUS_COPY, portPinAccepted, submitPortRequest, validatePortInput } from "@/lib/port-request";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/tenant";

export async function GET() {
  const authResult = await requirePermission("settings.edit");
  if ("error" in authResult) return authResult.error;
  const row = await prisma.portRequest.findUnique({ where: { businessId: authResult.business.id } });
  return NextResponse.json({
    pinAccepted: portPinAccepted(),
    request: row
      ? {
          number: row.number,
          carrier: row.carrier,
          status: row.status,
          copy: PORT_STATUS_COPY[row.status] ?? PORT_STATUS_COPY.received,
          portDate: row.portDate,
          note: row.note,
          createdAt: row.createdAt,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("settings.edit");
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const limited = await sharedRateLimit({ key: `port:${business.id}`, limit: 5, windowMs: 60 * 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "Too many tries. Wait a bit and send again.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const checked = validatePortInput(body ?? {});
  if (!checked.ok) return NextResponse.json({ error: "Fix the fields marked above.", errors: checked.errors }, { status: 400 });
  try {
    const row = await submitPortRequest(business, checked.value);
    return NextResponse.json({ ok: true, status: row.status, copy: PORT_STATUS_COPY[row.status] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send." }, { status: 409 });
  }
}

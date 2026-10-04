import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  TEXTING_STATUS_COPY,
  submitTextingRegistration,
  textingRegistrationAvailable,
  validateTextingDetails,
  type TextingDetails,
  type TextingStatus,
} from "@/lib/shop-texting";
import { requirePermission } from "@/lib/tenant";

function maskEin(details: TextingDetails) {
  return { ...details, ein: details.ein ? `••-•••${details.ein.slice(-4)}` : "" };
}

export async function GET() {
  const authResult = await requirePermission("settings.edit");
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const row = await prisma.shopTexting.findUnique({ where: { businessId: business.id } });
  const status = (row?.status ?? null) as TextingStatus | null;
  return NextResponse.json({
    available: textingRegistrationAvailable(),
    hasOwnNumber: Boolean(business.twilioPhone),
    number: business.twilioPhone,
    status,
    copy: status ? TEXTING_STATUS_COPY[status] : null,
    failureReason: row?.failureReason ?? null,
    submittedAt: row?.submittedAt ?? null,
    approvedAt: row?.approvedAt ?? null,
    details: row ? maskEin(JSON.parse(row.detailsJson) as TextingDetails) : null,
  });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("settings.edit");
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  if (!textingRegistrationAvailable()) {
    return NextResponse.json(
      { error: "Texting registration isn't switched on for Orvius yet. Your texts still go out from the Orvius number." },
      { status: 503 },
    );
  }
  if (!business.twilioPhone) {
    return NextResponse.json({ error: "Your shop needs its own Orvius number first." }, { status: 400 });
  }
  const limited = await sharedRateLimit({ key: `texting:${business.id}`, limit: 5, windowMs: 60 * 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "Too many tries. Wait a bit and send again.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const checked = validateTextingDetails(body ?? {});
  if (!checked.ok) return NextResponse.json({ error: "Fix the fields marked in red.", errors: checked.errors }, { status: 400 });
  try {
    const row = await submitTextingRegistration(business.id, checked.details);
    return NextResponse.json({ ok: true, status: row.status, copy: TEXTING_STATUS_COPY[row.status as TextingStatus] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send." }, { status: 409 });
  }
}

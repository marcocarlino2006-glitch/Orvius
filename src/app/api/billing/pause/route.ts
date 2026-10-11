import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { isPauseMonths } from "@/lib/plan-exit";
import { pauseShopPlan, resumeShopPlan } from "@/lib/plan-pause";
import { requirePermission } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authResult = await requirePermission("billing.manage", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const body = (await request.json().catch(() => ({}))) as { months?: unknown };
  if (!isPauseMonths(body.months)) {
    return NextResponse.json({ error: "Pick 1, 2 or 3 months." }, { status: 400 });
  }
  try {
    const result = await pauseShopPlan(authResult.business.id, body.months, authResult.email ?? null);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, startsAt: result.startsAt.toISOString(), until: result.until.toISOString() });
  } catch (error) {
    logError("billing.pause_failed", { businessId: authResult.business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Stripe didn't pause the plan. Nothing was changed. Try again, or email support and we'll do it for you." },
      { status: 502 },
    );
  }
}

export async function DELETE() {
  const authResult = await requirePermission("billing.manage", { entitled: false });
  if ("error" in authResult) return authResult.error;
  try {
    const result = await resumeShopPlan(authResult.business.id, authResult.email ?? null);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, chargedNow: result.chargedNow });
  } catch (error) {
    logError("billing.resume_failed", { businessId: authResult.business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Stripe didn't resume the plan. Nothing was changed. Try again, or email support and we'll do it for you." },
      { status: 502 },
    );
  }
}

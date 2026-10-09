import { NextResponse } from "next/server";
import { personActor, recordAudit } from "@/lib/audit";
import { FINANCING_COST_NOTE, financingStatus } from "@/lib/financing";
import { FinancingRefused, setShopFinancing, type FinancingStripe } from "@/lib/financing-setup";
import { logError } from "@/lib/logger";
import { getStripe } from "@/lib/stripe";
import { isConnectConfigured } from "@/lib/stripe-connect";
import { requirePermission } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requirePermission("billing.manage", { entitled: false });
  if ("error" in authResult) return authResult.error;
  return NextResponse.json({ ...financingStatus(authResult.business), costNote: FINANCING_COST_NOTE }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("billing.manage", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Say whether to turn it on or off." }, { status: 400 });
  if (body.enabled && !isConnectConfigured()) return NextResponse.json({ error: "Payments aren't set up on Orvius yet." }, { status: 503 });
  try {
    const status = await setShopFinancing(business, body.enabled, getStripe() as unknown as FinancingStripe);
    await recordAudit({
      businessId: business.id,
      entityType: "shop",
      entityId: business.id,
      action: body.enabled ? "payments.financing_on" : "payments.financing_off",
      summary: body.enabled ? "Turned on pay over time (Affirm, Klarna) for pay links" : "Turned off pay over time on pay links",
      ...personActor({ role, email }),
    });
    return NextResponse.json({ ...status, costNote: FINANCING_COST_NOTE });
  } catch (error) {
    if (error instanceof FinancingRefused) return NextResponse.json({ error: error.message }, { status: 409 });
    logError("payments.financing_failed", { businessId: business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Stripe didn't take the request. Try again in a minute." }, { status: 502 });
  }
}

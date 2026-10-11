import { NextResponse } from "next/server";
import { personActor, recordAudit } from "@/lib/audit";
import { connectHousecall, disconnectHousecall, HousecallAuthError, housecallConfigured, housecallStatus } from "@/lib/housecall";
import { logWarn } from "@/lib/logger";
import { requirePermission } from "@/lib/tenant";

/** The owner pastes the API key from Housecall Pro; it is checked against Housecall Pro before it is kept. */
export async function POST(request: Request) {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  if (!housecallConfigured()) return NextResponse.json({ error: "Housecall Pro is not live yet." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { apiKey?: unknown };
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  if (!apiKey.trim()) return NextResponse.json({ error: "Paste the API key from Housecall Pro." }, { status: 400 });

  try {
    const conn = await connectHousecall({ businessId: business.id, apiKey });
    await recordAudit({
      businessId: business.id,
      entityType: "shop",
      entityId: business.id,
      action: "housecall.connected",
      ...personActor(authResult),
      summary: `${authResult.email} connected Housecall Pro${conn.companyName ? ` (${conn.companyName})` : ""}. New calls go there as leads.`,
    });
    return NextResponse.json({ ok: true, housecall: await housecallStatus(business.id) });
  } catch (error) {
    if (error instanceof HousecallAuthError) {
      return NextResponse.json(
        { error: "Housecall Pro didn't accept that key. Generate a Full access key in Housecall Pro under My Apps → API Key Management, then paste it here." },
        { status: 400 },
      );
    }
    logWarn("housecall.connect_failed", { businessId: business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Couldn't reach Housecall Pro just now. Try again in a minute." }, { status: 502 });
  }
}

export async function DELETE() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  await disconnectHousecall(business.id);
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "housecall.disconnected",
    ...personActor(authResult),
    summary: `${authResult.email} disconnected Housecall Pro. Orvius forgot the key and stopped sending calls there.`,
  });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { afterResponse } from "@/lib/after-response";
import { refreshFsmSchedule } from "@/lib/fsm-schedule";
import { personActor, recordAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import {
  connectServiceTitan,
  disconnectServiceTitan,
  ServiceTitanAuthError,
  serviceTitanConfigured,
  ServiceTitanSetupError,
  serviceTitanStatus,
} from "@/lib/servicetitan";
import { requirePermission } from "@/lib/tenant";

/** The owner pastes what ServiceTitan generated for the Orvius app; it is checked against ServiceTitan before it is kept. */
export async function POST(request: Request) {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  if (!serviceTitanConfigured()) return NextResponse.json({ error: "ServiceTitan is not live yet." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const field = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
  const tenantId = field("tenantId");
  const clientId = field("clientId");
  const clientSecret = field("clientSecret");
  if (!tenantId.trim() || !clientId.trim() || !clientSecret.trim()) {
    return NextResponse.json({ error: "Paste the tenant ID, client ID and client secret from ServiceTitan." }, { status: 400 });
  }

  try {
    const conn = await connectServiceTitan({ businessId: business.id, tenantId, clientId, clientSecret });
    await afterResponse(() => refreshFsmSchedule(business.id).then(() => undefined));
    await recordAudit({
      businessId: business.id,
      entityType: "shop",
      entityId: business.id,
      action: "servicetitan.connected",
      ...personActor(authResult),
      summary: `${authResult.email} connected ServiceTitan (tenant ${conn.tenantId}). New calls go to its booking queue${conn.providerName ? ` as ${conn.providerName}` : ""}.`,
    });
    return NextResponse.json({ ok: true, servicetitan: await serviceTitanStatus(business.id) });
  } catch (error) {
    if (error instanceof ServiceTitanSetupError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ServiceTitanAuthError) {
      return NextResponse.json(
        { error: "ServiceTitan didn't accept those. In ServiceTitan, open Settings → Integrations → API Application Access, connect Orvius, and copy its tenant ID, client ID and client secret." },
        { status: 400 },
      );
    }
    logWarn("servicetitan.connect_failed", { businessId: business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Couldn't reach ServiceTitan just now. Try again in a minute." }, { status: 502 });
  }
}

export async function DELETE() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  await disconnectServiceTitan(business.id);
  await afterResponse(() => refreshFsmSchedule(business.id).then(() => undefined));
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "servicetitan.disconnected",
    ...personActor(authResult),
    summary: `${authResult.email} disconnected ServiceTitan. Orvius forgot the secret and stopped sending calls there.`,
  });
  return NextResponse.json({ ok: true });
}

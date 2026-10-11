import { NextResponse } from "next/server";
import { afterResponse } from "@/lib/after-response";
import { refreshFsmSchedule } from "@/lib/fsm-schedule";
import { personActor, recordAudit } from "@/lib/audit";
import { disconnectJobber } from "@/lib/jobber";
import { requirePermission } from "@/lib/tenant";

export async function POST() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  await disconnectJobber(business.id);
  await afterResponse(() => refreshFsmSchedule(business.id).then(() => undefined));
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "jobber.disconnected",
    ...personActor(authResult),
    summary: `${authResult.email} disconnected Jobber. Orvius forgot its Jobber access and stopped sending calls there.`,
  });
  return NextResponse.json({ ok: true });
}

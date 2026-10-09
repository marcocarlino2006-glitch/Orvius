import { NextResponse } from "next/server";
import { personActor, recordAudit } from "@/lib/audit";
import { disconnectQuickBooks } from "@/lib/quickbooks";
import { requirePermission } from "@/lib/tenant";

export async function POST() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  await disconnectQuickBooks(business.id);
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "quickbooks.disconnected",
    ...personActor(authResult),
    summary: `${authResult.email} disconnected QuickBooks. Orvius gave back its QuickBooks access and stopped sending payments there.`,
  });
  return NextResponse.json({ ok: true });
}

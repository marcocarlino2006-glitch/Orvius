import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/env";
import { repairAllCustomerShopLines } from "@/lib/provision-business";
import { privilegedActor, recordPlatformAudit } from "@/lib/platform-audit";

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await repairAllCustomerShopLines();
  const failed = results.filter((r) => r.error);
  await recordPlatformAudit(await privilegedActor(request), {
    action: "admin.lines.repaired",
    summary: `Repaired ${results.length - failed.length} of ${results.length} shop lines`,
    detail: { total: results.length, failed: failed.length },
  });

  return NextResponse.json({
    ok: failed.length === 0,
    total: results.length,
    failed: failed.length,
    results,
  });
}

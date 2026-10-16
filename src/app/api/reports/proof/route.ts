import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { shopProofReport } from "@/lib/proof-report";
import { requirePermission } from "@/lib/tenant";

/** What Orvius can show it did for this shop, with observed, manual, modelled and missing kept apart. */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission("reports.view", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const days = Number(request.nextUrl.searchParams.get("days"));
  try {
    const report = await shopProofReport(authResult.business.id, { windowDays: [7, 30, 90].includes(days) ? days : 30 });
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("reports.proof_failed", { businessId: authResult.business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "The report didn't load. Try again in a minute." }, { status: 500 });
  }
}

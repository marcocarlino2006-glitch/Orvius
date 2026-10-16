import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/env";
import { internalEconomicsReport, shopProofReport } from "@/lib/proof-report";

/** Internal, observe-only: call and text costs across live shops, or one shop's proof report. Never changes a price. */
export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = request.nextUrl.searchParams.get("businessId");
  const days = Number(request.nextUrl.searchParams.get("days"));
  const windowDays = [7, 30, 90].includes(days) ? days : 30;
  const report = businessId ? await shopProofReport(businessId, { windowDays }) : await internalEconomicsReport({ windowDays });
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}

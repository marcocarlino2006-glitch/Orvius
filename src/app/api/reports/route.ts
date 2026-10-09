import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { REPORT_PERIODS, buildOwnerReport, reportCsv, type ReportPeriodId } from "@/lib/owner-report";
import { requirePermission } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const authResult = await requirePermission("reports.view");
  if ("error" in authResult) return authResult.error;
  const asked = request.nextUrl.searchParams.get("period");
  const period: ReportPeriodId = REPORT_PERIODS.some((p) => p.id === asked) ? (asked as ReportPeriodId) : "this_month";
  try {
    const result = await buildOwnerReport(authResult.business.id, period);
    if (request.nextUrl.searchParams.get("format") === "csv") {
      return new NextResponse(reportCsv(result.report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="orvius-report-${period}-${result.start.slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("reports.build_failed", { businessId: authResult.business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "The report didn't load. Nothing is wrong with your records; try again in a minute." }, { status: 500 });
  }
}

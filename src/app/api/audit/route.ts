import { NextResponse } from "next/server";
import { auditLogCsv, listAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/tenant";

const date = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The shop's activity log: every decision Orvius made and every change a
 * person made, newest first. `format=csv` downloads up to 10,000 rows with the
 * same filters.
 */
export async function GET(request: Request) {
  const session = await requirePermission("audit.view", { entitled: false });
  if ("error" in session) return session.error;
  const url = new URL(request.url);
  const filters = {
    businessId: session.business.id,
    entityType: url.searchParams.get("type"),
    actor: url.searchParams.get("actor"),
    q: url.searchParams.get("q")?.slice(0, 120) ?? null,
    from: date(url.searchParams.get("from")),
    to: date(url.searchParams.get("to")),
  };

  if (url.searchParams.get("format") === "csv") {
    const rows = [];
    let cursor: string | null = null;
    do {
      const page = await listAuditLog({ ...filters, cursor, take: 500 });
      rows.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor && rows.length < 10_000);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(auditLogCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="orvius-activity-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const take = Number(url.searchParams.get("take") ?? 50);
  const page = await listAuditLog({ ...filters, cursor: url.searchParams.get("cursor"), take: Number.isFinite(take) ? take : 50 });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}

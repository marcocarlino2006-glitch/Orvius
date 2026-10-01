import { NextResponse } from "next/server";
import { openWindows, windowLabel } from "@/lib/copilot-propose";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

/** Real open windows for one request or job — the only times Command offers. */
export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId");
  const jobId = url.searchParams.get("jobId");
  const target = jobId
    ? await prisma.job.findFirst({ where: { id: jobId, businessId: business.id } }).then((job) => (job ? { kind: "job" as const, job } : null))
    : leadId
      ? await prisma.lead.findFirst({ where: { id: leadId, businessId: business.id } }).then((lead) => (lead ? { kind: "lead" as const, lead } : null))
      : null;
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const windows = await openWindows(business, target, 3);
  return NextResponse.json({
    action: target.kind === "job" ? "reschedule" : "book_window",
    windows: windows.map((at) => ({ at: at.toISOString(), label: windowLabel(at, business.timezone) })),
  });
}

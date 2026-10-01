import { NextResponse } from "next/server";
import { buildRequestTrace } from "@/lib/request-trace";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const leadId = new URL(request.url).searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });
  const trace = await buildRequestTrace(authResult.business.id, leadId);
  if (!trace) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  return NextResponse.json(trace);
}

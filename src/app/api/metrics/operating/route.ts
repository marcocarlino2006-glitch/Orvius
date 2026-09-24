import { NextResponse } from "next/server";
import { getOperatingMetrics } from "@/lib/operating-metrics";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const metrics = await getOperatingMetrics(authResult.business.id, 30);
  return NextResponse.json({ windowDays: 30, metrics });
}

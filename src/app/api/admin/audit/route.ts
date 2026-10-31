import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { recentPlatformAudit } from "@/lib/platform-audit";

export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = await recentPlatformAudit(30);
  return NextResponse.json({
    events: events?.map((event) => ({
      id: event.id,
      action: event.action,
      actorKind: event.actorKind,
      actorEmail: event.actorEmail,
      businessId: event.businessId,
      summary: event.summary,
      createdAt: event.createdAt.toISOString(),
    })) ?? null,
  });
}

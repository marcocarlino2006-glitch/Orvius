import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { getLaunchFunnel } from "@/lib/launch-funnel";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getLaunchFunnel());
}

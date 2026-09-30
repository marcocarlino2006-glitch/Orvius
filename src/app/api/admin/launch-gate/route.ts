import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { getLaunchGate } from "@/lib/launch-gate";

export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getLaunchGate());
}

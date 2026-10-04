import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { getCompanyScoreboard } from "@/lib/company-scoreboard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getCompanyScoreboard());
}

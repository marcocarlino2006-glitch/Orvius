import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { readFunnel } from "@/lib/funnel";
import { lifecycleCounts } from "@/lib/lifecycle-email";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [week, month, emails] = await Promise.all([readFunnel(7), readFunnel(30), lifecycleCounts(30)]);
  return NextResponse.json({ week, month, emails });
}

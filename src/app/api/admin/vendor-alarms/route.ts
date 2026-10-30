import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { lastLineCheck } from "@/lib/line-check";
import { lastReceptionistSelfTest } from "@/lib/receptionist-self-test";
import { recentVendorAlarms } from "@/lib/vendor-alarm";

export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [alarms, selfTest, lineCheck] = await Promise.all([recentVendorAlarms(7), lastReceptionistSelfTest(), lastLineCheck()]);
  return NextResponse.json({ alarms, selfTest, lineCheck });
}

import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { lastReceptionistSelfTest } from "@/lib/receptionist-self-test";
import { recentVendorAlarms } from "@/lib/vendor-alarm";

export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ alarms: await recentVendorAlarms(7), selfTest: await lastReceptionistSelfTest() });
}

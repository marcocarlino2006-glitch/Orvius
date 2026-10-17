import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { getLaunchGate, portalSequence } from "@/lib/launch-gate";
import { isSharedSenderVerified, recordSharedSenderCheck } from "@/lib/sms-eligibility";

export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gate = await getLaunchGate();
  const recorded = await recordSharedSenderCheck(gate.textDelivery, "admin:launch-gate");
  return NextResponse.json({ ...gate, sequence: portalSequence(gate), sharedSender: { ...recorded, verified: await isSharedSenderVerified() } });
}

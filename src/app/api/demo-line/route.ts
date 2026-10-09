import { NextResponse } from "next/server";
import { getDemoPlatformLine } from "@/lib/demo-business";
import { demoLineBusyForVisitor, readDemoLoad } from "@/lib/demo-load";
import { resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";

export const dynamic = "force-dynamic";

/** Whether the public demo would turn a new caller away right now. No counts leave the server. */
export async function GET() {
  let busy = false;
  try {
    const demo = await resolveBusinessByInboundPhone(getDemoPlatformLine());
    if (demo) busy = demoLineBusyForVisitor(await readDemoLoad(demo.id));
  } catch {
    busy = false;
  }
  return NextResponse.json({ busy }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } });
}

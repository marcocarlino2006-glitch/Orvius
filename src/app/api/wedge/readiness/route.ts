import { NextResponse } from "next/server";
import { requireBusinessSession } from "@/lib/tenant";
import { getWedgeReadiness } from "@/lib/wedge-readiness";

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;

  const wedge = await getWedgeReadiness(authResult.business.id);
  return NextResponse.json(wedge);
}

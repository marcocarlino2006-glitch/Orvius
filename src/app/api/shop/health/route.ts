import { NextResponse } from "next/server";
import { getShopHealth } from "@/lib/shop-health";
import { requireBusinessSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;

  const health = await getShopHealth(authResult.business.id);
  return NextResponse.json(health);
}

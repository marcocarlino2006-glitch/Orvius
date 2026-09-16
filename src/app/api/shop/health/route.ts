import { NextResponse } from "next/server";
import { after } from "next/server";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { getShopHealth } from "@/lib/shop-health";
import { requireBusinessSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;

  const health = await getShopHealth(authResult.business.id);
  if (health.stuckPendingAlerts > 0) {
    after(() =>
      drainOwnerAlerts({
        at: "shop.health",
        businessId: authResult.business.id,
      }),
    );
  }
  return NextResponse.json(health);
}

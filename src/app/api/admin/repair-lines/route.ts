import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/env";
import { repairAllCustomerShopLines } from "@/lib/provision-business";

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await repairAllCustomerShopLines();
  const failed = results.filter((r) => r.error);

  return NextResponse.json({
    ok: failed.length === 0,
    total: results.length,
    failed: failed.length,
    results,
  });
}

import { NextResponse } from "next/server";
import { REFERRAL_TERMS, referralLink, referralSummary } from "@/lib/referrals";
import { requirePermission } from "@/lib/tenant";

export async function GET() {
  const authResult = await requirePermission("billing.manage");
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  return NextResponse.json({
    link: referralLink(business.slug),
    terms: REFERRAL_TERMS,
    ...(await referralSummary(business.id)),
  });
}

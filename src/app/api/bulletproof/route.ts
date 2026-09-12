import { NextResponse } from "next/server";
import { getBulletproofStatus } from "@/lib/bulletproof-status";
import { isFounderEmail } from "@/lib/is-founder";
import { requireEntitledSession } from "@/lib/tenant";

/** Founder-facing status — drives POST LOCK banner. */
export async function GET() {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  if (!isFounderEmail(auth.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = getBulletproofStatus();
  return NextResponse.json({
    productReady: status.productReady,
    fullyReady: status.fullyReady,
    checkoutPublicReady: status.checkoutPublicReady,
    legalReady: status.legalReady,
    openGates: status.openGates,
    gates: status.gates,
    postLock: !status.fullyReady,
    message: status.fullyReady
      ? "Founder gates clear — safe to post with cash + legal claims."
      : status.checkoutPublicReady
        ? "Checkout ready — still need formation state before legal claims."
        : "Do not claim self-serve paid checkout until Stripe gates are green.",
  });
}

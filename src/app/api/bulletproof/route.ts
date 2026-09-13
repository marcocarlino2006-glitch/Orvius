import { NextResponse } from "next/server";
import { getBulletproofStatus } from "@/lib/bulletproof-status";
import { isFounderEmail } from "@/lib/founder";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

/**
 * Founder-facing status — drives the POST LOCK banner.
 *
 * Every gate this returns is marked founderOnly, and until now nothing read
 * that flag: any entitled owner could fetch the list of Stripe env vars still
 * missing and the note that formation state is unconfirmed. The banner reads
 * an unauthorised response as "nothing to show", so the check belongs here
 * rather than in the component.
 */
export async function GET() {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  if (!isFounderEmail(auth.email)) return forbiddenResponse();

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

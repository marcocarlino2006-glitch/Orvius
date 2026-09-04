import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { confirmCheckoutSession } from "@/lib/billing-sync";
import { isStripeCheckoutConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Success-page fallback when webhook is delayed or misconfigured.
 * GET /api/billing/confirm?session_id=cs_...
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeCheckoutConfigured()) {
    return NextResponse.json(
      { error: "Stripe checkout not configured" },
      { status: 503 },
    );
  }

  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  try {
    const result = await confirmCheckoutSession(sessionId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

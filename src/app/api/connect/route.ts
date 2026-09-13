import { NextResponse } from "next/server";

import { formatPlatformFeeRate } from "@/lib/platform-fee";
import {
  createConnectLoginLink,
  createConnectOnboardingLink,
  ensureConnectAccount,
  getConnectStatus,
  isConnectConfigured,
  refreshConnectAccount,
} from "@/lib/stripe-connect";
import { requireBusinessSession } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Payment onboarding deliberately uses `requireBusinessSession` rather than
  `requireEntitledSession`: a shop whose pilot has lapsed is exactly the shop
  we want connecting a bank account, and locking it out of the money rail to
  push a subscription would be self-defeating.
*/

/*
  Onboarding status must never be served from a cache.

  A shop leaves Orvius to fill in Stripe's forms and comes back minutes later
  having been cleared. Without this, the browser is free to replay the body it
  got before they left — so the owner is told to connect an account they just
  connected, and the only way out is a hard reload they have no reason to try.
*/
function uncached(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...init?.headers, "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  if (!isConnectConfigured()) {
    return uncached({
      configured: false,
      feeRate: formatPlatformFeeRate(),
      status: getConnectStatus(business),
    });
  }

  /*
    Verification often finishes while nobody is on this page, and a dropped
    `account.updated` would otherwise leave a cleared shop looking blocked.
  */
  const refreshed = business.stripeConnectAccountId
    ? await refreshConnectAccount(business).catch(() => null)
    : null;

  return uncached({
    configured: true,
    feeRate: formatPlatformFeeRate(),
    status: refreshed ?? getConnectStatus(business),
  });
}

export async function POST(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  if (!isConnectConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured yet" },
      { status: 503 },
    );
  }

  let intent = "onboard";
  try {
    const body = await request.json();
    if (typeof body?.intent === "string") intent = body.intent;
  } catch {
    // No body means the default: start or resume onboarding.
  }

  try {
    if (intent === "dashboard") {
      const accountId = business.stripeConnectAccountId?.trim();
      if (!accountId) {
        return NextResponse.json(
          { error: "Connect a payout account first" },
          { status: 409 },
        );
      }
      return NextResponse.json({ url: await createConnectLoginLink(accountId) });
    }

    const accountId = await ensureConnectAccount(business);
    const url = await createConnectOnboardingLink({ accountId });
    return NextResponse.json({ url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start onboarding";
    console.error("connect.onboard_failed", { businessId: business.id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

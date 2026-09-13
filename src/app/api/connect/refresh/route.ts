import { NextResponse } from "next/server";

import {
  createConnectOnboardingLink,
  ensureConnectAccount,
} from "@/lib/stripe-connect";
import { requireBusinessSession } from "@/lib/tenant";

export const runtime = "nodejs";

/*
  Stripe's `refresh_url`. Onboarding links are single-use and expire within
  minutes, so an owner who leaves the tab open and comes back arrives here
  rather than at a dead link. The only correct response is a fresh link, not an
  error page — this is a normal part of the flow, not a failure.
*/
export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  }

  const { business } = authResult;

  try {
    const accountId = await ensureConnectAccount(business);
    const url = await createConnectOnboardingLink({ accountId });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("connect.refresh_failed", {
      businessId: business.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.redirect(
      new URL(
        "/dashboard/billing?connect=error",
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      ),
    );
  }
}

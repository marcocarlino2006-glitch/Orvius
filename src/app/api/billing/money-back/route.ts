import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { personActor, recordAudit } from "@/lib/audit";
import { syncSubscriptionToBusiness } from "@/lib/billing-sync";
import { logError } from "@/lib/logger";
import { claimMoneyBack, moneyBackRefusal, readMoneyBack, type MoneyBackStripe } from "@/lib/money-back";
import { getStripe } from "@/lib/stripe";
import { requirePermission } from "@/lib/tenant";

export const runtime = "nodejs";

function accountFor(business: { id: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null }) {
  if (!business.stripeCustomerId || !business.stripeSubscriptionId) return null;
  return { businessId: business.id, customerId: business.stripeCustomerId, subscriptionId: business.stripeSubscriptionId };
}

export async function GET() {
  const authResult = await requirePermission("billing.manage", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const account = accountFor(authResult.business);
  if (!account) return NextResponse.json({ eligible: false, reason: "no_plan" });
  try {
    const state = await readMoneyBack(getStripe() as unknown as MoneyBackStripe, account);
    return NextResponse.json(
      state.eligible
        ? { eligible: true, endsAt: state.endsAt.toISOString(), refundCents: state.refundCents }
        : { eligible: false, reason: state.reason },
    );
  } catch (error) {
    logError("billing.money_back_read_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ eligible: false, reason: "unavailable" });
  }
}

export async function POST() {
  const authResult = await requirePermission("billing.manage", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const account = accountFor(business);
  if (!account) return NextResponse.json({ error: moneyBackRefusal("no_plan") }, { status: 409 });

  try {
    const claim = await claimMoneyBack(getStripe() as unknown as MoneyBackStripe, account);
    if (!claim.ok) return NextResponse.json({ error: moneyBackRefusal(claim.reason) }, { status: 409 });

    await syncSubscriptionToBusiness(claim.subscription as unknown as Stripe.Subscription, email);
    const dollars = `$${(claim.refundedCents / 100).toFixed(2)}`;
    await recordAudit({
      businessId: business.id,
      entityType: "shop",
      entityId: business.id,
      action: "billing.money_back",
      summary: `First-month refund: ${dollars} back to the card, plan canceled.`,
      ...personActor({ role, email }),
      detail: { refundedCents: claim.refundedCents },
    });
    return NextResponse.json({ ok: true, refundedCents: claim.refundedCents });
  } catch (error) {
    logError("billing.money_back_failed", { businessId: business.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Stripe didn't finish the refund. Try again in a minute; you won't be refunded twice. If it keeps failing, email support and we'll do it by hand." },
      { status: 502 },
    );
  }
}

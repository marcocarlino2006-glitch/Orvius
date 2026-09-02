import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";

export async function POST(_request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Sign in to manage billing" }, { status: 401 });
    }

    const business = await prisma.business.findFirst({
      where: { ownerEmail: email, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { stripeCustomerId: true },
    });

    if (!business?.stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "No Stripe customer on file yet. Subscribe to a plan first, or contact support.",
        },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: `${getAppBaseUrl()}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal unavailable";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { company, pricing } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import {
  getAppBaseUrl,
  getStripe,
  getStripePriceId,
  isStripeConfigured,
} from "@/lib/stripe";
import { z } from "zod";

const checkoutSchema = z.object({
  email: z.string().email(),
  businessId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Billing is not configured yet. Apply for the pilot and we will send a checkout link after your trial.",
      },
      { status: 503 },
    );
  }

  try {
    const body = checkoutSchema.parse(await request.json());
    const stripe = getStripe();
    const baseUrl = getAppBaseUrl();

    const business = body.businessId
      ? await prisma.business.findUnique({ where: { id: body.businessId } })
      : await prisma.business.findFirst({
          where: { ownerEmail: body.email },
          orderBy: { createdAt: "asc" },
        });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: body.email,
      line_items: [
        {
          price: getStripePriceId(),
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?canceled=1`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      subscription_data: {
        metadata: {
          product: "orvius-pro",
          businessId: business?.id ?? "",
        },
      },
      metadata: {
        product: "orvius-pro",
        businessId: business?.id ?? "",
        legalEntity: company.legalName,
      },
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
      plan: pricing.pro.name,
      amount: pricing.pro.price,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isStripeConfigured(),
    plan: pricing.pro.name,
    price: pricing.pro.price,
    currency: "usd",
    legalEntity: company.legalName,
  });
}

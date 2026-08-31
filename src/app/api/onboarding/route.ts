import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  findBusinessForOwner,
  isOnboardingComplete,
  provisionBusiness,
} from "@/lib/provision-business";
import { TRADES } from "@/lib/trades";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2, "Shop name must be at least 2 characters"),
  trade: z.enum(TRADES),
  ownerPhone: z
    .string()
    .min(10, "Enter a valid mobile number for owner alerts"),
  greeting: z.string().max(280).optional(),
  timezone: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await findBusinessForOwner(email);
  const complete = Boolean(business);

  return NextResponse.json({
    complete,
    business: business
      ? {
          id: business.id,
          name: business.name,
          slug: business.slug,
          ownerPhone: business.ownerPhone,
          twilioPhone: business.twilioPhone,
          vapiPhoneNumber: business.vapiPhoneNumber,
          billingStatus: business.billingStatus,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await isOnboardingComplete(email)) {
    return NextResponse.json(
      { error: "Your shop is already set up" },
      { status: 409 },
    );
  }

  try {
    const body = createSchema.parse(await request.json());
    const { business, dedicatedLine } = await provisionBusiness({
      name: body.name,
      trade: body.trade,
      ownerEmail: email,
      ownerPhone: body.ownerPhone,
      greeting: body.greeting,
      timezone: body.timezone,
    });

    const line = business.vapiPhoneNumber ?? business.twilioPhone;

    return NextResponse.json(
      {
        complete: true,
        dedicatedLine,
        line,
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug,
          ownerPhone: business.ownerPhone,
          twilioPhone: business.twilioPhone,
          vapiPhoneNumber: business.vapiPhoneNumber,
          billingStatus: business.billingStatus,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Onboarding provision failed:", error);
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Failed to create shop";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

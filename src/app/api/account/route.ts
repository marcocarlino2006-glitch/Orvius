import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { company, pricing } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { isStripeConfigured } from "@/lib/stripe";
import { z } from "zod";

const patchSchema = z.object({
  ownerPhone: z.string().min(10).optional(),
  greeting: z.string().max(280).optional(),
});

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findFirst({
    where: { ownerEmail: email },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerPhone: true,
      ownerEmail: true,
      twilioPhone: true,
      vapiPhoneNumber: true,
      billingStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      createdAt: true,
      greeting: true,
    },
  });

  return NextResponse.json({
    user: {
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      image: session.user.image ?? null,
    },
    business,
    billing: {
      configured: isStripeConfigured(),
      status: business?.billingStatus ?? "none",
      plan: pricing.pro,
      pilot: pricing.pilot,
      legalEntity: company.legalName,
      hasSubscription: Boolean(business?.stripeSubscriptionId),
    },
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.business.findFirst({
      where: { ownerEmail: email, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    if (!existing) {
      return NextResponse.json({ error: "No shop linked" }, { status: 404 });
    }

    const business = await prisma.business.update({
      where: { id: existing.id },
      data: {
        ...(body.ownerPhone !== undefined
          ? { ownerPhone: body.ownerPhone.trim() }
          : {}),
        ...(body.greeting !== undefined ? { greeting: body.greeting.trim() } : {}),
      },
    });

    if (body.greeting !== undefined) {
      try {
        await syncBusinessAssistant(business);
      } catch (error) {
        console.error("Assistant sync failed:", error);
      }
    }

    return NextResponse.json({
      business: {
        id: business.id,
        name: business.name,
        ownerPhone: business.ownerPhone,
        greeting: business.greeting,
        twilioPhone: business.twilioPhone,
        vapiPhoneNumber: business.vapiPhoneNumber,
      },
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

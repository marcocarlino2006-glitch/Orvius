import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { company, pricing } from "@/lib/company";
import { isEmailConfigured } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  getShopLines,
  validateOwnerPhoneForAlerts,
} from "@/lib/owner-alerts";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { isStripeConfigured } from "@/lib/stripe";
import { getShopHealth } from "@/lib/shop-health";
import { getWedgeReadiness } from "@/lib/wedge-readiness";
import { z } from "zod";

const patchSchema = z.object({
  ownerPhone: z.string().min(10).optional(),
  ownerEmail: z.string().email().optional(),
  greeting: z.string().max(280).optional(),
});

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findFirst({
    where: { ownerEmail: email, isActive: true },
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
      lineVerifiedAt: true,
    },
  });

  const health = business ? await getShopHealth(business.id) : null;
  const wedge = business && health ? await getWedgeReadiness(business.id, health) : null;

  return NextResponse.json({
    user: {
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      image: session.user.image ?? null,
    },
    business,
    health,
    wedge,
    alerts: {
      smsEnabled: process.env.ENABLE_OWNER_SMS === "true",
      emailConfigured: isEmailConfigured(),
    },
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

    if (body.ownerPhone !== undefined) {
      const phoneCheck = validateOwnerPhoneForAlerts({
        ownerPhone: body.ownerPhone.trim(),
        shopLines: getShopLines(existing),
      });
      if (!phoneCheck.ok) {
        return NextResponse.json({ error: phoneCheck.reason }, { status: 400 });
      }
    }

    const business = await prisma.business.update({
      where: { id: existing.id },
      data: {
        ...(body.ownerPhone !== undefined
          ? { ownerPhone: body.ownerPhone.trim() }
          : {}),
        ...(body.ownerEmail !== undefined
          ? { ownerEmail: body.ownerEmail.trim().toLowerCase() }
          : {}),
        ...(body.greeting !== undefined ? { greeting: body.greeting.trim() } : {}),
      },
    });

    let assistantSynced = true;
    let syncError: string | null = null;

    if (body.greeting !== undefined) {
      try {
        await syncBusinessAssistant(business);
      } catch (error) {
        assistantSynced = false;
        syncError =
          error instanceof Error ? error.message : "Assistant sync failed";
      }
    }

    return NextResponse.json({
      business: {
        id: business.id,
        name: business.name,
        ownerPhone: business.ownerPhone,
        ownerEmail: business.ownerEmail,
        greeting: business.greeting,
        twilioPhone: business.twilioPhone,
        vapiPhoneNumber: business.vapiPhoneNumber,
      },
      assistantSynced,
      syncError,
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

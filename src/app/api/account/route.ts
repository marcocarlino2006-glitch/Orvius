import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { company, getPlanById, pricing, pricingPlans } from "@/lib/company";
import { getShopLineForBusiness } from "@/lib/demo-business";
import { getBusinessForOwnerWithAutoLine } from "@/lib/provision-business";
import { isEmailConfigured } from "@/lib/email";
import { isFounderEmail } from "@/lib/founder";
import { prisma } from "@/lib/prisma";
import {
  getShopLines,
  validateOwnerPhoneForAlerts,
} from "@/lib/owner-alerts";
import { autoEnsureCustomerShopLine } from "@/lib/provision-business";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { getBillingReadiness, isStripeCheckoutConfigured, isStripeConfigured } from "@/lib/stripe";
import {
  isBillingEntitled,
  resolvePilotEndsAt,
} from "@/lib/billing-entitlement";
import { getShopHealth } from "@/lib/shop-health";
import { getWedgeReadiness } from "@/lib/wedge-readiness";
import {
  MAX_DEPOSIT_CENTS,
  getDepositReadiness,
  resolveDepositAmountCents,
  validateDepositSettingsChange,
} from "@/lib/booking-deposit";
import {
  STRIPE_MIN_CHARGE_CENTS,
  formatPlatformFeeRate,
  shopNetCents,
} from "@/lib/platform-fee";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  trade: z.enum(["HVAC", "Plumbing", "Electrical"]).nullable().optional(),
  address: z.string().max(280).nullable().optional(),
  ownerPhone: z.string().min(10).optional(),
  ownerEmail: z.string().email().optional(),
  greeting: z.string().max(280).optional(),
  avgTicketCents: z.number().int().min(5000).max(5_000_000).nullable().optional(),
  baselineMissedCallsPerWeek: z.number().int().min(0).max(500).nullable().optional(),
  baselineJobsPerWeek: z.number().int().min(0).max(500).nullable().optional(),
  founderCertJson: z.string().max(500).nullable().optional(),
  overflowForwardConfirmedAt: z.boolean().optional(),
  captureMode: z.enum(["forward", "publish"]).optional(),
  forwardCarrier: z
    .enum(["verizon", "att", "tmobile", "other", "voip"])
    .nullable()
    .optional(),
  hoursJson: z.string().max(4000).optional(),
  servicesJson: z.string().max(4000).optional(),
  serviceZipsJson: z.string().max(2000).optional(),
  depositEnabled: z.boolean().optional(),
  depositAmountCents: z
    .number()
    .int()
    .min(STRIPE_MIN_CHARGE_CENTS)
    .max(MAX_DEPOSIT_CENTS)
    .nullable()
    .optional(),
});

/*
  Settings needs the reason deposits are unavailable, not just a boolean. "Off"
  and "your payout account is not finished" send an owner to two different
  places, and only one of them is this screen.
*/
function depositsPayload(
  business: Parameters<typeof getDepositReadiness>[0] & {
    depositAmountCents: number | null;
  },
) {
  const amountCents = resolveDepositAmountCents(business);
  return {
    enabled: business.depositEnabled,
    amountCents,
    /* The take rate made concrete at the moment the amount is chosen. */
    netCents: amountCents == null ? null : shopNetCents(amountCents),
    feeRate: formatPlatformFeeRate(),
    readiness: getDepositReadiness(business),
    minCents: STRIPE_MIN_CHARGE_CENTS,
    maxCents: MAX_DEPOSIT_CENTS,
  };
}

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businessRecord = await getBusinessForOwnerWithAutoLine(email);

  const business = businessRecord
    ? {
        id: businessRecord.id,
        name: businessRecord.name,
        slug: businessRecord.slug,
        trade: businessRecord.trade,
        address: businessRecord.address,
        ownerPhone: businessRecord.ownerPhone,
        ownerEmail: businessRecord.ownerEmail,
        twilioPhone: businessRecord.twilioPhone,
        vapiPhoneNumber: businessRecord.vapiPhoneNumber,
        billingStatus: businessRecord.billingStatus,
        billingPlan: businessRecord.billingPlan,
        stripeCustomerId: businessRecord.stripeCustomerId,
        stripeSubscriptionId: businessRecord.stripeSubscriptionId,
        createdAt: businessRecord.createdAt,
        greeting: businessRecord.greeting,
        lineVerifiedAt: businessRecord.lineVerifiedAt,
        avgTicketCents: businessRecord.avgTicketCents,
        baselineMissedCallsPerWeek: businessRecord.baselineMissedCallsPerWeek,
        baselineJobsPerWeek: businessRecord.baselineJobsPerWeek,
        pilotEndsAt: businessRecord.pilotEndsAt,
        lastWeeklyProofAt: businessRecord.lastWeeklyProofAt,
        founderCertJson: businessRecord.founderCertJson,
        overflowForwardConfirmedAt: businessRecord.overflowForwardConfirmedAt,
        overflowProvedAt: businessRecord.overflowProvedAt,
        forwardGuideSentAt: businessRecord.forwardGuideSentAt,
        captureMode: businessRecord.captureMode ?? "forward",
        forwardCarrier: businessRecord.forwardCarrier ?? null,
        hoursJson: businessRecord.hoursJson ?? "{}",
        servicesJson: businessRecord.servicesJson ?? "[]",
        serviceZipsJson: businessRecord.serviceZipsJson ?? "[]",
        depositEnabled: businessRecord.depositEnabled,
        depositAmountCents: businessRecord.depositAmountCents,
        ownerSmsOptOutAt: businessRecord.ownerSmsOptOutAt
          ? businessRecord.ownerSmsOptOutAt.toISOString()
          : null,
      }
    : null;

  const health = business ? await getShopHealth(business.id) : null;
  const wedge = business && health ? await getWedgeReadiness(business.id, health) : null;

  const currentPlanId = business?.billingPlan ?? null;
  const currentPlan =
    currentPlanId && ["line", "pro", "fleet"].includes(currentPlanId)
      ? getPlanById(currentPlanId as "line" | "pro" | "fleet")
      : null;

  const billingFields = business
    ? {
        billingStatus: business.billingStatus,
        billingPlan: business.billingPlan,
        pilotEndsAt: business.pilotEndsAt,
        createdAt: business.createdAt,
      }
    : null;
  const entitled = billingFields ? isBillingEntitled(billingFields) : false;
  const pilotEnds = billingFields ? resolvePilotEndsAt(billingFields) : null;

  /*
    Readiness names the env vars Stripe is still waiting on and the npm script
    that creates the price IDs. That is a runbook for whoever owns the Stripe
    account, and it was going out to every owner who opened Billing.
  */
  const founder = isFounderEmail(email);
  const readiness = getBillingReadiness();

  return NextResponse.json({
    user: {
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      image: session.user.image ?? null,
    },
    business,
    line: business ? getShopLineForBusiness(business) : null,
    health,
    wedge,
    alerts: {
      smsEnabled: process.env.ENABLE_OWNER_SMS === "true",
      emailConfigured: isEmailConfigured(),
      ownerSmsOptedOut: Boolean(businessRecord?.ownerSmsOptOutAt),
    },
    founder,
    billing: {
      configured: isStripeCheckoutConfigured(),
      fullyReady: isStripeConfigured(),
      readiness: founder
        ? readiness
        : { checkoutReady: readiness.checkoutReady, fullyReady: readiness.fullyReady, missing: [], nextSteps: [], checklist: [] },
      status: business?.billingStatus ?? "none",
      planId: currentPlanId,
      plan: currentPlan ?? pricing.pro,
      plans: pricingPlans,
      pilot: pricing.pilot,
      legalEntity: company.legalName,
      hasSubscription: Boolean(business?.stripeSubscriptionId),
      entitled,
      pilotEndsAt: pilotEnds?.toISOString() ?? null,
    },
    deposits: businessRecord ? depositsPayload(businessRecord) : null,
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

    // Capture confirm is earned — never theater. Prove the line answers first.
    // Forward mode also requires the setup guide was texted (overflowProvedAt trail).
    if (body.overflowForwardConfirmedAt === true && !existing.lineVerifiedAt) {
      return NextResponse.json(
        {
          error:
            "Prove your Orvius line with one test call before confirming capture.",
        },
        { status: 400 },
      );
    }
    if (body.overflowForwardConfirmedAt === true) {
      const mode = body.captureMode ?? existing.captureMode ?? "forward";
      if (mode === "forward" && !existing.forwardGuideSentAt) {
        return NextResponse.json(
          {
            error:
              "Text yourself the forward steps first, then confirm capture.",
          },
          { status: 400 },
        );
      }
    }

    // Founder cell cert is internal dogfood — never writable by a shop owner.
    if (body.founderCertJson !== undefined && !isFounderEmail(email)) {
      return NextResponse.json(
        { error: "Founder certification is internal only." },
        { status: 403 },
      );
    }

    const depositCheck = validateDepositSettingsChange({
      current: existing,
      next: {
        depositEnabled: body.depositEnabled,
        depositAmountCents: body.depositAmountCents,
      },
    });
    if (!depositCheck.ok) {
      return NextResponse.json({ error: depositCheck.error }, { status: 400 });
    }

    const business = await prisma.business.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.trade !== undefined ? { trade: body.trade } : {}),
        ...(body.address !== undefined
          ? { address: body.address?.trim() || null }
          : {}),
        ...(body.ownerPhone !== undefined
          ? { ownerPhone: body.ownerPhone.trim() }
          : {}),
        ...(body.ownerEmail !== undefined
          ? { ownerEmail: body.ownerEmail.trim().toLowerCase() }
          : {}),
        ...(body.greeting !== undefined ? { greeting: body.greeting.trim() } : {}),
        ...(body.avgTicketCents !== undefined
          ? { avgTicketCents: body.avgTicketCents }
          : {}),
        ...(body.baselineMissedCallsPerWeek !== undefined
          ? { baselineMissedCallsPerWeek: body.baselineMissedCallsPerWeek }
          : {}),
        ...(body.baselineJobsPerWeek !== undefined
          ? { baselineJobsPerWeek: body.baselineJobsPerWeek }
          : {}),
        ...(body.founderCertJson !== undefined
          ? { founderCertJson: body.founderCertJson }
          : {}),
        ...(body.overflowForwardConfirmedAt === true
          ? {
              overflowForwardConfirmedAt: new Date(),
              overflowProvedAt: new Date(),
            }
          : body.overflowForwardConfirmedAt === false
            ? {
                overflowForwardConfirmedAt: null,
                overflowProvedAt: null,
              }
            : {}),
        ...(body.captureMode !== undefined
          ? { captureMode: body.captureMode }
          : {}),
        ...(body.forwardCarrier !== undefined
          ? { forwardCarrier: body.forwardCarrier }
          : {}),
        ...(body.hoursJson !== undefined ? { hoursJson: body.hoursJson } : {}),
        ...(body.servicesJson !== undefined
          ? { servicesJson: body.servicesJson }
          : {}),
        ...(body.serviceZipsJson !== undefined
          ? { serviceZipsJson: body.serviceZipsJson }
          : {}),
        ...(body.depositEnabled !== undefined
          ? { depositEnabled: body.depositEnabled }
          : {}),
        ...(body.depositAmountCents !== undefined
          ? { depositAmountCents: body.depositAmountCents }
          : {}),
      },
    });

    await autoEnsureCustomerShopLine(business);

    let assistantSynced = true;
    let syncError: string | null = null;
    let syncWarning: string | null = null;

    try {
      const refreshed = await prisma.business.findUniqueOrThrow({
        where: { id: business.id },
      });
      const sync = await syncBusinessAssistant(refreshed);
      syncWarning = sync.warning;
      if (!sync.assistantUpdated) {
        assistantSynced = false;
        syncError = sync.warning ?? "Assistant sync failed";
      }
    } catch (error) {
      assistantSynced = false;
      syncError =
        error instanceof Error ? error.message : "Assistant sync failed";
    }

    const saved = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });

    return NextResponse.json({
      business: {
        id: saved.id,
        name: saved.name,
        trade: saved.trade,
        address: saved.address,
        ownerPhone: saved.ownerPhone,
        ownerEmail: saved.ownerEmail,
        greeting: saved.greeting,
        avgTicketCents: saved.avgTicketCents,
        baselineMissedCallsPerWeek: saved.baselineMissedCallsPerWeek,
        baselineJobsPerWeek: saved.baselineJobsPerWeek,
        founderCertJson: saved.founderCertJson,
        overflowForwardConfirmedAt: saved.overflowForwardConfirmedAt,
        overflowProvedAt: saved.overflowProvedAt,
        forwardGuideSentAt: saved.forwardGuideSentAt,
        hoursJson: saved.hoursJson,
        servicesJson: saved.servicesJson,
        serviceZipsJson: saved.serviceZipsJson,
        twilioPhone: saved.twilioPhone,
        vapiPhoneNumber: saved.vapiPhoneNumber,
        depositEnabled: saved.depositEnabled,
        depositAmountCents: saved.depositAmountCents,
      },
      deposits: depositsPayload(saved),
      assistantSynced,
      syncError,
      syncWarning,
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

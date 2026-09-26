import { NextResponse } from "next/server";
import { isReceptionistVoice, resolveVoiceId } from "@/lib/voices";
import { auth } from "@/auth";
import { company, getPlanById, pricing, pricingPlans } from "@/lib/company";
import { busyCalendarHost } from "@/lib/busy-calendar";
import { calendarFeedUrl } from "@/lib/calendar-feed";
import { getShopLineForBusiness } from "@/lib/demo-business";
import { getShopAccessWithAutoLine } from "@/lib/provision-business";
import { roleForbiddenResponse } from "@/lib/tenant";
import { can, listShopAccess, resolveShopAccess, summarizeShops } from "@/lib/workspace-access";
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
import { summarizeCallUsage } from "@/lib/call-usage";
import { getMonthValue, monthValueLine } from "@/lib/month-value";
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
import { normalizePhone } from "@/lib/customer";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  trade: z.enum(["HVAC", "Plumbing", "Electrical"]).nullable().optional(),
  address: z.string().max(280).nullable().optional(),
  ownerPhone: z.string().min(10).optional(),
  ownerEmail: z.string().email().optional(),
  greeting: z.string().max(280).optional(),
  transferPhone: z.string().max(24).nullable().optional(),
  voiceId: z.string().max(64).nullable().optional(),
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
  autopilot: z.boolean().optional(),
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

export async function GET(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [access, shops] = await Promise.all([getShopAccessWithAutoLine(email), listShopAccess(email)]);
  const businessRecord = access?.business ?? null;
  const role = access?.role ?? null;

  const business = businessRecord
    ? {
        id: businessRecord.id,
        name: businessRecord.name,
        slug: businessRecord.slug,
        trade: businessRecord.trade,
        environment: businessRecord.environment,
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
        transferPhone: businessRecord.transferPhone,
        voiceId: resolveVoiceId(businessRecord.voiceId),
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
        autopilot: businessRecord.autopilot,
        depositAmountCents: businessRecord.depositAmountCents,
        ownerSmsOptOutAt: businessRecord.ownerSmsOptOutAt
          ? businessRecord.ownerSmsOptOutAt.toISOString()
          : null,
      }
    : null;

  /* Readiness costs three round trips and no screen reads it from here; Command gets it from ring1. */
  const withReadiness = new URL(request.url).searchParams.get("include") === "readiness";
  const [health, monthValue] = await Promise.all([
    business && withReadiness ? getShopHealth(business.id) : null,
    business ? getMonthValue(business.id) : null,
  ]);
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
    role,
    shops: summarizeShops(shops),
    line: business ? getShopLineForBusiness(business) : null,
    health,
    wedge,
    alerts: {
      smsEnabled: process.env.ENABLE_OWNER_SMS === "true",
      emailConfigured: isEmailConfigured(),
      ownerSmsOptedOut: Boolean(businessRecord?.ownerSmsOptOutAt),
    },
    founder,
    calendarFeedUrl: business ? calendarFeedUrl(business.id) : null,
    busyCalendar: businessRecord?.busyCalendarUrl
      ? {
          source: busyCalendarHost(businessRecord.busyCalendarUrl),
          syncedAt: businessRecord.busyCalendarSyncedAt?.toISOString() ?? null,
          error: businessRecord.busyCalendarError,
        }
      : null,
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
      usage: monthValue ? summarizeCallUsage({ used: monthValue.callsAnswered, planId: currentPlanId }) : null,
      valueLine: monthValue ? monthValueLine(monthValue) : null,
    },
    deposits: businessRecord ? depositsPayload(businessRecord) : null,
  });
}

const ASSISTANT_FIELDS = ["name", "trade", "greeting", "transferPhone", "voiceId", "hoursJson", "servicesJson"] as const;

export async function PATCH(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = patchSchema.parse(await request.json());

    const access = await resolveShopAccess(email);
    if (!access) {
      return NextResponse.json({ error: "No shop linked" }, { status: 404 });
    }
    if (!can(access.role, "settings.edit")) return roleForbiddenResponse("settings.edit");
    const existing = access.business;

    if (body.ownerPhone !== undefined) {
      const phoneCheck = validateOwnerPhoneForAlerts({
        ownerPhone: body.ownerPhone.trim(),
        shopLines: getShopLines(existing),
      });
      if (!phoneCheck.ok) {
        return NextResponse.json({ error: phoneCheck.reason }, { status: 400 });
      }
    }

    if (body.voiceId != null && !isReceptionistVoice(body.voiceId)) {
      return NextResponse.json({ error: "Pick one of the listed voices." }, { status: 400 });
    }

    let transferPhone: string | null | undefined;
    if (body.transferPhone !== undefined) {
      const raw = body.transferPhone?.trim() ?? "";
      if (!raw) {
        transferPhone = null;
      } else {
        transferPhone = normalizePhone(raw);
        if (!transferPhone?.startsWith("+")) {
          return NextResponse.json({ error: "Enter the transfer number with area code." }, { status: 400 });
        }
        const lines = getShopLines(existing).map((line) => normalizePhone(line));
        if (lines.includes(transferPhone)) {
          return NextResponse.json(
            { error: "That's your Orvius line — transfers there would loop back to the receptionist. Use your cell or office phone." },
            { status: 400 },
          );
        }
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
        ...(transferPhone !== undefined ? { transferPhone } : {}),
        ...(body.voiceId !== undefined ? { voiceId: body.voiceId } : {}),
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
        ...(body.autopilot !== undefined ? { autopilot: body.autopilot } : {}),
        ...(body.depositAmountCents !== undefined
          ? { depositAmountCents: body.depositAmountCents }
          : {}),
      },
    });

    const { business: saved } = await autoEnsureCustomerShopLine(business);

    let assistantSynced = true;
    let syncError: string | null = null;
    let syncWarning: string | null = null;

    /*
      The assistant is built from name, trade, greeting, transfer number, hours, and services only.
      Everything else (autopilot, deposits, ticket, capture path) skips the two
      Vapi round trips, which is what makes save-as-you-go feel instant.
    */
    const touchesAssistant = ASSISTANT_FIELDS.some((key) => body[key] !== undefined);
    if (touchesAssistant) {
      try {
        const sync = await syncBusinessAssistant(saved);
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
    }

    return NextResponse.json({
      business: {
        id: saved.id,
        name: saved.name,
        trade: saved.trade,
        address: saved.address,
        ownerPhone: saved.ownerPhone,
        ownerEmail: saved.ownerEmail,
        greeting: saved.greeting,
        transferPhone: saved.transferPhone,
        voiceId: resolveVoiceId(saved.voiceId),
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
        autopilot: saved.autopilot,
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

import { NextRequest, NextResponse } from "next/server";
import { maybeAutoBookLead } from "@/lib/auto-job";
import { linkTouchToCustomer } from "@/lib/customer";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { prisma } from "@/lib/prisma";
import {
  buildLeadAlertDedupeKey,
  notifyOwner,
} from "@/lib/notifications";
import { buildOwnerLeadAlertMessage } from "@/lib/owner-alert-message";
import { requireEntitledSession } from "@/lib/tenant";
import { OWNER_TEST_CALL_PREFIX } from "@/lib/owner-test-call";
import { TRADES, industryKind, isTrade, type Trade } from "@/lib/trades";
import { z } from "zod";

const schema = z.object({
  trade: z.enum(TRADES).optional(),
});

const TRADE_SCRIPTS: Record<
  Trade,
  { serviceType: string; urgency: "emergency" | "same-day"; notes: string }
> = {
  HVAC: {
    serviceType: "AC not cooling",
    urgency: "same-day",
    notes: "Owner test call — HVAC no-cool after hours",
  },
  Plumbing: {
    serviceType: "Active water leak",
    urgency: "emergency",
    notes: "Owner test call — plumbing leak under sink",
  },
  Electrical: {
    serviceType: "No power to half the house",
    urgency: "emergency",
    notes: "Owner test call — electrical outage / panel concern",
  },
  Roofing: {
    serviceType: "Roof leak after storm",
    urgency: "emergency",
    notes: "Owner test call — water coming through the ceiling",
  },
  "Pest control": {
    serviceType: "Mice in the kitchen",
    urgency: "same-day",
    notes: "Owner test call — rodents in the home",
  },
  Cleaning: {
    serviceType: "Move-out deep clean",
    urgency: "same-day",
    notes: "Owner test call — 3 bed / 2 bath move-out clean",
  },
  Moving: {
    serviceType: "Local move quote",
    urgency: "same-day",
    notes: "Owner test call — 2 bedroom local move",
  },
  Locksmith: {
    serviceType: "Locked out of the house",
    urgency: "emergency",
    notes: "Owner test call — home lockout",
  },
  "Garage doors": {
    serviceType: "Garage door won't open",
    urgency: "same-day",
    notes: "Owner test call — loud bang, likely broken spring",
  },
  "Appliance repair": {
    serviceType: "Refrigerator not cooling",
    urgency: "same-day",
    notes: "Owner test call — fridge warm, food at risk",
  },
  "Auto repair": {
    serviceType: "Check engine light",
    urgency: "same-day",
    notes: "Owner test call — check engine light, car still drivable",
  },
  "Salon & spa": {
    serviceType: "Haircut and color",
    urgency: "same-day",
    notes: "Owner test call — new client wants a cut and color",
  },
  "Dental office": {
    serviceType: "Toothache",
    urgency: "same-day",
    notes: "Owner test call — existing patient with tooth pain",
  },
  "Medical office": {
    serviceType: "Sick visit",
    urgency: "same-day",
    notes: "Owner test call — existing patient with a sore throat",
  },
  "Law office": {
    serviceType: "New consultation",
    urgency: "same-day",
    notes: "Owner test call — new client wants a consultation",
  },
  "Real estate": {
    serviceType: "Home valuation",
    urgency: "same-day",
    notes: "Owner test call — seller wants a valuation",
  },
  "Other business": {
    serviceType: "Appointment request",
    urgency: "same-day",
    notes: "Owner test call — caller wants to book a time",
  },
};

/**
 * Owner-safe dogfood call for the signed-in shop.
 * Proves Call → Lead → Customer → (optional Job) without admin demo tools.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;

  const business = authResult.business;
  const body = schema.parse(await request.json().catch(() => ({})));
  const inferred = tradeForCapture(business);
  const trade: Trade =
    body.trade ?? (inferred && isTrade(inferred) ? inferred : "HVAC");
  const script = TRADE_SCRIPTS[trade];
  const office = industryKind(trade) === "office";

  const callerName = "Test Caller";
  const callerPhone = business.ownerPhone?.trim() || "+15555550100";
  const address = office ? null : business.address?.trim() || null;
  const vapiCallId = `${OWNER_TEST_CALL_PREFIX}${Date.now()}`;

  const summary = [
    `${callerName} called about ${script.serviceType}.`,
    `Urgency: ${script.urgency}.`,
    office ? null : address ? `Address: ${address}.` : "No address given.",
    script.notes,
  ]
    .filter(Boolean)
    .join(" ");

  const transcript = (
    office
      ? [
          `[Owner test · ${trade}]`,
          `Orvius: Thanks for calling ${business.name}. How can I help?`,
          `Caller: ${script.serviceType}. Can I get in today?`,
          `Orvius: I can help. What's your name and a good callback number?`,
          `Caller: ${callerName}. ${callerPhone}.`,
          `Orvius: Got it. I'll pass this to the team and someone will confirm your time.`,
        ]
      : [
          `[Owner test · ${trade}]`,
          `Orvius: Thanks for calling ${business.name}. How can I help?`,
          `Caller: ${script.serviceType}. Can someone come today?`,
          `Orvius: I can help. What's the address and a callback number?`,
          `Caller: ${address ?? "I'll give the address when you call back"}. ${callerPhone}.`,
          `Orvius: Got it. I'll mark this ${script.urgency} and alert the owner.`,
        ]
  ).join("\n");

  const call = await prisma.call.create({
    data: {
      businessId: business.id,
      vapiCallId,
      callerPhone,
      status: "completed",
      durationSec: 95,
      summary,
      transcript,
      booked: false,
    },
  });

  const demand = deriveDemandSignal({
    serviceType: script.serviceType,
    notes: script.notes,
    summary,
    address,
    trade,
  });

  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      callId: call.id,
      externalId: vapiCallId,
      name: callerName,
      phone: callerPhone,
      serviceType: script.serviceType,
      urgency: script.urgency,
      address,
      notes: script.notes,
      source: "owner_test",
      status: "new",
      categoryCode: demand.categoryCode,
      postalCode: demand.postalCode,
    },
  });

  await linkTouchToCustomer({
    businessId: business.id,
    callId: call.id,
    leadId: lead.id,
    phone: callerPhone,
    name: callerName,
    address,
    notes: script.notes,
  });

  const autoBook = await maybeAutoBookLead(lead.id);
  const bookedJob = autoBook.jobId
    ? await prisma.job.findUnique({
        where: { id: autoBook.jobId },
        select: { id: true, scheduledAt: true, customerConfirmedAt: true },
      })
    : null;

  if (business.ownerPhone) {
    try {
      await notifyOwner({
        businessId: business.id,
        ownerPhone: business.ownerPhone,
        ownerEmail: business.ownerEmail,
        businessName: business.name,
        message: buildOwnerLeadAlertMessage({
          lead: {
            name: lead.name,
            phone: lead.phone,
            serviceType: lead.serviceType,
            urgency: lead.urgency,
            address: lead.address,
          },
          job: bookedJob,
          autoBooked: autoBook.created,
          timezone: business.timezone,
        }),
        leadId: lead.id,
        dedupeKey: buildLeadAlertDedupeKey({ vapiCallId }),
      });
    } catch {
      /* Local shops may lack SMS — lead still exists. */
    }
  }

  return NextResponse.json({
    ok: true,
    trade,
    callId: call.id,
    leadId: lead.id,
    jobId: autoBook.jobId,
    autoBooked: autoBook.created,
    lineVerified: Boolean(business.lineVerifiedAt),
    next: autoBook.jobId
      ? { href: `/dashboard/jobs/${autoBook.jobId}`, label: "Open booked job" }
      : { href: `/dashboard/inbox/${lead.id}`, label: "Open lead in Inbox" },
  });
}

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
import { TRADES, type Trade } from "@/lib/trades";
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
    body.trade ??
    (inferred === "HVAC" || inferred === "Plumbing" || inferred === "Electrical"
      ? inferred
      : "HVAC");
  const script = TRADE_SCRIPTS[trade];

  const callerName = "Test Caller";
  const callerPhone = business.ownerPhone?.trim() || "+15555550100";
  const address = business.address?.trim() || "1842 Oak Street";
  const vapiCallId = `owner_test_${Date.now()}`;

  const summary = [
    `${callerName} called about ${script.serviceType}.`,
    `Urgency: ${script.urgency}.`,
    `Address: ${address}.`,
    script.notes,
  ].join(" ");

  const transcript = [
    `[Owner test · ${trade}]`,
    `Orvius: Thanks for calling ${business.name}. How can I help?`,
    `Caller: ${script.serviceType}. Can someone come today?`,
    `Orvius: I can help. What's the address and a callback number?`,
    `Caller: ${address}. ${callerPhone}.`,
    `Orvius: Got it. I'll mark this ${script.urgency} and alert the owner.`,
  ].join("\n");

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

  if (!business.lineVerifiedAt) {
    await prisma.business.update({
      where: { id: business.id },
      data: { lineVerifiedAt: new Date() },
    });
  }

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
    lineVerified: true,
    next: autoBook.jobId
      ? { href: `/dashboard/jobs/${autoBook.jobId}`, label: "Open booked job" }
      : { href: `/dashboard/inbox/${lead.id}`, label: "Open lead in Inbox" },
  });
}

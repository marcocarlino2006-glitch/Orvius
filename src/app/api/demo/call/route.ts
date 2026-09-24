import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { ingestEndOfCallReport } from "@/lib/call-ingest";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { verifyAdminRequest } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";
import { z } from "zod";

const demoCallSchema = z.object({
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  /** Reuse to prove a replayed report lands on the same records. */
  callId: z.string().min(4).max(80).optional(),
  callerName: z.string().min(1),
  callerPhone: z.string().min(7),
  serviceType: z.string().min(1),
  urgency: z.enum(["emergency", "same-day", "this-week", "flexible"]),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const DEMO_SLUG = "summit-hvac-demo";

/**
 * Demo endpoint — simulates a completed receptionist call without Twilio/Vapi.
 * Creates call + lead and optionally notifies owner.
 */
export async function POST(request: NextRequest) {
  /*
    This creates a shop, a call and a lead, and texts an owner. The guard was
    isProduction(), so a dev server pointed at the live database would have
    let anyone do all of that to a real shop. What makes it safe is the data
    it writes to, not the build it runs in.
  */
  if (!isUnauthenticatedAccessAllowed() && !verifyAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = demoCallSchema.parse(await request.json());

    let business = body.businessId
      ? await prisma.business.findUnique({ where: { id: body.businessId } })
      : await prisma.business.findUnique({ where: { slug: DEMO_SLUG } });

    if (business && business.environment === "production") {
      return NextResponse.json(
        {
          error:
            "Demo calls only write to demo or test workspaces. Place a real test call to your line instead.",
        },
        { status: 403 },
      );
    }

    if (!business) {
      if (body.businessId) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      business = await prisma.business.create({
        data: {
          name: body.businessName ?? "Summit HVAC",
          slug: DEMO_SLUG,
          environment: "demo",
          trade: "HVAC",
          greeting:
            "Thank you for calling Summit HVAC. How can I help you today?",
          ownerPhone: process.env.ORVIUS_OWNER_PHONE ?? null,
          hoursJson: JSON.stringify({
            monday: { open: "08:00", close: "18:00" },
            tuesday: { open: "08:00", close: "18:00" },
            wednesday: { open: "08:00", close: "18:00" },
            thursday: { open: "08:00", close: "18:00" },
            friday: { open: "08:00", close: "18:00" },
            saturday: { open: "09:00", close: "14:00" },
            sunday: { closed: true, open: "00:00", close: "00:00" },
          }),
          servicesJson: JSON.stringify([
            { name: "Emergency repair", description: "Same-day urgent service" },
            { name: "Estimate / inspection", description: "On-site quote" },
            { name: "Maintenance", description: "Scheduled visit" },
          ]),
        },
      });
    }

    const summary = [
      `${body.callerName} called about ${body.serviceType}.`,
      `Urgency: ${body.urgency}.`,
      body.address ? `Address: ${body.address}.` : null,
      body.notes ? `Notes: ${body.notes}` : null,
    ]
      .filter(Boolean)
      .join(" ");

    const vapiCallId = `demo_${body.callId ?? randomUUID()}`;
    const result = await ingestEndOfCallReport({
      business,
      vapiCallId,
      message: {
        type: "end-of-call-report",
        call: { id: vapiCallId, customer: { number: body.callerPhone } },
        summary,
        durationSeconds: 95,
        transcript: `[Demo transcript]\nCaller: Hi, I need help with ${body.serviceType}.\nOrvius: Of course — can I get your name and address?\nCaller: ${body.callerName}${body.address ? `, ${body.address}` : ""}.\nOrvius: Got it. We'll have someone follow up shortly.`,
        analysis: {
          structuredData: {
            name: body.callerName,
            phone: body.callerPhone,
            serviceType: body.serviceType,
            urgency: body.urgency,
            address: body.address,
            notes: body.notes,
          },
        },
      },
    });

    if (result.duplicate) {
      const call = await prisma.call.findUnique({
        where: { vapiCallId },
        include: { lead: { include: { job: { select: { id: true } } } } },
      });
      return NextResponse.json({
        ok: true,
        demo: true,
        duplicate: true,
        business: { id: business.id, name: business.name },
        callId: call?.id ?? null,
        leadId: call?.lead?.id ?? null,
        jobId: call?.lead?.job?.id ?? null,
      });
    }

    const businessId = business.id;
    after(() => drainOwnerAlerts({ at: "demo.call", vapiCallId, businessId }));

    const bookedJob = result.jobId
      ? await prisma.job.findUnique({
          where: { id: result.jobId },
          select: { id: true, scheduledAt: true, customerConfirmedAt: true, technicianId: true },
        })
      : null;
    const autoBook = { created: result.autoBooked, jobId: result.jobId };
    const call = { id: result.callId };
    const lead = { id: result.leadId };

    const bookingStatus = !autoBook.created
      ? "lead_only"
      : bookedJob?.customerConfirmedAt
        ? "confirmed"
        : "proposed_awaiting_confirm";

    return NextResponse.json({
      ok: true,
      demo: true,
      business: { id: business.id, name: business.name },
      callId: call.id,
      leadId: lead.id,
      jobId: autoBook.jobId,
      autoBooked: autoBook.created,
      customerId: result.customerId,
      technicianId: bookedJob?.technicianId ?? null,
      skipReason: result.skipReason,
      bookingStatus,
      scheduledAt: bookedJob?.scheduledAt?.toISOString() ?? null,
      customerConfirmedAt: bookedJob?.customerConfirmedAt?.toISOString() ?? null,
      summary,
      honesty:
        bookingStatus === "proposed_awaiting_confirm"
          ? "Proposed window — awaiting customer confirm. Not a locked appointment yet."
          : bookingStatus === "confirmed"
            ? "Customer confirmed the window."
            : "Lead captured — no auto-book for this urgency.",
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Demo call failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

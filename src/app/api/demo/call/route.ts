import { NextRequest, NextResponse } from "next/server";
import { linkTouchToCustomer } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { notifyOwner } from "@/lib/notifications";
import { z } from "zod";

const demoCallSchema = z.object({
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  callerName: z.string().min(1),
  callerPhone: z.string().min(7),
  serviceType: z.string().min(1),
  urgency: z.enum(["emergency", "same-day", "this-week", "flexible"]),
  address: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Demo endpoint — simulates a completed receptionist call without Twilio/Vapi.
 * Creates call + lead and optionally notifies owner.
 */
export async function POST(request: NextRequest) {
  try {
    const body = demoCallSchema.parse(await request.json());

    let business = body.businessId
      ? await prisma.business.findUnique({ where: { id: body.businessId } })
      : await prisma.business.findFirst({ orderBy: { createdAt: "asc" } });

    if (!business) {
      business = await prisma.business.create({
        data: {
          name: body.businessName ?? "Summit HVAC",
          slug: "summit-hvac-demo",
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

    const call = await prisma.call.create({
      data: {
        businessId: business.id,
        vapiCallId: `demo_${Date.now()}`,
        callerPhone: body.callerPhone,
        status: "completed",
        durationSec: 95,
        summary,
        transcript: `[Demo transcript]\nCaller: Hi, I need help with ${body.serviceType}.\nOrvius: Of course — can I get your name and address?\nCaller: ${body.callerName}${body.address ? `, ${body.address}` : ""}.\nOrvius: Got it. We'll have someone follow up shortly.`,
        booked: body.urgency !== "flexible",
      },
    });

    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        callId: call.id,
        name: body.callerName,
        phone: body.callerPhone,
        serviceType: body.serviceType,
        urgency: body.urgency,
        address: body.address ?? null,
        notes: body.notes ?? summary,
        source: "demo",
        status: "new",
      },
    });

    await linkTouchToCustomer({
      businessId: business.id,
      callId: call.id,
      leadId: lead.id,
      phone: body.callerPhone,
      name: body.callerName,
      address: body.address ?? null,
      notes: body.notes ?? summary,
    });

    if (business.ownerPhone) {
      await notifyOwner({
        ownerPhone: business.ownerPhone,
        ownerEmail: business.ownerEmail,
        businessName: business.name,
        message: [
          `New lead from ${body.callerName}`,
          `Phone: ${body.callerPhone}`,
          `Service: ${body.serviceType}`,
          `Urgency: ${body.urgency}`,
          body.address ? `Address: ${body.address}` : null,
          `Summary: ${summary}`,
        ]
          .filter(Boolean)
          .join("\n"),
        leadId: lead.id,
      });
    }

    return NextResponse.json({
      ok: true,
      demo: true,
      business: { id: business.id, name: business.name },
      callId: call.id,
      leadId: lead.id,
      summary,
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

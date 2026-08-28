import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractLeadFromStructuredData,
  type VapiWebhookMessage,
} from "@/lib/vapi";
import { notifyOwner } from "@/lib/notifications";

async function findBusinessForCall(
  vapiCallId: string,
  phoneNumber?: string,
  assistantId?: string,
) {
  const call = await prisma.call.findUnique({
    where: { vapiCallId },
    include: { business: true },
  });

  if (call?.business) {
    return call.business;
  }

  if (assistantId) {
    const byAssistant = await prisma.business.findFirst({
      where: { vapiAssistantId: assistantId, isActive: true },
    });
    if (byAssistant) return byAssistant;
  }

  if (phoneNumber) {
    const byPhone = await prisma.business.findFirst({
      where: {
        isActive: true,
        OR: [{ vapiPhoneNumber: phoneNumber }, { twilioPhone: phoneNumber }],
      },
    });
    if (byPhone) return byPhone;
  }

  // Single-business fallback for MVP deployments
  const businesses = await prisma.business.findMany({
    where: { isActive: true },
    take: 2,
  });
  if (businesses.length === 1) {
    return businesses[0];
  }

  return null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (secret) {
    const incoming = request.headers.get("x-vapi-secret");
    if (incoming !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const payload = (await request.json()) as VapiWebhookMessage;
  const { message } = payload;
  const type = message.type;
  const vapiCallId = message.call?.id;

  if (!vapiCallId) {
    return NextResponse.json({ ok: true, skipped: "missing call id" });
  }

  const inboundNumber = message.call?.phoneNumber?.number;
  const assistantId = message.call?.assistantId;

  const business = await findBusinessForCall(
    vapiCallId,
    inboundNumber,
    assistantId,
  );

  if (!business) {
    console.warn("No business matched for Vapi call", {
      vapiCallId,
      inboundNumber,
      assistantId,
    });
    return NextResponse.json({ ok: true, skipped: "business not found" });
  }

  if (type === "call-started" || type === "status-update") {
    await prisma.call.upsert({
      where: { vapiCallId },
      create: {
        businessId: business.id,
        vapiCallId,
        callerPhone: message.call?.customer?.number ?? null,
        status: "in-progress",
      },
      update: {
        callerPhone: message.call?.customer?.number ?? undefined,
        status: "in-progress",
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (type === "end-of-call-report") {
    const summary =
      message.summary ??
      message.analysis?.summary ??
      "Call completed. Review transcript in Orvius dashboard.";
    const transcript = message.transcript ?? null;
    const durationSec = message.durationSeconds ?? null;
    const recordingUrl = message.recordingUrl ?? null;
    const structured = extractLeadFromStructuredData(
      message.analysis?.structuredData,
    );

    const call = await prisma.call.upsert({
      where: { vapiCallId },
      create: {
        businessId: business.id,
        vapiCallId,
        callerPhone: structured.phone ?? message.call?.customer?.number ?? null,
        status: "completed",
        summary,
        transcript,
        durationSec,
        recordingUrl,
      },
      update: {
        status: "completed",
        summary,
        transcript,
        durationSec,
        recordingUrl,
        callerPhone: structured.phone ?? message.call?.customer?.number ?? undefined,
      },
    });

    const lead = await prisma.lead.upsert({
      where: { callId: call.id },
      create: {
        businessId: business.id,
        callId: call.id,
        name: structured.name ?? null,
        phone: structured.phone ?? call.callerPhone,
        email: structured.email ?? null,
        serviceType: structured.serviceType ?? null,
        urgency: structured.urgency ?? null,
        address: structured.address ?? null,
        notes: structured.notes ?? summary,
        source: "call",
      },
      update: {
        name: structured.name ?? undefined,
        phone: structured.phone ?? undefined,
        email: structured.email ?? undefined,
        serviceType: structured.serviceType ?? undefined,
        urgency: structured.urgency ?? undefined,
        address: structured.address ?? undefined,
        notes: structured.notes ?? summary,
      },
    });

    const ownerMessage = [
      `New lead${lead.name ? `: ${lead.name}` : ""}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.serviceType ? `Service: ${lead.serviceType}` : null,
      lead.urgency ? `Urgency: ${lead.urgency}` : null,
      lead.address ? `Address: ${lead.address}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const notifyResult = await notifyOwner({
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
      businessName: business.name,
      message: ownerMessage,
    });

    if (
      process.env.ENABLE_OWNER_SMS === "true" &&
      business.ownerPhone &&
      !notifyResult.sms
    ) {
      console.error("Owner SMS failed for call", {
        vapiCallId,
        businessId: business.id,
        ownerPhone: business.ownerPhone,
      });
    }

    return NextResponse.json({
      ok: true,
      callId: call.id,
      leadId: lead.id,
      ownerNotified: Boolean(notifyResult.sms || notifyResult.email),
    });
  }

  return NextResponse.json({ ok: true, type });
}

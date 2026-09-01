import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractLeadFromStructuredData,
  type VapiWebhookMessage,
} from "@/lib/vapi";
import { linkTouchToCustomer } from "@/lib/customer";
import {
  buildLeadAlertDedupeKey,
  notifyOwner,
} from "@/lib/notifications";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { isProduction } from "@/lib/runtime";
import { verifyVapiWebhookSecret } from "@/lib/webhook-auth";

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

  if (!isProduction()) {
    const businesses = await prisma.business.findMany({
      where: { isActive: true },
      take: 2,
    });
    if (businesses.length === 1) {
      return businesses[0];
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!verifyVapiWebhookSecret(request.headers.get("x-vapi-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    logWarn("vapi.webhook.business_not_found", {
      vapiCallId,
      inboundNumber,
      assistantId,
      type,
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

    const txResult = await prisma.$transaction(async (tx) => {
      const call = await tx.call.upsert({
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

      const lead = await tx.lead.upsert({
        where: { callId: call.id },
        create: {
          businessId: business.id,
          callId: call.id,
          externalId: vapiCallId,
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

      const claim = await tx.call.updateMany({
        where: { id: call.id, ownerNotifiedAt: null },
        data: { ownerNotifiedAt: new Date() },
      });

      if (!business.lineVerifiedAt) {
        await tx.business.update({
          where: { id: business.id },
          data: { lineVerifiedAt: new Date() },
        });
      }

      return {
        call,
        lead,
        shouldNotify: claim.count === 1,
        duplicate: claim.count === 0,
      };
    });

    await linkTouchToCustomer({
      businessId: business.id,
      callId: txResult.call.id,
      leadId: txResult.lead.id,
      phone: txResult.lead.phone ?? txResult.call.callerPhone,
      name: txResult.lead.name,
      email: txResult.lead.email,
      address: txResult.lead.address,
      notes: txResult.lead.notes,
    });

    if (txResult.duplicate) {
      logInfo("vapi.webhook.duplicate_end_of_call", {
        vapiCallId,
        businessId: business.id,
        callId: txResult.call.id,
        leadId: txResult.lead.id,
      });
      return NextResponse.json({
        ok: true,
        duplicate: true,
        callId: txResult.call.id,
        leadId: txResult.lead.id,
      });
    }

    const ownerMessage = [
      `New lead${txResult.lead.name ? `: ${txResult.lead.name}` : ""}`,
      txResult.lead.phone ? `Phone: ${txResult.lead.phone}` : null,
      txResult.lead.serviceType ? `Service: ${txResult.lead.serviceType}` : null,
      txResult.lead.urgency ? `Urgency: ${txResult.lead.urgency}` : null,
      txResult.lead.address ? `Address: ${txResult.lead.address}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const notifyResult = await notifyOwner({
      businessId: business.id,
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
      businessName: business.name,
      message: ownerMessage,
      leadId: txResult.lead.id,
      dedupeKey: buildLeadAlertDedupeKey({ vapiCallId }),
    });

    if (
      notifyResult.sms?.status === "failed" ||
      notifyResult.email?.status === "failed"
    ) {
      logError("vapi.webhook.owner_alert_failed", {
        vapiCallId,
        businessId: business.id,
        sms: notifyResult.sms,
        email: notifyResult.email,
      });
    }

    return NextResponse.json({
      ok: true,
      callId: txResult.call.id,
      leadId: txResult.lead.id,
      ownerNotified: Boolean(
        notifyResult.sms?.status === "sent" ||
          notifyResult.email?.status === "sent",
      ),
      duplicate: notifyResult.duplicate ?? false,
    });
  }

  return NextResponse.json({ ok: true, type });
}

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractLeadFromStructuredData,
  type VapiWebhookMessage,
} from "@/lib/vapi";
import { maybeAutoBookLead } from "@/lib/auto-job";
import { linkTouchToCustomer } from "@/lib/customer";
import { buildOwnerLeadAlertMessage } from "@/lib/owner-alert-message";
import {
  buildLeadAlertDedupeKey,
  enqueueOwnerAlert,
  processNotificationQueue,
} from "@/lib/notifications";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { isProduction } from "@/lib/runtime";
import {
  hasProcessedWebhookEvent,
  recordWebhookEvent,
} from "@/lib/webhook-events";
import { verifyVapiWebhookSecret } from "@/lib/webhook-auth";
import { resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";

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
    const byPhone = await resolveBusinessByInboundPhone(phoneNumber);
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
    await recordWebhookEvent({
      source: "vapi",
      externalId: vapiCallId,
      eventType: type,
      status: "skipped",
      payload: { type, inboundNumber, assistantId },
      error: "business not found",
    });
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

    await recordWebhookEvent({
      source: "vapi",
      externalId: vapiCallId,
      eventType: type,
      businessId: business.id,
      status: "processed",
      payload: { type },
    });

    return NextResponse.json({ ok: true });
  }

  if (type === "end-of-call-report") {
    if (
      await hasProcessedWebhookEvent({
        source: "vapi",
        externalId: vapiCallId,
        eventType: type,
      })
    ) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const summary =
      message.summary ??
      message.analysis?.summary ??
      "Call completed. Review transcript in Orvius dashboard.";
    const transcript = message.transcript ?? null;
    const durationSec = message.durationSeconds ?? null;
    const recordingUrl = message.recordingUrl ?? null;
    const successEvaluation =
      message.analysis?.successEvaluation == null
        ? null
        : String(message.analysis.successEvaluation);
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
          successEvaluation,
        },
        update: {
          status: "completed",
          summary,
          transcript,
          durationSec,
          recordingUrl,
          successEvaluation: successEvaluation ?? undefined,
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

    const autoBook = await maybeAutoBookLead(txResult.lead.id);
    const bookedJob = autoBook.jobId
      ? await prisma.job.findUnique({
          where: { id: autoBook.jobId },
          select: { id: true, scheduledAt: true },
        })
      : null;

    if (txResult.duplicate) {
      await recordWebhookEvent({
        source: "vapi",
        externalId: vapiCallId,
        eventType: type,
        businessId: business.id,
        status: "duplicate",
        payload: { callId: txResult.call.id, leadId: txResult.lead.id },
      });
      return NextResponse.json({
        ok: true,
        duplicate: true,
        callId: txResult.call.id,
        leadId: txResult.lead.id,
      });
    }

    const ownerMessage = buildOwnerLeadAlertMessage({
      lead: {
        name: txResult.lead.name,
        phone: txResult.lead.phone,
        serviceType: txResult.lead.serviceType,
        urgency: txResult.lead.urgency,
        address: txResult.lead.address,
      },
      job: bookedJob,
      autoBooked: autoBook.created,
    });

    const dedupeKey = buildLeadAlertDedupeKey({ vapiCallId });

    await enqueueOwnerAlert({
      businessId: business.id,
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
      businessName: business.name,
      message: ownerMessage,
      leadId: txResult.lead.id,
      dedupeKey,
    });

    await recordWebhookEvent({
      source: "vapi",
      externalId: vapiCallId,
      eventType: type,
      businessId: business.id,
      status: "processed",
      payload: { callId: txResult.call.id, leadId: txResult.lead.id },
    });

    after(async () => {
      try {
        await processNotificationQueue(10);
      } catch (error) {
        logError("vapi.webhook.queue_process_failed", {
          vapiCallId,
          businessId: business.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    });

    return NextResponse.json({
      ok: true,
      callId: txResult.call.id,
      leadId: txResult.lead.id,
      jobId: autoBook.jobId,
      autoBooked: autoBook.created,
      queued: true,
    });
  }

  return NextResponse.json({ ok: true, type });
}

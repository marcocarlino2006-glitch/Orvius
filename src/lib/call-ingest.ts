import { recordAudit } from "@/lib/audit";
import { maybeAutoBookLead, type AutoBookResult } from "@/lib/auto-job";
import { linkTouchToCustomerDetailed } from "@/lib/customer";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { logInfo } from "@/lib/logger";
import { buildLeadAlertDedupeKey, enqueueOwnerAlert } from "@/lib/notifications";
import { buildOwnerLeadAlertMessage } from "@/lib/owner-alert-message";
import { prisma } from "@/lib/prisma";
import { extractLeadFromStructuredData, type VapiWebhookMessage } from "@/lib/vapi";
import { claimWebhookEvent, completeWebhookEvent } from "@/lib/webhook-events";

export type IngestResult =
  | { duplicate: true }
  | {
      duplicate: false;
      callId: string;
      leadId: string;
      customerId: string | null;
      jobId: string | null;
      autoBooked: boolean;
      qualified: boolean;
      skipReason: AutoBookResult["skipReason"] | null;
    };

/**
 * One completed call → one connected history. The claim on
 * (vapi, callId, end-of-call-report) and the unique Call / Lead / Customer /
 * Job edges make a replayed or concurrent report land on the same records;
 * every decision is written to the audit trail once.
 */
export async function ingestEndOfCallReport(params: {
  business: { id: string };
  message: VapiWebhookMessage["message"];
  vapiCallId: string;
}): Promise<IngestResult> {
  const { message, vapiCallId } = params;
  // Callers resolve the shop from different partial rows; the playbook needs
  // trade and services, so read the whole row once here.
  const business = await prisma.business.findUniqueOrThrow({ where: { id: params.business.id } });
  const eventType = "end-of-call-report";

  const claim = await claimWebhookEvent({
    source: "vapi",
    externalId: vapiCallId,
    eventType,
    businessId: business.id,
    payload: { type: eventType },
  });
  if (!claim.claimed) return { duplicate: true };

  try {
    const summary =
      message.summary ??
      message.analysis?.summary ??
      "Call completed. Review transcript in Orvius dashboard.";
    const transcript = message.transcript ?? null;
    const durationSec = message.durationSeconds ?? null;
    const recordingUrl = message.recordingUrl ?? null;
    const successEvaluation =
      message.analysis?.successEvaluation == null ? null : String(message.analysis.successEvaluation);
    const structured = extractLeadFromStructuredData(message.analysis?.structuredData);
    const demand = deriveDemandSignal({
      serviceType: structured.serviceType,
      notes: structured.notes,
      summary,
      address: structured.address,
      categoryHint: structured.jobCategory,
      trade: tradeForCapture(business),
    });

    const { call, lead } = await prisma.$transaction(async (tx) => {
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
          categoryCode: demand.categoryCode,
          postalCode: demand.postalCode,
        },
        update: {
          name: structured.name ?? undefined,
          phone: structured.phone ?? undefined,
          email: structured.email ?? undefined,
          serviceType: structured.serviceType ?? undefined,
          urgency: structured.urgency ?? undefined,
          address: structured.address ?? undefined,
          notes: structured.notes ?? summary,
          categoryCode: demand.categoryCode ?? undefined,
          postalCode: demand.postalCode ?? undefined,
        },
      });

      if (!business.lineVerifiedAt) {
        await tx.business.update({
          where: { id: business.id },
          data: { lineVerifiedAt: new Date() },
        });
      }
      return { call, lead };
    });

    const key = (step: string) => `call:${vapiCallId}:${step}`;
    await recordAudit({
      businessId: business.id,
      entityType: "call",
      entityId: call.id,
      callId: call.id,
      leadId: lead.id,
      action: "call.answered",
      summary: `Answered a ${durationSec ? `${Math.round(durationSec / 60) || 1}-minute ` : ""}call${
        call.callerPhone ? ` from ${call.callerPhone}` : ""
      }`,
      detail: { durationSec, successEvaluation },
      idempotencyKey: key("answered"),
    });

    const captured = {
      problem: lead.serviceType,
      urgency: lead.urgency,
      address: lead.address,
      callback: lead.phone,
      name: lead.name,
    };
    const missing = Object.entries(captured)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    await recordAudit({
      businessId: business.id,
      entityType: "lead",
      entityId: lead.id,
      callId: call.id,
      leadId: lead.id,
      action: "lead.captured",
      summary: missing.length
        ? `Captured ${lead.serviceType ?? "the request"} — missing ${missing.join(", ")}`
        : `Captured ${lead.serviceType}, ${lead.urgency}, address and callback number`,
      detail: { captured, missing },
      idempotencyKey: key("captured"),
    });

    const link = await linkTouchToCustomerDetailed({
      businessId: business.id,
      callId: call.id,
      leadId: lead.id,
      phone: call.callerPhone,
      alternatePhone: lead.phone,
      name: lead.name,
      email: lead.email,
      address: lead.address,
      notes: lead.notes,
    });
    const customerId = link?.customer.id ?? null;
    if (link) {
      await recordAudit({
        businessId: business.id,
        entityType: "customer",
        entityId: link.customer.id,
        callId: call.id,
        leadId: lead.id,
        customerId: link.customer.id,
        action: link.created ? "customer.created" : "customer.matched",
        summary: link.created
          ? `New customer ${link.customer.name ?? link.customer.phone}`
          : `Matched returning customer ${link.customer.name ?? link.customer.phone} by phone (${link.customer.interactionCount} touches)`,
        idempotencyKey: key("customer"),
      });
    }

    const autoBook = await maybeAutoBookLead(lead.id);
    const bookedJob = autoBook.jobId
      ? await prisma.job.findUnique({
          where: { id: autoBook.jobId },
          select: { id: true, scheduledAt: true, customerConfirmedAt: true },
        })
      : null;

    logInfo("vapi.webhook.auto_book", {
      vapiCallId,
      leadId: lead.id,
      jobId: autoBook.jobId,
      created: autoBook.created,
      qualified: autoBook.qualified,
      skipReason: autoBook.skipReason ?? null,
    });

    const freshLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    const safety = autoBook.classification?.safety;
    const ownerMessage = safety
      ? `SAFETY — ${safety.label}. ${freshLead.name ?? "A caller"} ${freshLead.phone ?? ""} at ${
          freshLead.address ?? "an unknown address"
        }. ${safety.instruction}`
      : buildOwnerLeadAlertMessage({
          lead: {
            name: freshLead.name,
            phone: freshLead.phone,
            serviceType: freshLead.serviceType,
            urgency: freshLead.urgency,
            address: freshLead.address,
          },
          job: bookedJob,
          autoBooked: autoBook.created,
        });

    await enqueueOwnerAlert({
      businessId: business.id,
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
      businessName: business.name,
      message: ownerMessage,
      leadId: lead.id,
      dedupeKey: buildLeadAlertDedupeKey({ vapiCallId }),
    });
    await recordAudit({
      businessId: business.id,
      entityType: "notification",
      entityId: lead.id,
      callId: call.id,
      leadId: lead.id,
      customerId,
      jobId: autoBook.jobId,
      action: "owner.alert_queued",
      summary: business.ownerPhone || business.ownerEmail
        ? `Queued the owner alert${safety ? " (safety)" : ""} — delivery retries automatically`
        : "No owner phone or email on file — alert could not be queued",
      detail: { channels: { sms: Boolean(business.ownerPhone), email: Boolean(business.ownerEmail) } },
      idempotencyKey: key("owner-alert"),
    });

    await completeWebhookEvent({
      source: "vapi",
      externalId: vapiCallId,
      eventType,
      status: "processed",
      payload: {
        callId: call.id,
        leadId: lead.id,
        jobId: autoBook.jobId,
        autoBooked: autoBook.created,
        skipReason: autoBook.skipReason ?? null,
      },
    });

    return {
      duplicate: false,
      callId: call.id,
      leadId: lead.id,
      customerId,
      jobId: autoBook.jobId,
      autoBooked: autoBook.created,
      qualified: autoBook.qualified,
      skipReason: autoBook.skipReason ?? null,
    };
  } catch (error) {
    await completeWebhookEvent({
      source: "vapi",
      externalId: vapiCallId,
      eventType,
      status: "failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

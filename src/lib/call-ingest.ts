import { describeAssistantPromises, detectAssistantPromises } from "@/lib/assistant-promises";
import { latencyColumns, latencyFromReport } from "@/lib/call-latency";
import { createAuditQueue } from "@/lib/audit";
import { maybeAutoBookLead, type AutoBookResult } from "@/lib/auto-job";
import { linkTouchToCustomerDetailed, normalizePhone } from "@/lib/customer";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { isInformationOnlyRequest } from "@/lib/info-request";
import { leadWantsHuman } from "@/lib/lead-wants-human";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { buildLeadAlertDedupeKey, enqueueOwnerAlert } from "@/lib/notifications";
import { buildOwnerLeadAlertMessage } from "@/lib/owner-alert-message";
import { prisma } from "@/lib/prisma";
import { callerWords } from "@/lib/transcript";
import { withCallerSpelling } from "@/lib/spelled-name";
import { extractLeadFromStructuredData, type VapiWebhookMessage } from "@/lib/vapi";
import { claimWebhookEvent, completeWebhookEvent } from "@/lib/webhook-events";
import type { Business, Call, Lead } from "@prisma/client";

/** Call and lead saved, the rest not yet done. */
const CAPTURED = "captured";

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
  const captured = await captureEndOfCallReport(params);
  if (captured.duplicate) return captured;
  return finishCallReport(captured);
}

type Captured = { duplicate: false; business: Business; vapiCallId: string; call: Call; lead: Lead };

/**
 * The part of a report that must be saved before Vapi gets its answer: the
 * call and its lead. Everything after reads only those rows, so it can run
 * after the response and be re-run by sweepUnfinishedCallReports.
 */
export async function captureEndOfCallReport(params: {
  business: { id: string };
  message: VapiWebhookMessage["message"];
  vapiCallId: string;
}): Promise<{ duplicate: true } | Captured> {
  const { message, vapiCallId } = params;
  // Callers resolve the shop from different partial rows; the playbook needs
  // trade and services, so read the whole row once here.
  const eventType = "end-of-call-report";
  const [shopRead, claim] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: params.business.id } }).then(
      (row) => ({ row, error: null }),
      (error: unknown) => ({ row: null, error }),
    ),
    claimWebhookEvent({
      source: "vapi",
      externalId: vapiCallId,
      eventType,
      businessId: params.business.id,
      payload: { type: eventType },
    }),
  ]);
  if (!claim.claimed) return { duplicate: true };
  if (!shopRead.row) {
    // Release the claim now so Vapi's redelivery is processed, not refused as a duplicate.
    await completeWebhookEvent({ source: "vapi", externalId: vapiCallId, eventType, status: "failed", error: "business read failed" });
    throw shopRead.error;
  }
  const business = shopRead.row;

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
    const latency = latencyColumns(latencyFromReport(message));
    const extracted = extractLeadFromStructuredData(message.analysis?.structuredData);
    const spelled = withCallerSpelling(extracted, message.transcript);
    const structured = {
      ...extracted,
      name: spelled.name ?? extracted.name,
      address: spelled.address ?? extracted.address,
    };
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
          callerPhone: message.call?.customer?.number ?? structured.phone ?? null,
          status: "completed",
          summary,
          transcript,
          durationSec,
          recordingUrl,
          successEvaluation,
          ...latency,
        },
        update: {
          status: "completed",
          summary,
          transcript,
          durationSec,
          recordingUrl,
          successEvaluation: successEvaluation ?? undefined,
          callerPhone: message.call?.customer?.number ?? structured.phone ?? undefined,
          ...latency,
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

    await completeWebhookEvent({ source: "vapi", externalId: vapiCallId, eventType, status: CAPTURED });
    return { duplicate: false, business, vapiCallId, call, lead };
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

/** Customer match, booking and the owner alert for a captured call. Safe to re-run. */
export async function finishCallReport(input: Omit<Captured, "duplicate">): Promise<IngestResult> {
  const { business, vapiCallId, call, lead } = input;
  const eventType = "end-of-call-report";
  const { summary, transcript, durationSec, successEvaluation } = call;
  // Stored from the caller ID when Vapi had one, which is all the mismatch check needs.
  const callerId = call.callerPhone;
  try {
    const key = (step: string) => `call:${vapiCallId}:${step}`;
    const audit = createAuditQueue();
    audit.add({
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
    const question = isInformationOnlyRequest({ ...lead, callerWords: callerWords(transcript) });
    const missing = question
      ? []
      : Object.entries(captured)
          .filter(([, v]) => !v)
          .map(([k]) => k);
    audit.add({
      businessId: business.id,
      entityType: "lead",
      entityId: lead.id,
      callId: call.id,
      leadId: lead.id,
      action: "lead.captured",
      summary: question
        ? "Captured a question about the shop — no service intake needed"
        : missing.length
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
      audit.add({
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

    const autoBook = await maybeAutoBookLead(lead.id, { audit });
    const [bookedJob, freshLead] = await Promise.all([
      autoBook.jobId
        ? prisma.job.findUnique({
            where: { id: autoBook.jobId },
            select: { id: true, scheduledAt: true, customerConfirmedAt: true },
          })
        : null,
      prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }),
    ]);

    logInfo("vapi.webhook.auto_book", {
      vapiCallId,
      leadId: lead.id,
      jobId: autoBook.jobId,
      created: autoBook.created,
      qualified: autoBook.qualified,
      skipReason: autoBook.skipReason ?? null,
    });

    const safety = autoBook.classification?.safety;
    const spoken = callerWords(transcript);
    const phoneMismatch =
      Boolean(callerId && freshLead.phone) && normalizePhone(callerId) !== normalizePhone(freshLead.phone);
    const wantsHuman = leadWantsHuman({ notes: `${freshLead.notes ?? ""} ${spoken}`, serviceType: freshLead.serviceType });
    // Sales reps routinely ask for the owner, so a request for a person does not rescue a non-service call.
    const nonService = !safety && !autoBook.jobId && freshLead.categoryCode === "other.non_service";

    // A time read out after hold_appointment came from the schedule, not the model.
    const promises = detectAssistantPromises(transcript).filter(
      (promise) => !(promise.kind === "arrival" && call.heldSlotAt),
    );
    if (promises.length) {
      audit.add({
        businessId: business.id,
        entityType: "call",
        entityId: call.id,
        callId: call.id,
        leadId: lead.id,
        customerId,
        action: "call.promise_flagged",
        summary: describeAssistantPromises(promises) ?? "Receptionist made a commitment",
        detail: { promises },
        idempotencyKey: key("promises"),
      });
    }

    if (nonService) {
      audit.add({
        businessId: business.id,
        entityType: "notification",
        entityId: lead.id,
        callId: call.id,
        leadId: lead.id,
        customerId,
        action: "owner.alert_skipped",
        summary: "Not a service call (spam, sales or wrong number) — owner not texted; call kept in the log",
        detail: { categoryCode: freshLead.categoryCode },
        idempotencyKey: key("owner-alert"),
      });
    }

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
          timezone: business.timezone,
          context: {
            skipReason: autoBook.skipReason ?? null,
            intent: autoBook.intent ?? null,
            existingJob: autoBook.existingJob ?? null,
            wantsHuman,
            callerId: phoneMismatch ? callerId : null,
            silentHangup: !spoken.trim() && !freshLead.serviceType && (durationSec ?? 0) < 30,
            promiseWarning: describeAssistantPromises(promises),
            heldSlotAt: !autoBook.jobId && call.heldSlotAt ? call.heldSlotAt : null,
            summary,
          },
        });

    if (!nonService) {
      await enqueueOwnerAlert({
        businessId: business.id,
        ownerPhone: business.ownerPhone,
        ownerEmail: business.ownerEmail,
        businessName: business.name,
        message: ownerMessage,
        leadId: lead.id,
        dedupeKey: buildLeadAlertDedupeKey({ vapiCallId }),
      });
      audit.add({
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
    }

    await Promise.all([
      audit.flush(),
      completeWebhookEvent({
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
      }),
    ]);

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

const FINISH_GRACE_MS = 5 * 60_000;
const FINISH_LOOKBACK_MS = 24 * 60 * 60_000;

/**
 * Vapi is answered once the call is saved, so a function that dies before
 * finishing leaves a call nobody booked or alerted on, and Vapi will not send
 * it again. This finishes those. One try each: if finishing fails again the
 * owner still gets a plain alert under the same dedupe key.
 */
export async function sweepUnfinishedCallReports(now = new Date()): Promise<number> {
  const eventType = "end-of-call-report";
  const events = await prisma.webhookEvent.findMany({
    where: {
      source: "vapi",
      eventType,
      status: { in: [CAPTURED, "failed"] },
      createdAt: { gte: new Date(now.getTime() - FINISH_LOOKBACK_MS), lte: new Date(now.getTime() - FINISH_GRACE_MS) },
    },
    select: { id: true, externalId: true, status: true },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  if (!events.length) return 0;
  const calls = await prisma.call.findMany({
    where: { vapiCallId: { in: events.map((e) => e.externalId) } },
    include: { lead: true, business: true },
  });

  let finished = 0;
  for (const event of events) {
    const call = calls.find((c) => c.vapiCallId === event.externalId);
    // Failed before the call was saved: Vapi's redelivery or line watch recovers those.
    if (!call?.lead) continue;
    const claimed = await prisma.webhookEvent.updateMany({
      where: { id: event.id, status: event.status },
      data: { status: "processing" },
    });
    if (!claimed.count) continue;
    const { business, lead, ...row } = call;
    try {
      await finishCallReport({ business, vapiCallId: event.externalId, call: row, lead });
      finished += 1;
      logWarn("vapi.call_report_finished_late", { businessId: business.id, vapiCallId: event.externalId });
    } catch (error) {
      logError("vapi.call_report_unfinished", {
        businessId: business.id,
        vapiCallId: event.externalId,
        error: error instanceof Error ? error.message : "unknown",
      });
      await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "abandoned" } });
      await enqueueOwnerAlert({
        businessId: business.id,
        ownerPhone: business.ownerPhone,
        ownerEmail: business.ownerEmail,
        businessName: business.name,
        message: [`New call · ${lead.serviceType ?? "needs review"}`, lead.phone, lead.address, call.summary]
          .filter(Boolean)
          .join("\n"),
        leadId: lead.id,
        dedupeKey: buildLeadAlertDedupeKey({ vapiCallId: event.externalId }),
      }).catch(() => undefined);
    }
  }
  return finished;
}

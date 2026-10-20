import { describeAssistantPromises, detectAssistantPromises } from "@/lib/assistant-promises";
import { recordSetupMilestone } from "@/lib/workflow-events";
import { costColumns } from "@/lib/call-cost";
import { latencyColumns, latencyFromReport } from "@/lib/call-latency";
import { afterResponse } from "@/lib/after-response";
import { createAuditQueue } from "@/lib/audit";
import { maybeAutoBookLead, type AutoBookResult } from "@/lib/auto-job";
import { linkTouchToCustomerDetailed, normalizePhone } from "@/lib/customer";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { isInformationOnlyRequest } from "@/lib/info-request";
import { drainJobberSyncs, enqueueJobberSync } from "@/lib/jobber";
import { looksLikeSalesSolicitation } from "@/lib/job-taxonomy";
import { drainHousecallSyncs, enqueueHousecallSync } from "@/lib/housecall";
import { drainServiceTitanSyncs, enqueueServiceTitanSync } from "@/lib/servicetitan";
import { leadWantsHuman } from "@/lib/lead-wants-human";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { buildLeadAlertDedupeKey, enqueueOwnerAlert } from "@/lib/notifications";
import { buildOwnerLeadAlertMessage } from "@/lib/owner-alert-message";
import { passConsentedCallLead } from "@/lib/orvius-network";
import { NETWORK_DISCLOSURE_VERSION } from "@/lib/in-call-tool-defs";
import { prisma } from "@/lib/prisma";
import { inventedNumbers, trustedCallbackNumber } from "@/lib/callback-number";
import { callerWords } from "@/lib/transcript";
import { withCallerSpelling } from "@/lib/spelled-name";
import { extractLeadFromStructuredData, type VapiWebhookMessage } from "@/lib/vapi";
import { claimWebhookEvent, completeWebhookEvent } from "@/lib/webhook-events";
import type { Business, Call, Lead } from "@prisma/client";

/** Call and lead saved, the rest not yet done. */
const CAPTURED = "captured";

function hasNetworkConsentEvidence(raw: string | null | undefined) {
  if (!raw) return false;
  try {
    const evidence = JSON.parse(raw) as { callerLine?: string; disclosureVersion?: string };
    return Boolean(evidence.callerLine) && evidence.disclosureVersion === NETWORK_DISCLOSURE_VERSION;
  } catch {
    return false;
  }
}

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
    const latency = { ...latencyColumns(latencyFromReport(message)), ...costColumns(message) };
    const extracted = extractLeadFromStructuredData(message.analysis?.structuredData);
    const spelled = withCallerSpelling(extracted, message.transcript);
    const callerIdNumber = message.call?.customer?.number ?? null;
    const callback = trustedCallbackNumber({ extracted: extracted.phone, callerId: callerIdNumber, transcript: message.transcript });
    if (callback.replaced) {
      logWarn("call.callback_number_replaced", { businessId: business.id, vapiCallId, reason: "caller_never_said_extracted_number" });
    }
    if (callback.withheld) {
      logWarn("call.callback_number_withheld", { businessId: business.id, vapiCallId, reason: "no_caller_id_and_caller_never_said_it" });
    }
    const structured = {
      ...extracted,
      phone: callback.phone ?? undefined,
      name: spelled.name ?? extracted.name,
      address: spelled.address ?? extracted.address,
    };
    const demand = deriveDemandSignal({
      serviceType: structured.serviceType,
      notes: structured.notes,
      summary,
      address: structured.address,
      categoryHint: structured.jobCategory,
      callerWords: callerWords(transcript),
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
          endedReason: message.endedReason ?? null,
          ...latency,
        },
        update: {
          status: "completed",
          summary,
          transcript,
          durationSec,
          recordingUrl,
          successEvaluation: successEvaluation ?? undefined,
          endedReason: message.endedReason ?? undefined,
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
    if (!business.lineVerifiedAt) await recordSetupMilestone(business.id, "line_proven", new Date(), { callId: call.id }).catch(() => undefined);
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
    if (!callerId && !lead.phone) {
      audit.add({
        businessId: business.id,
        entityType: "call",
        entityId: call.id,
        callId: call.id,
        leadId: lead.id,
        action: "call.callback_withheld",
        summary: "No callback number on record — caller ID was hidden and the caller never said a full number. Check the recording before calling back.",
        idempotencyKey: key("callback-withheld"),
      });
    }
    const invented = inventedNumbers(transcript, [business.vapiPhoneNumber, business.transferPhone]);
    if (invented.length) {
      audit.add({
        businessId: business.id,
        entityType: "call",
        entityId: call.id,
        callId: call.id,
        leadId: lead.id,
        action: "call.invented_number",
        summary: callerId
          ? "Orvius read back a phone number the caller never said — the callback uses the number they called from"
          : "Orvius read back a phone number the caller never said — confirm the callback number before calling",
        detail: { quote: invented[0].slice(0, 160) },
        idempotencyKey: key("invented-number"),
      });
    }

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
    /* Sales reps routinely ask for the owner, so a request for a person does not rescue a non-service call.
       An address or a known customer does: that's someone with a property, and the label is the model's guess. */
    // Every caller gets a customer row — this call's own start handler makes
    // it — so "returning" must mean the row predates this call, not merely
    // that it exists by now. Without that, every spam caller looks known.
    const returningCustomer = Boolean(
      link && link.customer.createdAt && call.createdAt && link.customer.createdAt.getTime() < call.createdAt.getTime(),
    );
    const looksLikeWork = Boolean(freshLead.address?.trim() || returningCustomer);
    const nonService = !safety && !autoBook.jobId && freshLead.categoryCode === "other.non_service" && !looksLikeWork;
    /* A label is the model's guess; minutes on the line are a fact. A caller
       who talked for a minute is worth a glance even when the intake came
       back non-service — spam hangs up, customers explain. Selling is the
       exception: a sales rep talks at length and asks for the owner, and
       that is exactly what the owner's phone stays quiet for. */
    const engagedMinutes = Math.floor((durationSec ?? 0) / 60);
    const salesPitch = looksLikeSalesSolicitation(`${freshLead.serviceType ?? ""} ${freshLead.notes ?? ""} ${spoken}`);
    /* Asked for a person, transfer number set, never connected: whether the
       transfer failed or the model never tried, the owner needs one line —
       someone who wanted them slipped through. Never claim the transfer
       itself failed; only what the owner can act on. */
    const forwarded = call.endedReason === "assistant-forwarded-call";
    const handoffMissed = wantsHuman && Boolean(business.transferPhone) && !forwarded && !autoBook.jobId && !salesPitch;
    const silenced = nonService && (engagedMinutes < 1 || salesPitch) && !handoffMissed;

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

    if (silenced) {
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

    const network =
      call.networkConsentAt && hasNetworkConsentEvidence(call.networkConsentJson) && !safety && !autoBook.jobId && !nonService
        ? await passConsentedCallLead(
            { id: business.id, name: business.name, trade: business.trade, address: business.address, networkOn: business.networkOn },
            { ...freshLead, job: null },
          ).catch((error) => {
            logWarn("network.call_pass_failed", { leadId: lead.id, error: error instanceof Error ? error.message : String(error) });
            return null;
          })
        : null;
    const networkNote =
      network && "offered" in network
        ? network.offered
          ? `\nYou were booked solid, so the caller agreed to a nearby pro. Offered to ${network.offered} Orvius Network shop${network.offered === 1 ? "" : "s"}.`
          : "\nYou were booked solid and the caller agreed to a nearby pro, but no Orvius Network shop nearby was free. Call them back."
        : "";

    const baseOwnerMessage = safety
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
    const ownerMessage = `${handoffMissed ? "They asked for a person and didn't reach one — call back now. " : ""}${nonService && !silenced ? `Filed as a non-service call, but they talked for ${engagedMinutes} min — worth a glance. ` : ""}${baseOwnerMessage}${networkNote}`;

    if (!silenced) {
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

    const toJobber = await enqueueJobberSync({
      businessId: business.id,
      leadId: lead.id,
      skipReason: autoBook.skipReason,
      nonService,
    }).catch((error) => {
      logWarn("jobber.enqueue_failed", { leadId: lead.id, error: error instanceof Error ? error.message : String(error) });
      return false;
    });
    if (toJobber) await afterResponse(() => drainJobberSyncs({ businessId: business.id, limit: 5 }));
    const toHousecall = await enqueueHousecallSync({
      businessId: business.id,
      leadId: lead.id,
      skipReason: autoBook.skipReason,
      nonService,
    }).catch((error) => {
      logWarn("housecall.enqueue_failed", { leadId: lead.id, error: error instanceof Error ? error.message : String(error) });
      return false;
    });
    if (toHousecall) await afterResponse(() => drainHousecallSyncs({ businessId: business.id, limit: 5 }));
    const toServiceTitan = await enqueueServiceTitanSync({
      businessId: business.id,
      leadId: lead.id,
      skipReason: autoBook.skipReason,
      nonService,
    }).catch((error) => {
      logWarn("servicetitan.enqueue_failed", { leadId: lead.id, error: error instanceof Error ? error.message : String(error) });
      return false;
    });
    if (toServiceTitan) await afterResponse(() => drainServiceTitanSyncs({ businessId: business.id, limit: 5 }));

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
const FINISH_CLAIM_LEASE_MS = 10 * 60_000;

/**
 * Vapi is answered once the call is saved, so a function that dies before
 * finishing leaves a call nobody booked or alerted on, and Vapi will not send
 * it again. This finishes those. One try each: if finishing fails again the
 * owner still gets a plain alert under the same dedupe key.
 */
const FINISH_MAX_ATTEMPTS = 12;

export async function sweepUnfinishedCallReports(now = new Date()): Promise<number> {
  const eventType = "end-of-call-report";
  /* A sweep killed mid-finish (function timeout, deploy) leaves its row in
     "processing" for good unless the claim can expire. */
  const leaseCut = new Date(now.getTime() - FINISH_CLAIM_LEASE_MS);
  const where = {
    source: "vapi",
    eventType,
    OR: [
      { status: { in: [CAPTURED, "failed"] } },
      { status: "processing", claimedAt: { lt: leaseCut } },
      { status: "processing", claimedAt: null, createdAt: { lt: leaseCut } },
    ],
    createdAt: { gte: new Date(now.getTime() - FINISH_LOOKBACK_MS), lte: new Date(now.getTime() - FINISH_GRACE_MS) },
  };
  // Events whose call was never saved are skipped but stay in the window for a
  // day. Reading only the oldest 25 let a burst of those starve every newer
  // call behind them, so scan past them until 25 finishable calls are found.
  const FINISH_BATCH = 25;
  const SCAN_PAGE = 100;
  const SCAN_LIMIT = 1000;
  const finishable: Array<{
    event: { id: string; externalId: string; status: string; attempts: number; claimedAt: Date | null };
    call: Call & { lead: Lead; business: Business };
  }> = [];
  let cursor: string | undefined;
  for (let scanned = 0; scanned < SCAN_LIMIT && finishable.length < FINISH_BATCH; ) {
    const page = await prisma.webhookEvent.findMany({
      where,
      select: { id: true, externalId: true, status: true, attempts: true, claimedAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: SCAN_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!page.length) break;
    scanned += page.length;
    cursor = page[page.length - 1]!.id;
    const calls = await prisma.call.findMany({
      where: { vapiCallId: { in: page.map((e) => e.externalId) } },
      include: { lead: true, business: true },
    });
    for (const event of page) {
      const call = calls.find((c) => c.vapiCallId === event.externalId);
      // Failed before the call was saved: Vapi's redelivery or line watch recovers those.
      if (call?.lead) finishable.push({ event, call: { ...call, lead: call.lead } });
      if (finishable.length >= FINISH_BATCH) break;
    }
    if (page.length < SCAN_PAGE) break;
  }
  if (!finishable.length) return 0;

  let finished = 0;
  for (const { event, call } of finishable) {
    const claimed = await prisma.webhookEvent.updateMany({
      where: { id: event.id, status: event.status, claimedAt: event.claimedAt },
      data: { status: "processing", claimedAt: new Date() },
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
      // The owner hears on the first failure; the booking keeps retrying for about an hour of sweeps.
      const attempts = event.attempts + 1;
      const lastTry = attempts >= FINISH_MAX_ATTEMPTS;
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: lastTry ? "abandoned" : "failed",
          attempts,
          error: (error instanceof Error ? error.message : "unknown").slice(0, 280),
        },
      });
      /* Abandoning with a promised time still on the table is the one failure
         the owner must act on: the caller heard a time that isn't booked.
         It rides its own dedupe key so the earlier plain alert can't swallow
         it, and it names the promise in the shop's own timezone. */
      let promiseNote = "";
      const promisedAt = call.heldSlotAt ? new Date(call.heldSlotAt) : null;
      if (lastTry && promisedAt && !Number.isNaN(promisedAt.getTime())) {
        try {
          const when = promisedAt.toLocaleString("en-US", {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
            timeZone: business.timezone ?? undefined,
          });
          promiseNote = ` They were promised ${when} and it isn't booked.`;
        } catch {
          promiseNote = " They were promised a time and it isn't booked.";
        }
      }
      await enqueueOwnerAlert({
        businessId: business.id,
        ownerPhone: business.ownerPhone,
        ownerEmail: business.ownerEmail,
        businessName: business.name,
        message: [
          lastTry && promiseNote
            ? `The booking didn't go through — call back now.${promiseNote}`
            : `New call · ${lead.serviceType ?? "needs review"}`,
          lead.phone,
          lead.address,
          call.summary,
        ]
          .filter(Boolean)
          .join("\n"),
        leadId: lead.id,
        dedupeKey: lastTry
          ? `${buildLeadAlertDedupeKey({ vapiCallId: event.externalId })}:abandoned`
          : buildLeadAlertDedupeKey({ vapiCallId: event.externalId }),
      }).catch(() => undefined);
    }
  }
  return finished;
}

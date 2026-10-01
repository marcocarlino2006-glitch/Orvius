import { NextRequest, NextResponse } from "next/server";
import { afterResponse } from "@/lib/after-response";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { linkTouchToCustomer, normalizePhone } from "@/lib/customer";
import { inferExplicitUrgency, maybeAutoBookLead } from "@/lib/auto-job";
import { company } from "@/lib/company";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { demandCategoryLabel } from "@/lib/job-taxonomy";
import { buildOwnerLeadAlertMessage } from "@/lib/owner-alert-message";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildLeadAlertDedupeKey,
  enqueueOwnerAlert,
  processNotificationQueue,
} from "@/lib/notifications";
import { isOwnerCaptureDoneKeyword } from "@/lib/carrier-forward";
import { phonesEqual } from "@/lib/owner-alerts";
import {
  parseSmsKeyword,
  smsHelpReply,
  smsStartConfirmation,
  smsStopConfirmation,
} from "@/lib/sms-keywords";
import {
  getTwilioSmsWebhookUrl,
  validateTwilioRequest,
} from "@/lib/webhook-auth";
import { recordWebhookEvent } from "@/lib/webhook-events";
import { resolveBusinessForInboundSms } from "@/lib/resolve-shop-line";
import { twimlMessage as twimlResponse } from "@/lib/twiml";
import { tooManyRequests, webhookAuthFailureLimited } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { answerFollowUpReply } from "@/lib/lead-follow-up";
import { hasActiveOwnerConversation, inboundMediaFromForm, PHOTO_ONLY_BODY, recordMessage } from "@/lib/messages";
import { hasOpenWebChat } from "@/lib/web-chat";

const SMS_REPLY =
  "Thanks for contacting us! We received your message and will get back to you shortly. For urgent service, call us directly.";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = String(form.get("From") ?? "");
  const to = String(form.get("To") ?? "");
  const typed = String(form.get("Body") ?? "").trim();
  const messageSid = String(form.get("MessageSid") ?? "").trim();

  const formEntries = Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, String(value)]),
  );

  if (
    !validateTwilioRequest({
      signature: request.headers.get("x-twilio-signature"),
      url: getTwilioSmsWebhookUrl(),
      formEntries,
    })
  ) {
    const limited = webhookAuthFailureLimited(request, "twilio-sms");
    if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }

  const media = inboundMediaFromForm(formEntries);
  const body = typed || (media.length ? PHOTO_ONLY_BODY : "");
  if (!from || !to || !body) {
    return twimlResponse("");
  }

  const business = await resolveBusinessForInboundSms({ to, from });

  if (!business) {
    /*
      `to` is one of our own numbers, so failing to resolve it to a shop is a
      misconfiguration on our side and the text is lost. Unlike the Vapi report
      this cannot answer 5xx — Twilio does not retry inbound message webhooks
      and a non-2xx would also swallow the reply to the customer — so the miss
      is written down instead of leaving only a log line nobody queries.
    */
    await recordWebhookEvent({
      source: "twilio-sms",
      externalId: messageSid || `unrouted:${to}:${from}:${Date.now()}`,
      eventType: "inbound",
      status: "failed",
      payload: { from, to },
      error: "no shop owns this inbound number",
    });
    logWarn("twilio.sms.business_not_found", { from, to, messageSid });
    return twimlResponse(
      "Thanks for your message. We'll follow up as soon as possible.",
    );
  }

  // Owner replies DONE after forward/publish — stamp only after a real prove call.
  if (
    isOwnerCaptureDoneKeyword(body) &&
    phonesEqual(from, business.ownerPhone)
  ) {
    if (!business.lineVerifiedAt) {
      return twimlResponse(
        "Almost — call your Orvius line once so we know it answers, then reply DONE.",
      );
    }
    await prisma.business.update({
      where: { id: business.id },
      data: {
        overflowForwardConfirmedAt: new Date(),
      },
    });
    await recordWebhookEvent({
      source: "twilio-sms",
      externalId: messageSid || `${business.id}:${from}:done`,
      eventType: "keyword-done",
      businessId: business.id,
      status: "processed",
      payload: { from, to, keyword: "done" },
    });
    logInfo("twilio.sms.owner_capture_done", {
      businessId: business.id,
      messageSid,
    });
    return twimlResponse(
      "Got it — call capture marked done. Open Command and work the next lead.",
    );
  }

  const fromOwner = phonesEqual(from, business.ownerPhone);
  if (!fromOwner) {
    await recordMessage({
      businessId: business.id,
      phone: from,
      direction: "in",
      author: "customer",
      body,
      sid: messageSid || null,
      media,
    });
  }
  const reply = async (text: string) => {
    if (!fromOwner && text) {
      await recordMessage({
        businessId: business.id,
        phone: from,
        direction: "out",
        author: "orvius",
        body: text,
        sid: messageSid ? `reply:${messageSid}` : null,
      });
    }
    return twimlResponse(text);
  };

  const keyword = parseSmsKeyword(body);
  if (keyword) {
    const keywordReply = await handleSmsKeyword({
      keyword,
      businessId: business.id,
      from,
      ownerPhone: business.ownerPhone,
    });
    await recordWebhookEvent({
      source: "twilio-sms",
      externalId: messageSid || `${business.id}:${from}:${keyword}`,
      eventType: `keyword-${keyword}`,
      businessId: business.id,
      status: "processed",
      payload: { from, to, keyword },
    });
    logInfo("twilio.sms.keyword", {
      keyword,
      businessId: business.id,
      messageSid,
    });
    return reply(keywordReply);
  }

  if (messageSid) {
    const existing = await prisma.lead.findFirst({
      where: { businessId: business.id, externalId: messageSid },
      select: { id: true },
    });
    if (existing) {
      logInfo("twilio.sms.duplicate", {
        messageSid,
        businessId: business.id,
        leadId: existing.id,
      });
      return twimlResponse(SMS_REPLY);
    }
  }

  if (
    !fromOwner &&
    ((await hasActiveOwnerConversation(business.id, from)) || (await hasOpenWebChat(business.id, from)))
  ) {
    await alertOwnerOfReply({ business, from, body, messageSid });
    await recordWebhookEvent({
      source: "twilio-sms",
      externalId: messageSid || `${business.id}:${from}:conversation:${Date.now()}`,
      eventType: "inbound-conversation",
      businessId: business.id,
      status: "processed",
      payload: { from, to },
    });
    await afterResponse(() => drainOwnerAlerts({ at: "twilio.sms.conversation", messageSid, businessId: business.id }));
    return twimlResponse("");
  }

  const followUpReply = await answerFollowUpReply({ business, from, to, body, messageSid });
  if (followUpReply) return reply(followUpReply);

  // A text says "SMS inquiry" in serviceType and everything real in the body,
  // so the widened pass is what classifies these.
  const demand = deriveDemandSignal({
    serviceType: "SMS inquiry",
    notes: body,
    trade: tradeForCapture(business),
  });
  const serviceType =
    demandCategoryLabel(demand.categoryCode) ?? "SMS inquiry";
  const urgency = inferExplicitUrgency(body);

  let lead;
  try {
    lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        externalId: messageSid || null,
        phone: from,
        notes: media.length ? `${body}\n[${media.length} photo${media.length === 1 ? "" : "s"} in Inbox → Messages]` : body,
        serviceType,
        urgency,
        source: "sms",
        status: "new",
        categoryCode: demand.categoryCode,
        postalCode: demand.postalCode,
      },
    });
  } catch (error) {
    // A concurrent delivery of the same MessageSid won the insert.
    if ((error as { code?: string })?.code === "P2002") {
      logInfo("twilio.sms.duplicate", { messageSid, businessId: business.id });
      return twimlResponse(SMS_REPLY);
    }
    throw error;
  }

  /*
    Twilio never redelivers an inbound text, so once the lead exists nothing
    after it may stop the owner alert. A failure here costs the booking, not
    the alert; the stranded-lead sweep covers a function that dies outright.
  */
  let autoBook: Awaited<ReturnType<typeof maybeAutoBookLead>> = {
    jobId: null,
    created: false,
    qualified: false,
  };
  let bookedJob: { id: string; scheduledAt: Date | null; customerConfirmedAt: Date | null } | null = null;
  try {
    await recordAudit({
      businessId: business.id,
      entityType: "lead",
      entityId: lead.id,
      action: "lead.captured",
      summary: `Text captured — ${serviceType}${urgency ? ` · ${urgency}` : ""}`,
      detail: { channel: "sms", categoryCode: demand.categoryCode },
      leadId: lead.id,
      idempotencyKey: `sms:${messageSid || lead.id}:captured`,
    });

    await linkTouchToCustomer({
      businessId: business.id,
      leadId: lead.id,
      phone: from,
      notes: body,
    });

    autoBook = await maybeAutoBookLead(lead.id);
    bookedJob = autoBook.jobId
      ? await prisma.job.findUnique({
          where: { id: autoBook.jobId },
          select: { id: true, scheduledAt: true, customerConfirmedAt: true },
        })
      : null;
  } catch (error) {
    logError("twilio.sms.post_capture_failed", {
      messageSid,
      leadId: lead.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  logInfo("twilio.sms.auto_book", {
    messageSid,
    leadId: lead.id,
    jobId: autoBook.jobId,
    created: autoBook.created,
    qualified: autoBook.qualified,
    skipReason: autoBook.skipReason ?? null,
  });

  const ownerMessage = buildOwnerLeadAlertMessage({
    lead: {
      name: null,
      phone: from,
      serviceType,
      urgency,
      address: null,
    },
    job: bookedJob,
    autoBooked: autoBook.created,
    timezone: business.timezone,
    context: {
      skipReason: autoBook.skipReason ?? null,
      intent: autoBook.intent ?? null,
      existingJob: autoBook.existingJob ?? null,
    },
  });

  await enqueueOwnerAlert({
    businessId: business.id,
    ownerPhone: business.ownerPhone,
    ownerEmail: business.ownerEmail,
    businessName: business.name,
    message: [
      autoBook.skipReason === "safety_escalation" && autoBook.classification?.safety
        ? `SAFETY — ${autoBook.classification.safety.label}. ${autoBook.classification.safety.instruction}`
        : null,
      ownerMessage,
      `Message: ${body}`,
    ]
      .filter(Boolean)
      .join("\n"),
    leadId: lead.id,
    dedupeKey: buildLeadAlertDedupeKey({
      messageSid: messageSid || lead.id,
    }),
  });

  await recordWebhookEvent({
    source: "twilio-sms",
    externalId: messageSid || lead.id,
    eventType: "inbound",
    businessId: business.id,
    status: "processed",
    payload: { from, to, leadId: lead.id },
  });

  await afterResponse(() => drainOwnerAlerts({ at: "twilio.sms", messageSid, businessId: business.id }));

  const safetyReply =
    autoBook.skipReason === "safety_escalation" ||
    demand.categoryCode === "plumb.gas" ||
    demand.categoryCode === "elec.hazard"
      ? "If there is immediate danger, leave the area and call 911. We received your service request and will follow up shortly."
      : SMS_REPLY;
  return reply(safetyReply);
}

async function alertOwnerOfReply(params: {
  business: { id: string; name: string; ownerPhone: string | null; ownerEmail: string | null };
  from: string;
  body: string;
  messageSid: string;
}) {
  await enqueueOwnerAlert({
    businessId: params.business.id,
    ownerPhone: params.business.ownerPhone,
    ownerEmail: params.business.ownerEmail,
    businessName: params.business.name,
    message: `Reply from ${params.from}: ${params.body}\nAnswer it in Inbox → Messages.`,
    dedupeKey: `sms-reply:${params.messageSid || `${params.from}:${Date.now()}`}`,
  });
}

async function handleSmsKeyword(params: {
  keyword: "stop" | "help" | "start";
  businessId: string;
  from: string;
  ownerPhone: string | null;
}) {
  const program = company.smsProgramName;
  const fromNorm = normalizePhone(params.from);
  const ownerNorm = normalizePhone(params.ownerPhone);

  if (params.keyword === "help") {
    return smsHelpReply({
      programName: program,
      supportEmail: company.supportEmail,
    });
  }

  if (params.keyword === "stop") {
    if (fromNorm && ownerNorm && fromNorm === ownerNorm) {
      await prisma.business.update({
        where: { id: params.businessId },
        data: { ownerSmsOptOutAt: new Date() },
      });
    }
    if (fromNorm) {
      await prisma.smsOptOut.upsert({
        where: {
          businessId_phoneNormalized: {
            businessId: params.businessId,
            phoneNormalized: fromNorm,
          },
        },
        create: {
          businessId: params.businessId,
          phone: params.from,
          phoneNormalized: fromNorm,
          source: "inbound-sms",
          clearedAt: null,
        },
        update: {
          phone: params.from,
          source: "inbound-sms",
          clearedAt: null,
        },
      });
    }
    return smsStopConfirmation(program);
  }

  // start / re-subscribe
  if (fromNorm && ownerNorm && fromNorm === ownerNorm) {
    await prisma.business.update({
      where: { id: params.businessId },
      data: { ownerSmsOptOutAt: null },
    });
  }
  if (fromNorm) {
    await prisma.smsOptOut.updateMany({
      where: {
        businessId: params.businessId,
        phoneNormalized: fromNorm,
        clearedAt: null,
      },
      data: { clearedAt: new Date() },
    });
  }
  return smsStartConfirmation(program);
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-sms-webhook" });
}

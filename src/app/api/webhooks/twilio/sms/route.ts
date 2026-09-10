import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
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
import { resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";

const SMS_REPLY =
  "Thanks for contacting us! We received your message and will get back to you shortly. For urgent service, call us directly.";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = String(form.get("From") ?? "");
  const to = String(form.get("To") ?? "");
  const body = String(form.get("Body") ?? "").trim();
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
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }

  if (!from || !to || !body) {
    return twimlResponse("");
  }

  const business = await resolveBusinessByInboundPhone(to);

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
      "Got it — call capture marked done. Open Today and work the next lead.",
    );
  }

  const keyword = parseSmsKeyword(body);
  if (keyword) {
    const reply = await handleSmsKeyword({
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
    return twimlResponse(reply);
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

  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      externalId: messageSid || null,
      phone: from,
      notes: body,
      serviceType,
      urgency,
      source: "sms",
      status: "new",
      categoryCode: demand.categoryCode,
      postalCode: demand.postalCode,
    },
  });

  await linkTouchToCustomer({
    businessId: business.id,
    leadId: lead.id,
    phone: from,
    notes: body,
  });

  const autoBook = await maybeAutoBookLead(lead.id);
  const bookedJob = autoBook.jobId
    ? await prisma.job.findUnique({
        where: { id: autoBook.jobId },
        select: { id: true, scheduledAt: true, customerConfirmedAt: true },
      })
    : null;

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
  });

  await enqueueOwnerAlert({
    businessId: business.id,
    ownerPhone: business.ownerPhone,
    ownerEmail: business.ownerEmail,
    businessName: business.name,
    message: [ownerMessage, `Message: ${body}`].filter(Boolean).join("\n"),
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

  after(async () => {
    try {
      await processNotificationQueue(10);
    } catch (error) {
      logError("twilio.sms.queue_process_failed", {
        messageSid,
        businessId: business.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  });

  const safetyReply =
    demand.categoryCode === "plumb.gas" ||
    demand.categoryCode === "elec.hazard"
      ? "If there is immediate danger, leave the area and call 911. We received your service request and will follow up shortly."
      : SMS_REPLY;
  return twimlResponse(safetyReply);
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

function twimlResponse(message: string) {
  const twiml = message
    ? `<Response><Message>${escapeXml(message)}</Message></Response>`
    : "<Response></Response>";

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-sms-webhook" });
}

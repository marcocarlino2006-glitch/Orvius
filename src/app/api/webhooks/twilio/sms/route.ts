import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { linkTouchToCustomer, normalizePhone } from "@/lib/customer";
import { maybeAutoBookLead } from "@/lib/auto-job";
import { company } from "@/lib/company";
import { buildOwnerLeadAlertMessage } from "@/lib/owner-alert-message";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildLeadAlertDedupeKey,
  enqueueOwnerAlert,
  processNotificationQueue,
} from "@/lib/notifications";
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
    logWarn("twilio.sms.business_not_found", { from, to, messageSid });
    return twimlResponse(
      "Thanks for your message. We'll follow up as soon as possible.",
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

  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      externalId: messageSid || null,
      phone: from,
      notes: body,
      serviceType: "SMS inquiry",
      source: "sms",
      status: "new",
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
        select: { id: true, scheduledAt: true },
      })
    : null;

  const ownerMessage = buildOwnerLeadAlertMessage({
    lead: {
      name: null,
      phone: from,
      serviceType: "SMS inquiry",
      urgency: null,
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

  return twimlResponse(SMS_REPLY);
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

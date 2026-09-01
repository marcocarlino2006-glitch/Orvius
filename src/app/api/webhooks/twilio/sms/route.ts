import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { linkTouchToCustomer } from "@/lib/customer";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildLeadAlertDedupeKey,
  enqueueOwnerAlert,
  processNotificationQueue,
} from "@/lib/notifications";
import {
  getTwilioSmsWebhookUrl,
  validateTwilioRequest,
} from "@/lib/webhook-auth";
import { recordWebhookEvent } from "@/lib/webhook-events";

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

  const business = await prisma.business.findFirst({
    where: {
      isActive: true,
      OR: [{ twilioPhone: to }, { vapiPhoneNumber: to }],
    },
  });

  if (!business) {
    logWarn("twilio.sms.business_not_found", { from, to, messageSid });
    return twimlResponse(
      "Thanks for your message. We'll follow up as soon as possible.",
    );
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

  await enqueueOwnerAlert({
    businessId: business.id,
    ownerPhone: business.ownerPhone,
    ownerEmail: business.ownerEmail,
    businessName: business.name,
    message: [`New SMS lead`, `From: ${from}`, `Message: ${body}`].join("\n"),
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

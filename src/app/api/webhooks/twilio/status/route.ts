import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logInfo } from "@/lib/logger";
import {
  getTwilioStatusWebhookUrl,
  validateTwilioRequest,
} from "@/lib/webhook-auth";
import { recordWebhookEvent } from "@/lib/webhook-events";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const messageSid = String(form.get("MessageSid") ?? "").trim();
  const messageStatus = String(form.get("MessageStatus") ?? "").trim();
  const errorCode = String(form.get("ErrorCode") ?? "").trim();

  const formEntries = Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, String(value)]),
  );

  if (
    !validateTwilioRequest({
      signature: request.headers.get("x-twilio-signature"),
      url: getTwilioStatusWebhookUrl(),
      formEntries,
    })
  ) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }

  if (!messageSid) {
    return NextResponse.json({ ok: true, skipped: "missing MessageSid" });
  }

  const updated = await prisma.ownerNotification.updateMany({
    where: { deliveryId: messageSid, channel: "sms" },
    data: {
      deliveryStatus: messageStatus || "unknown",
      ...(errorCode ? { error: `Twilio error ${errorCode}` } : {}),
    },
  });

  await recordWebhookEvent({
    source: "twilio-status",
    externalId: messageSid,
    eventType: messageStatus || "status",
    status: "processed",
    payload: { messageStatus, errorCode, matched: updated.count },
  });

  if (updated.count > 0) {
    logInfo("twilio.status.updated", {
      messageSid,
      messageStatus,
      matched: updated.count,
    });
  }

  return NextResponse.json({ ok: true, matched: updated.count });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-status-webhook" });
}

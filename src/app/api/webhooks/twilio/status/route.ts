import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { prisma } from "@/lib/prisma";
import { logInfo } from "@/lib/logger";
import { applySmsDeliveryReceipt } from "@/lib/notification-queue";
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

  /*
    The receipt is the only place a carrier rejection is ever reported, so it
    has to be the place the retry ladder gets reopened. Updating
    `deliveryStatus` above is bookkeeping; this is the part that acts on it.
  */
  const receipt = await applySmsDeliveryReceipt({
    messageSid,
    messageStatus,
    errorCode,
  });

  await recordWebhookEvent({
    source: "twilio-status",
    externalId: messageSid,
    eventType: messageStatus || "status",
    status: "processed",
    payload: {
      messageStatus,
      errorCode,
      matched: updated.count,
      reopened: receipt.reopened,
    },
  });

  if (updated.count > 0) {
    logInfo("twilio.status.updated", {
      messageSid,
      messageStatus,
      matched: updated.count,
    });
  }

  /*
    Reopened rows are due immediately on the first rung, so draining here means
    the next attempt is already in flight by the time this returns.
  */
  after(() => drainOwnerAlerts({ at: "twilio.status", messageSid, messageStatus }));

  return NextResponse.json({
    ok: true,
    matched: updated.count,
    reopened: receipt.reopened,
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-status-webhook" });
}

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { captureBusyInboundCall } from "@/lib/busy-inbound";
import { getWebhookUrl } from "@/lib/env";
import { logInfo } from "@/lib/logger";
import { validateTwilioRequest } from "@/lib/webhook-auth";

function voiceStatusUrl() {
  return getWebhookUrl("/api/webhooks/twilio/voice-status");
}

/**
 * Call progress for inbound shop lines — busy / no-answer / failed / canceled.
 * Complements voice-fallback (primary URL error) with density misses.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = String(form.get("From") ?? "").trim();
  const to = String(form.get("To") ?? "").trim();
  const callSid = String(form.get("CallSid") ?? "").trim();
  const callStatus = String(form.get("CallStatus") ?? "").trim();

  const formEntries = Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, String(value)]),
  );

  if (
    !validateTwilioRequest({
      signature: request.headers.get("x-twilio-signature"),
      url: voiceStatusUrl(),
      formEntries,
    })
  ) {
    return NextResponse.json(
      { error: "Invalid Twilio signature" },
      { status: 403 },
    );
  }

  const result = await captureBusyInboundCall({
    from,
    to,
    callSid,
    callStatus,
  });

  logInfo("twilio.voice_status.handled", {
    callSid,
    callStatus,
    ...result,
  });

  after(() =>
    drainOwnerAlerts({
      at: "twilio.voice_status",
      callSid,
      callStatus,
    }),
  );

  return NextResponse.json({ ok: true, ...result });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-voice-status" });
}

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { linkTouchToCustomer } from "@/lib/customer";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildLeadAlertDedupeKey,
  enqueueOwnerAlert,
} from "@/lib/notifications";
import { escapeXml, twimlResponse } from "@/lib/twiml";
import { getWebhookUrl } from "@/lib/env";
import { validateTwilioRequest } from "@/lib/webhook-auth";
import { recordWebhookEvent } from "@/lib/webhook-events";
import { resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";

/*
  What a homeowner hears when the AI cannot answer.

  Voice on a shop line does not pass through this app at all: the Twilio number
  is imported into Vapi, Vapi owns the voice URL, and Orvius only ever sees the
  JSON that arrives after a call has already happened. That arrangement is fine
  until Vapi is unreachable, and then it is the whole product failing in the one
  moment it was bought for — because Twilio's behaviour when a voice URL errors,
  with no fallback configured, is to play its own error tone and hang up. A
  burst-pipe call at 3am got dead air and the shop never learned it happened.

  Twilio calls this route instead, via voiceFallbackUrl, whenever the primary
  voice URL errors or times out. Two things have to be true of it:

  1. It cannot depend on anything that might be down with Vapi. So it takes no
     AI call, no third-party request, and no optional env var. The worst case it
     degrades to is a spoken apology, which is the floor rather than silence.
  2. The shop has to find out. A missed after-hours call *is* the lead, so the
     record and the owner alert are written on the first hit — before the caller
     has said anything and whether or not they stay to leave a message.
*/

/** Two minutes is long enough to describe a flooded basement, short enough to read. */
const MAX_VOICEMAIL_SECONDS = 120;

function fallbackUrl() {
  return getWebhookUrl("/api/webhooks/twilio/voice-fallback");
}

/*
  Said out loud, so it is written to be heard rather than read: short clauses,
  no product name the caller has no reason to know, and the reassurance first.
  It never claims the shop is "closed" — the line reaching here means our side
  broke, and a homeowner told the shop is shut may stop calling.
*/
function greeting(shopName: string) {
  return [
    `Thanks for calling ${shopName}.`,
    "We can't take your call live right now, but this line is recording and the owner is being notified.",
    "Please leave your name, your number, and what you need after the beep. If this is a gas leak or you're in immediate danger, hang up and call 9 1 1.",
  ].join(" ");
}

function voicemailTwiml(shopName: string) {
  /*
    `action` is this same route, which is what lets one handler cover both legs
    of the call: the greeting, then the recording Twilio posts back.
  */
  return twimlResponse(
    [
      `<Say voice="Polly.Joanna">${escapeXml(greeting(shopName))}</Say>`,
      `<Record action="${escapeXml(fallbackUrl())}" method="POST"`,
      ` maxLength="${MAX_VOICEMAIL_SECONDS}" playBeep="true" trim="trim-silence" />`,
      /*
        Reached only if <Record> itself cannot run. Without it Twilio would fall
        off the end of the document and hang up without a word, which is the
        failure this route exists to remove.
      */
      `<Say voice="Polly.Joanna">${escapeXml("We couldn't record your message. Please call again shortly.")}</Say>`,
    ].join(""),
  );
}

/** Nothing left to record — thank them and end the call deliberately. */
function signOffTwiml() {
  return twimlResponse(
    `<Say voice="Polly.Joanna">${escapeXml("Thanks — we've got your message and the owner has been notified. Goodbye.")}</Say><Hangup />`,
  );
}

/*
  The last resort, for when we cannot even identify the shop.

  It still speaks. An unrecognised number is our routing problem, not the
  caller's, and the one thing they must not get is the silence this route was
  added to eliminate.
*/
function unknownShopTwiml() {
  return twimlResponse(
    `<Say voice="Polly.Joanna">${escapeXml("Thanks for calling. We can't connect you right now. Please try again in a few minutes.")}</Say><Hangup />`,
  );
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = String(form.get("From") ?? "").trim();
  const to = String(form.get("To") ?? "").trim();
  const callSid = String(form.get("CallSid") ?? "").trim();
  const recordingUrl = String(form.get("RecordingUrl") ?? "").trim();
  const recordingSeconds = Number(form.get("RecordingDuration") ?? 0) || 0;

  const formEntries = Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, String(value)]),
  );

  if (
    !validateTwilioRequest({
      signature: request.headers.get("x-twilio-signature"),
      url: fallbackUrl(),
      formEntries,
    })
  ) {
    return NextResponse.json(
      { error: "Invalid Twilio signature" },
      { status: 403 },
    );
  }

  const business = await resolveBusinessByInboundPhone(to);

  if (!business) {
    logWarn("twilio.voice_fallback.shop_not_found", { to, from, callSid });
    return unknownShopTwiml();
  }

  /*
    Second leg: the recording Twilio posts back to `action`. The lead already
    exists from the first leg, so this attaches what the caller said to it.
  */
  if (recordingUrl) {
    await attachVoicemail({
      businessId: business.id,
      businessName: business.name,
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
      callSid,
      from,
      recordingUrl,
      recordingSeconds,
    });
    after(() =>
      drainOwnerAlerts({
        at: "twilio.voice_fallback.recording",
        callSid,
        businessId: business.id,
      }),
    );
    return signOffTwiml();
  }

  /*
    First leg. The caller is waiting on the other end of this request, so the
    greeting is returned even if our own bookkeeping throws — a database
    problem is not a reason to put them back into the silence.
  */
  try {
    await openMissedCall({
      businessId: business.id,
      businessName: business.name,
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
      callSid,
      from,
    });
    after(() =>
      drainOwnerAlerts({
        at: "twilio.voice_fallback",
        callSid,
        businessId: business.id,
      }),
    );
  } catch (error) {
    logError("twilio.voice_fallback.capture_failed", {
      callSid,
      businessId: business.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return voicemailTwiml(business.name);
}

/**
 * Write the lead and alert the owner before the caller has said anything.
 *
 * Deliberately ahead of the recording: most people hang up on a voicemail
 * prompt, and a shop that only heard about the calls where someone stayed to
 * talk would be blind to exactly the panicked 3am callers it most wants back.
 */
async function openMissedCall(params: {
  businessId: string;
  businessName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  callSid: string;
  from: string;
}) {
  const externalId = params.callSid ? `voice-fallback:${params.callSid}` : null;

  if (externalId) {
    const existing = await prisma.lead.findFirst({
      where: { businessId: params.businessId, externalId },
      select: { id: true },
    });
    /*
      Twilio retries a 5xx on the same CallSid, and each retry is the same
      caller still holding. Returning early keeps one call to one lead.
    */
    if (existing) {
      logInfo("twilio.voice_fallback.duplicate", {
        callSid: params.callSid,
        leadId: existing.id,
      });
      return existing.id;
    }
  }

  const notes =
    "Inbound call could not be answered live — caller was sent to voicemail. The AI line was unreachable at the time of this call.";

  const lead = await prisma.lead.create({
    data: {
      businessId: params.businessId,
      externalId,
      phone: params.from || null,
      notes,
      serviceType: "Missed call — line unavailable",
      /*
        Unknown, and it has to stay that way: nothing has been said yet.
        Marking these emergencies would put a siren on every fallback call and
        teach the owner to ignore the one colour that has to keep meaning
        something. The voicemail leg sets it once there are words to read.
      */
      urgency: null,
      source: "voice-fallback",
      status: "new",
    },
  });

  await linkTouchToCustomer({
    businessId: params.businessId,
    leadId: lead.id,
    phone: params.from,
    notes,
  });

  await enqueueOwnerAlert({
    businessId: params.businessId,
    ownerPhone: params.ownerPhone,
    ownerEmail: params.ownerEmail,
    businessName: params.businessName,
    message: [
      `Missed call from ${params.from || "an unknown number"}.`,
      "Our AI line could not answer, so they were sent to voicemail.",
      "Call them back — they were not spoken to.",
    ].join(" "),
    leadId: lead.id,
    dedupeKey: buildLeadAlertDedupeKey({
      messageSid: externalId ?? lead.id,
    }),
  });

  await recordWebhookEvent({
    source: "twilio-voice-fallback",
    externalId: externalId ?? lead.id,
    eventType: "missed-call",
    businessId: params.businessId,
    status: "processed",
    payload: { from: params.from, to: null, leadId: lead.id },
  });

  logInfo("twilio.voice_fallback.captured", {
    callSid: params.callSid,
    businessId: params.businessId,
    leadId: lead.id,
  });

  return lead.id;
}

/**
 * Attach the recording to the lead the greeting already created.
 *
 * The second alert is intentional and is the same shape as the SMS-to-email
 * failover: the first said someone called, this one says what they wanted, and
 * for a no-heat call in February the second is the one worth waking up for.
 */
async function attachVoicemail(params: {
  businessId: string;
  businessName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  callSid: string;
  from: string;
  recordingUrl: string;
  recordingSeconds: number;
}) {
  const externalId = params.callSid ? `voice-fallback:${params.callSid}` : null;

  const lead = externalId
    ? await prisma.lead.findFirst({
        where: { businessId: params.businessId, externalId },
        select: { id: true, notes: true },
      })
    : null;

  /*
    A recording with no lead behind it means the greeting leg never landed, so
    this leg opens the record instead of dropping the voicemail on the floor.
  */
  if (!lead) {
    logWarn("twilio.voice_fallback.recording_without_lead", {
      callSid: params.callSid,
      businessId: params.businessId,
    });
    await openMissedCall(params);
  }

  const target = lead
    ? lead
    : await prisma.lead.findFirst({
        where: { businessId: params.businessId, externalId },
        select: { id: true, notes: true },
      });

  if (!target) return;

  /*
    Twilio hands back a URL, not words, so nothing here can be classified. The
    lead keeps the null urgency the greeting leg gave it and the owner reads the
    board with "missed call" on it, which is accurate.

    Turning this into a ranked lead needs `transcribe` on the <Record> verb, and
    that is a per-minute charge and a recording-consent question in two-party
    states — a founder decision, not one to slip in behind an outage fix.
  */
  const notes = [
    target.notes,
    `Voicemail (${params.recordingSeconds}s): ${params.recordingUrl}.mp3`,
  ]
    .filter(Boolean)
    .join("\n");

  const demand = deriveDemandSignal({
    serviceType: "Missed call — voicemail",
    notes,
    trade: tradeForCapture({ name: params.businessName }),
  });

  await prisma.lead.update({
    where: { id: target.id },
    data: { notes, categoryCode: demand.categoryCode },
  });

  await enqueueOwnerAlert({
    businessId: params.businessId,
    ownerPhone: params.ownerPhone,
    ownerEmail: params.ownerEmail,
    businessName: params.businessName,
    message: [
      `Voicemail from ${params.from || "an unknown number"} (${params.recordingSeconds}s).`,
      `Listen: ${params.recordingUrl}.mp3`,
    ].join(" "),
    leadId: target.id,
    dedupeKey: `${buildLeadAlertDedupeKey({
      messageSid: externalId ?? target.id,
    })}:voicemail`,
  });

  logInfo("twilio.voice_fallback.voicemail", {
    callSid: params.callSid,
    businessId: params.businessId,
    leadId: target.id,
    seconds: params.recordingSeconds,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "twilio-voice-fallback",
  });
}

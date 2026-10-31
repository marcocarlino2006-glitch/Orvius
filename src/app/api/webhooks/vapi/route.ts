import { NextRequest, NextResponse } from "next/server";
import { detectCallCapture } from "@/lib/capture-detect";
import { after } from "next/server";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { prisma } from "@/lib/prisma";
import { openingWithNotice, type VapiWebhookMessage } from "@/lib/vapi";
import { captureEndOfCallReport, finishCallReport } from "@/lib/call-ingest";
import { phonesEqual } from "@/lib/owner-alerts";
import { recordForwardTestArrival } from "@/lib/forward-test";
import { lineCheckInFlight, lineCheckToolResults, recordLineCheckReport } from "@/lib/line-check";
import { linkTouchToCustomer } from "@/lib/customer";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { isProduction } from "@/lib/runtime";
import { isDatabaseBusy, recordWebhookEvent } from "@/lib/webhook-events";
import { verifyVapiWebhookSecret } from "@/lib/webhook-auth";
import { tooManyRequests, webhookAuthFailureLimited } from "@/lib/rate-limit";
import { pickTenant, resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";
import {
  buildPreviewAssistant,
  claimPreviewCall,
  findPreviewByVapiCallId,
  recordPreviewOutcome,
} from "@/lib/shop-preview";
import { ensureAssistantCurrent, shopGreeting } from "@/lib/sync-business-assistant";
import { handleInCallToolCalls } from "@/lib/in-call-tools";
import { callerWordsSoFar, readToolCalls } from "@/lib/in-call-tool-defs";
import { clockNote, loadCallerContextNote, loadReturningOpening, noteForConnectedCall, sendCallerContext } from "@/lib/caller-context";
import { backstopLateSweeps } from "@/lib/cron-backstop";
import { isVapiBillingRefusal, pagePlatform } from "@/lib/platform-pager";
import { alertSpendCut, callSpendCut, endCallWith, holdLineBusyCaller } from "@/lib/call-spend-guard";
import { releaseDemoSlot } from "@/lib/demo-load";
import { releaseShopLine } from "@/lib/shop-machine";
import { businessIdForVoiceMachine, callBelongsToShop, ForeignVoiceShop } from "@/lib/voice-machine";
import { isDemoPlatformLine } from "@/lib/demo-business";
import { endWebDemo, isLineWebCall, WEB_DEMO_CHANNEL } from "@/lib/web-demo";
import { isLineEntitled } from "@/lib/billing-entitlement";
import { isUniqueViolation } from "@/lib/unique-violation";

/* Room for a made-up line-watch run after the response (cron-backstop.ts). */
export const maxDuration = 60;

function findCallWithBusiness(vapiCallId: string) {
  return prisma.call.findUnique({
    where: { vapiCallId },
    include: { business: true },
  });
}

type CallWithBusiness = Awaited<ReturnType<typeof findCallWithBusiness>>;

/* A plain insert, not an upsert: on libsql an upsert is a whole write transaction the caller waits through. */
async function createCallRow(data: { businessId: string; vapiCallId: string; callerPhone: string | null }) {
  const select = { id: true, vapiCallId: true, callerPhone: true } as const;
  try {
    return await prisma.call.create({ data: { ...data, status: "in-progress" }, select });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const row = await prisma.call.findUniqueOrThrow({ where: { vapiCallId: data.vapiCallId }, select: { ...select, businessId: true } });
    if (row.businessId !== data.businessId) throw new ForeignVoiceShop();
    return row;
  }
}

async function findBusinessForCall(
  existing: CallWithBusiness,
  phoneNumber?: string,
  assistantId?: string,
) {
  if (existing?.business) {
    return existing.business;
  }

  if (assistantId) {
    const byAssistant = pickTenant(
      await prisma.business.findMany({
        where: { vapiAssistantId: assistantId, isActive: true },
        orderBy: { createdAt: "asc" },
      }),
      { kind: "assistant", key: assistantId },
    );
    if (byAssistant) return byAssistant;
  }

  if (phoneNumber) {
    const byPhone = await resolveBusinessByInboundPhone(phoneNumber);
    if (byPhone) return byPhone;
  }

  if (!isProduction()) {
    const businesses = await prisma.business.findMany({
      where: { isActive: true },
      take: 2,
    });
    if (businesses.length === 1) {
      return businesses[0];
    }
  }

  return null;
}

/**
 * Vapi asks which assistant should take a call on a line with no fixed
 * assistant. An owner with an active preview hears their own shop; everyone
 * else hears the shop that owns the line, exactly as before.
 */
/* A known caller is asked "Is this Dana?" in the first sentence, instead of being asked their name later. */
async function withReturningGreeting(
  shop: { id: string; name: string; greeting: string | null; vapiAssistantId: string | null },
  callerPhone: string | null | undefined,
) {
  const firstMessage = await loadReturningOpening({
    businessId: shop.id,
    phone: callerPhone,
    opening: openingWithNotice(shopGreeting(shop), shop.name),
  });
  return firstMessage ? { assistantId: shop.vapiAssistantId, assistantOverrides: { firstMessage } } : { assistantId: shop.vapiAssistantId };
}

const SLOW_TOOL_MS = 300;

async function answerAssistantRequest(params: {
  vapiCallId: string;
  callerPhone?: string;
  inboundNumber?: string;
}) {
  const [preview, owner] = await Promise.all([
    claimPreviewCall({ callerPhone: params.callerPhone, vapiCallId: params.vapiCallId }),
    params.inboundNumber ? resolveBusinessByInboundPhone(params.inboundNumber) : null,
  ]);
  if (preview) return { assistant: buildPreviewAssistant(preview) };

  if (owner && !isLineEntitled(owner)) {
    return { error: `Thanks for calling ${owner.name}. This line isn't taking calls right now. Please reach the business directly.` };
  }
  if (owner?.vapiAssistantId) return withReturningGreeting(owner, params.callerPhone);

  logWarn("vapi.assistant_request.unrouted", { vapiCallId: params.vapiCallId, inboundNumber: params.inboundNumber });
  return { error: "Sorry, this line isn't taking calls right now. Please try again later." };
}

export async function POST(request: NextRequest) {
  return handleVapiWebhook(request, null);
}

export async function handleVapiWebhook(
  request: NextRequest,
  bound: { businessId: string; machineId: string } | null,
) {
  if (!bound && !verifyVapiWebhookSecret(request.headers.get("x-vapi-secret"))) {
    const limited = webhookAuthFailureLimited(request, "vapi");
    if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as VapiWebhookMessage;
  const { message } = payload;
  const type = message.type;
  const vapiCallId = message.call?.id;

  if (!vapiCallId) {
    return NextResponse.json({ ok: true, skipped: "missing call id" });
  }

  const inboundNumber = message.call?.phoneNumber?.number;
  const assistantId = message.call?.assistantId;

  let business: NonNullable<Awaited<ReturnType<typeof findBusinessForCall>>> | null = null;
  let existingCall: CallWithBusiness = null;

  if (bound) {
    const shop = await prisma.business.findUnique({ where: { id: bound.businessId } });
    existingCall = await findCallWithBusiness(vapiCallId);
    const sealedTo = await businessIdForVoiceMachine(bound.machineId);
    const belongs =
      Boolean(shop?.isActive) &&
      sealedTo === shop?.id &&
      sealedTo === bound.businessId &&
      callBelongsToShop(shop!, {
        assistantId,
        inboundNumber,
        existingBusinessId: existingCall?.businessId,
      });
    if (!shop || !belongs) {
      logWarn("voice_machine.foreign_call", { machineId: bound.machineId, vapiCallId, assistantId, type });
      return NextResponse.json({ ok: false, error: new ForeignVoiceShop().message }, { status: 403 });
    }
    if (type === "assistant-request") {
      if (!shop.vapiAssistantId) {
        return NextResponse.json({
          error: `Thanks for calling ${shop.name}. This line isn't taking calls right now. Please reach the business directly.`,
        });
      }
      return NextResponse.json(await withReturningGreeting(shop, message.call?.customer?.number));
    }
    business = shop;
  } else {
    if (type === "assistant-request") {
      return NextResponse.json(
        await answerAssistantRequest({
          vapiCallId,
          callerPhone: message.call?.customer?.number,
          inboundNumber,
        }),
      );
    }

    // Preview calls belong to no shop: they must never reach findBusinessForCall's number fallback.
    const [preview, foundCall] = await Promise.all([
      findPreviewByVapiCallId(vapiCallId),
      findCallWithBusiness(vapiCallId),
    ]);
    existingCall = foundCall;
    if (preview) {
      if (type === "end-of-call-report") {
        await recordPreviewOutcome(preview, message);
        if (message.call?.type === "webCall") after(() => endWebDemo({ vapiCallId }));
      }
      return NextResponse.json({ ok: true, preview: true });
    }

    business = await findBusinessForCall(existingCall, inboundNumber, assistantId);
  }

  if (!business) {
    await recordWebhookEvent({
      source: "vapi",
      externalId: vapiCallId,
      eventType: type,
      /*
        "failed", not "skipped", and the distinction is the whole fix.
        claimWebhookEvent only reclaims rows left in processing, failed or
        error — a skipped row is treated as settled forever. So when the shop
        row did show up and Vapi re-sent the report, the claim was refused by
        the record of the first miss and the retry accomplished nothing.
      */
      status: "failed",
      payload: { type, inboundNumber, assistantId },
      error: "business not found",
    });
    logWarn("vapi.webhook.business_not_found", {
      vapiCallId,
      inboundNumber,
      assistantId,
      type,
    });
    /*
      A call we cannot attribute to a shop is a dropped call, not a skip. This
      answered 200, which told Vapi the report was handled and threw away the
      only copy of it — no lead, no alert, and nothing on either side saying a
      job had gone missing. The usual cause is a shop row that is not visible
      yet or a line that was just moved, both of which a redelivery fixes, so
      the honest answer is that we could not accept it.
    */
    return NextResponse.json(
      { ok: false, error: "business not found for call" },
      { status: 503 },
    );
  }

  if (existingCall && existingCall.businessId !== business.id) {
    return NextResponse.json({ ok: false, error: new ForeignVoiceShop().message }, { status: 403 });
  }

  // Orvius's own connection test dials the shop's number from this line; when forwarding works it comes straight back here.
  if (inboundNumber && phonesEqual(message.call?.customer?.number ?? null, inboundNumber)) {
    if (await recordForwardTestArrival(business.id)) {
      return NextResponse.json({ ok: true, forwardTest: true });
    }
  }

  // The daily line check rings the line from the shop's own number; it never becomes a call, a lead or an alert.
  const caller = message.call?.customer?.number ?? null;
  if (caller && (phonesEqual(caller, business.twilioPhone) || phonesEqual(caller, business.vapiPhoneNumber))) {
    const lineCheck = await lineCheckInFlight(business.id);
    if (lineCheck) {
      if (type === "tool-calls") return NextResponse.json({ results: lineCheckToolResults(message) });
      if (type === "end-of-call-report") await recordLineCheckReport(lineCheck, message);
      return NextResponse.json({ ok: true, lineCheck: true });
    }
  }

  if (type === "tool-calls") {
    /*
      The caller is waiting on this reply mid-sentence, and the time is logged
      per tool: it is the one part of a turn's latency that is ours rather
      than Vapi's. call-started normally made the row already, and then it
      and its full shop row are reused: no write, no second read.
    */
    const startedAt = Date.now();
    const callerPhone = message.call?.customer?.number ?? null;
    try {
      const [call, shop] = existingCall?.business
        ? [existingCall, existingCall.business]
        : await Promise.all([
            createCallRow({ businessId: business.id, vapiCallId, callerPhone }),
            prisma.business.findUniqueOrThrow({
              where: { id: business.id },
              select: {
                id: true,
                name: true,
                hoursJson: true,
                timezone: true,
                trade: true,
                servicesJson: true,
                jobLengthsJson: true,
                ownerPhone: true,
                ownerEmail: true,
                transferPhone: true,
                networkOn: true,
                networkZip3: true,
                address: true,
                bookingMode: true,
                serviceZipsJson: true,
                billingStatus: true,
                billingPlan: true,
                pilotEndsAt: true,
                createdAt: true,
                pastDueSince: true,
                pauseStartsAt: true,
                pausedUntil: true,
                environment: true,
              },
            }),
          ]);
      const toolCalls = readToolCalls(message);
      const results = await handleInCallToolCalls({
        shop,
        callId: call.id,
        call: { id: call.id, vapiCallId: call.vapiCallId, callerPhone: call.callerPhone ?? callerPhone },
        toolCalls,
        callerWords: callerWordsSoFar(message),
      });
      const toolMs = Date.now() - startedAt;
      const timing = { businessId: business.id, vapiCallId, tools: toolCalls.map((t) => t.name).join(","), ms: toolMs };
      logInfo("in_call.tool_ms", timing);
      // Past this the caller hears dead air after "One moment."
      if (toolMs > SLOW_TOOL_MS) logWarn("in_call.tool_slow", timing);
      return NextResponse.json({ results });
    } catch (error) {
      if (error instanceof ForeignVoiceShop) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
      }
      throw error;
    }
  }

  const webCall = message.call?.type === "webCall";

  if (type === "call-started" || type === "status-update") {
    const callerPhone = message.call?.customer?.number ?? null;
    const call = await prisma.call.upsert({
      where: { vapiCallId },
      create: {
        businessId: business.id,
        vapiCallId,
        callerPhone,
        status: "in-progress",
        ...(webCall ? { channel: WEB_DEMO_CHANNEL } : {}),
      },
      update: {
        callerPhone: callerPhone ?? undefined,
      },
    });
    /* Status updates arrive out of order. An "ended" one, or any that lands
       after the end-of-call report, must not mark a finished call live again. */
    const live = type === "call-started" || ["queued", "ringing", "in-progress"].includes(String(message.status ?? ""));
    if (live) {
      await prisma.call.updateMany({ where: { id: call.id, status: { not: "completed" } }, data: { status: "in-progress" } });
    }

    // Ring 2 starts at ring — recognize returning customers immediately
    if (callerPhone) {
      await linkTouchToCustomer({
        businessId: business.id,
        callId: call.id,
        phone: callerPhone,
      });
    }

    await recordWebhookEvent({
      source: "vapi",
      externalId: vapiCallId,
      eventType: type,
      businessId: business.id,
      status: "processed",
      payload: { type },
    });

    const controlUrl = message.call?.monitor?.controlUrl;
    const connected = type === "call-started" || message.status === "in-progress";
    if (controlUrl && connected) {
      after(async () => {
        const claimed = await prisma.call.updateMany({
          where: { id: call.id, callerContextSentAt: null },
          data: { callerContextSentAt: new Date() },
        });
        if (!claimed.count) return;
        if (webCall && isDemoPlatformLine(business.vapiPhoneNumber ?? business.twilioPhone)) {
          if (!(await isLineWebCall(vapiCallId))) await endCallWith(controlUrl, "This demo starts from the Orvius website. Goodbye.");
          return;
        }
        const noteStartedAt = Date.now();
        const timezone = business.timezone ?? "America/New_York";
        // Read alongside the spend check, not after it: every millisecond here is the caller's first turn without the note.
        const returningNote = callerPhone
          ? loadCallerContextNote({ businessId: business.id, phone: callerPhone, timezone }).catch(() => null)
          : Promise.resolve(null);
        const onDemoLine = isDemoPlatformLine(inboundNumber ?? business.vapiPhoneNumber ?? business.twilioPhone);
        const cut = await callSpendCut({ shop: business, callerPhone, vapiCallId, demo: isDemoPlatformLine(inboundNumber ?? business.vapiPhoneNumber ?? business.twilioPhone), ownsLine: business.environment === "production" && !onDemoLine });
        if (cut) {
          await endCallWith(controlUrl, cut.say);
          if (cut.reason === "shop_line") {
            await holdLineBusyCaller({ shop: business, callerPhone, callId: call.id });
          }
          if (cut.reason === "caller_repeat" || cut.reason === "shop_ceiling") {
            await alertSpendCut({ shop: business, cut, callerPhone });
          }
          if (cut.reason === "shop_ceiling") await pagePlatform("spend_ceiling", { businessId: business.id, vapiCallId });
          if (cut.reason === "demo_live_cap" || cut.reason === "demo_daily_ceiling") {
            await pagePlatform("demo_overflow", { reason: cut.reason, vapiCallId });
          }
          return;
        }
        const clock = clockNote({
          now: new Date(),
          timezone,
          hoursJson: business.hoursJson,
          closedDatesJson: business.closedDatesJson,
        });
        const returning = await returningNote;
        await sendCallerContext(controlUrl, callerPhone ? `${clock} ${noteForConnectedCall(returning)}` : clock);
        logInfo("vapi.caller_context.ms", { businessId: business.id, vapiCallId, returning: Boolean(returning), ms: Date.now() - noteStartedAt });
      });
    }

    if (connected) {
      const shop = await prisma.business.findUnique({ where: { id: business.id } });
      if (shop) after(() => ensureAssistantCurrent(shop));
    }

    return NextResponse.json({ ok: true });
  }

  if (type === "end-of-call-report") {
    // Booking can take several rounds; Vapi only needs to know the call is saved.
    const captured = await captureEndOfCallReport({ business, message, vapiCallId });
    if (captured.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    after(() => backstopLateSweeps("vapi.end_of_call"));
    after(() => releaseDemoSlot(vapiCallId));
    after(() => releaseShopLine(vapiCallId));
    if (webCall) after(() => endWebDemo({ vapiCallId }));
    if (isVapiBillingRefusal(message.endedReason)) {
      after(() => pagePlatform("vapi_billing", { vapiCallId, businessId: business.id, endedReason: message.endedReason }));
    }
    after(async () => {
      // A burst queues writers on the one SQLite lock; a short retry books the caller now instead of on the next sweep.
      const finish = async (attempt = 0): Promise<unknown> =>
        finishCallReport(captured).catch(async (error: unknown) => {
          if (attempt >= 2 || !isDatabaseBusy(error)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1500 * (attempt + 1)));
          return finish(attempt + 1);
        });
      await finish().catch((error: unknown) =>
        logError("vapi.call_report_finish_failed", {
          vapiCallId,
          businessId: business.id,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      await drainOwnerAlerts({ at: "vapi.webhook", vapiCallId, businessId: business.id });
      await detectCallCapture({
        business: captured.business,
        vapiCallId,
        callerPhone: captured.call.callerPhone,
        providerCallId: message.call?.phoneCallProviderId,
      }).catch((error: unknown) =>
        logError("vapi.capture_detect_failed", {
          vapiCallId,
          businessId: business.id,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    });
    return NextResponse.json({ ok: true, callId: captured.call.id, leadId: captured.lead.id, queued: true });
  }

  return NextResponse.json({ ok: true, type });
}

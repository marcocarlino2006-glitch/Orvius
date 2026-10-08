import { NextRequest, NextResponse } from "next/server";
import { detectCallCapture } from "@/lib/capture-detect";
import { after } from "next/server";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { prisma } from "@/lib/prisma";
import type { VapiWebhookMessage } from "@/lib/vapi";
import { captureEndOfCallReport, finishCallReport } from "@/lib/call-ingest";
import { phonesEqual } from "@/lib/owner-alerts";
import { recordForwardTestArrival } from "@/lib/forward-test";
import { linkTouchToCustomer } from "@/lib/customer";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { isProduction } from "@/lib/runtime";
import { isDatabaseBusy, recordWebhookEvent } from "@/lib/webhook-events";
import { verifyVapiWebhookSecret } from "@/lib/webhook-auth";
import { tooManyRequests, webhookAuthFailureLimited } from "@/lib/rate-limit";
import { resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";
import {
  buildPreviewAssistant,
  claimPreviewCall,
  findPreviewByVapiCallId,
  recordPreviewOutcome,
} from "@/lib/shop-preview";
import { ensureAssistantCurrent } from "@/lib/sync-business-assistant";
import { handleInCallToolCalls } from "@/lib/in-call-tools";
import { callerWordsSoFar, readToolCalls } from "@/lib/in-call-tool-defs";
import { loadCallerContextNote, sendCallerContext } from "@/lib/caller-context";
import { backstopLateSweeps } from "@/lib/cron-backstop";
import { isVapiBillingRefusal, pagePlatform } from "@/lib/platform-pager";
import { callSpendCut, endCallWith } from "@/lib/call-spend-guard";
import { isLineEntitled } from "@/lib/billing-entitlement";

/* Room for a made-up line-watch run after the response (cron-backstop.ts). */
export const maxDuration = 60;

async function findBusinessForCall(
  vapiCallId: string,
  phoneNumber?: string,
  assistantId?: string,
) {
  const call = await prisma.call.findUnique({
    where: { vapiCallId },
    include: { business: true },
  });

  if (call?.business) {
    return call.business;
  }

  if (assistantId) {
    const byAssistant = await prisma.business.findFirst({
      where: { vapiAssistantId: assistantId, isActive: true },
    });
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
async function answerAssistantRequest(params: {
  vapiCallId: string;
  callerPhone?: string;
  inboundNumber?: string;
}) {
  const preview = await claimPreviewCall({ callerPhone: params.callerPhone, vapiCallId: params.vapiCallId });
  if (preview) return { assistant: buildPreviewAssistant(preview) };

  const owner = params.inboundNumber ? await resolveBusinessByInboundPhone(params.inboundNumber) : null;
  if (owner && !isLineEntitled(owner)) {
    return { error: `Thanks for calling ${owner.name}. This line isn't taking calls right now. Please reach the business directly.` };
  }
  if (owner?.vapiAssistantId) return { assistantId: owner.vapiAssistantId };

  logWarn("vapi.assistant_request.unrouted", { vapiCallId: params.vapiCallId, inboundNumber: params.inboundNumber });
  return { error: "Sorry, this line isn't taking calls right now. Please try again later." };
}

export async function POST(request: NextRequest) {
  if (!verifyVapiWebhookSecret(request.headers.get("x-vapi-secret"))) {
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
  const preview = await findPreviewByVapiCallId(vapiCallId);
  if (preview) {
    if (type === "end-of-call-report") await recordPreviewOutcome(preview, message);
    return NextResponse.json({ ok: true, preview: true });
  }

  const business = await findBusinessForCall(
    vapiCallId,
    inboundNumber,
    assistantId,
  );

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

  // Orvius's own connection test dials the shop's number from this line; when forwarding works it comes straight back here.
  if (inboundNumber && phonesEqual(message.call?.customer?.number ?? null, inboundNumber)) {
    if (await recordForwardTestArrival(business.id)) {
      return NextResponse.json({ ok: true, forwardTest: true });
    }
  }

  if (type === "tool-calls") {
    /*
      The caller is waiting on this reply mid-sentence, so the two reads run
      together and the time is logged per tool: it is the one part of a turn's
      latency that is ours rather than Vapi's.
    */
    const startedAt = Date.now();
    const callerPhone = message.call?.customer?.number ?? null;
    const [call, shop] = await Promise.all([
      prisma.call.upsert({
        where: { vapiCallId },
        create: { businessId: business.id, vapiCallId, callerPhone, status: "in-progress" },
        update: {},
        select: { id: true, vapiCallId: true, callerPhone: true },
      }),
      prisma.business.findUniqueOrThrow({
        where: { id: business.id },
        select: {
          id: true,
          name: true,
          hoursJson: true,
          timezone: true,
          trade: true,
          servicesJson: true,
          ownerPhone: true,
          ownerEmail: true,
          transferPhone: true,
          networkOn: true,
          networkZip3: true,
          address: true,
          bookingMode: true,
        },
      }),
    ]);
    const toolCalls = readToolCalls(message);
    const results = await handleInCallToolCalls({
      shop,
      callId: call.id,
      call: { ...call, callerPhone: call.callerPhone ?? callerPhone },
      toolCalls,
      callerWords: callerWordsSoFar(message),
    });
    logInfo("in_call.tool_ms", {
      businessId: business.id,
      vapiCallId,
      tools: toolCalls.map((t) => t.name).join(","),
      ms: Date.now() - startedAt,
    });
    return NextResponse.json({ results });
  }

  if (type === "call-started" || type === "status-update") {
    const callerPhone = message.call?.customer?.number ?? null;
    const call = await prisma.call.upsert({
      where: { vapiCallId },
      create: {
        businessId: business.id,
        vapiCallId,
        callerPhone,
        status: "in-progress",
      },
      update: {
        callerPhone: callerPhone ?? undefined,
        status: "in-progress",
      },
    });

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
        const cut = await callSpendCut({ shop: business, callerPhone });
        if (cut) {
          await endCallWith(controlUrl, cut.say);
          if (cut.reason === "shop_ceiling") await pagePlatform("spend_ceiling", { businessId: business.id, vapiCallId });
          return;
        }
        if (!callerPhone) return;
        const note = await loadCallerContextNote({
          businessId: business.id,
          phone: callerPhone,
          timezone: business.timezone ?? "America/New_York",
        });
        if (note) await sendCallerContext(controlUrl, note);
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

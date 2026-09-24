import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { prisma } from "@/lib/prisma";
import type { VapiWebhookMessage } from "@/lib/vapi";
import { ingestEndOfCallReport } from "@/lib/call-ingest";
import { linkTouchToCustomer } from "@/lib/customer";
import { logWarn } from "@/lib/logger";
import { isProduction } from "@/lib/runtime";
import { recordWebhookEvent } from "@/lib/webhook-events";
import { verifyVapiWebhookSecret } from "@/lib/webhook-auth";
import { tooManyRequests, webhookAuthFailureLimited } from "@/lib/rate-limit";
import { resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";

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

    return NextResponse.json({ ok: true });
  }

  if (type === "end-of-call-report") {
    const result = await ingestEndOfCallReport({ business, message, vapiCallId });
    if (result.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    after(() => drainOwnerAlerts({ at: "vapi.webhook", vapiCallId, businessId: business.id }));
    return NextResponse.json({
      ok: true,
      callId: result.callId,
      leadId: result.leadId,
      jobId: result.jobId,
      autoBooked: result.autoBooked,
      qualified: result.qualified,
      skipReason: result.skipReason,
      queued: true,
    });
  }

  return NextResponse.json({ ok: true, type });
}

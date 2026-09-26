import type { Business } from "@prisma/client";
import { ingestEndOfCallReport } from "@/lib/call-ingest";
import { getWebhookUrl } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { vapiRequest, type VapiWebhookMessage } from "@/lib/vapi";

/**
 * Vapi finishing a call and Orvius having it are two different facts. When
 * the end-of-call webhook is lost — a deploy mid-call, a database blip, a
 * timeout — the caller exists only in Vapi and the owner never hears of them.
 * The watcher compares the two, re-ingests what Vapi still has, and asks the
 * owner to call back anyone it cannot recover.
 */

export type VapiCallRecord = {
  id: string;
  type?: string;
  status?: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  customer?: { number?: string };
  summary?: string;
  transcript?: string;
  recordingUrl?: string;
  analysis?: VapiWebhookMessage["message"]["analysis"];
  artifact?: { transcript?: string; recordingUrl?: string };
};

/** Long enough for Vapi's own end-of-call delivery and its retries to land first. */
export const LOST_CALL_GRACE_MS = 10 * 60_000;
export const LOOKBACK_MS = 6 * 60 * 60_000;

export function findLostCalls(calls: VapiCallRecord[], savedIds: Set<string>, now: Date, graceMs = LOST_CALL_GRACE_MS) {
  return calls.filter(
    (call) =>
      call.type === "inboundPhoneCall" &&
      call.status === "ended" &&
      Boolean(call.endedAt) &&
      now.getTime() - Date.parse(call.endedAt!) >= graceMs &&
      !savedIds.has(call.id),
  );
}

export function reportFromVapiCall(call: VapiCallRecord): VapiWebhookMessage["message"] {
  const durationSeconds =
    call.startedAt && call.endedAt ? Math.max(0, (Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000) : undefined;
  return {
    type: "end-of-call-report",
    call: { id: call.id, customer: call.customer },
    summary: call.analysis?.summary ?? call.summary,
    transcript: call.artifact?.transcript ?? call.transcript,
    recordingUrl: call.artifact?.recordingUrl ?? call.recordingUrl,
    durationSeconds,
    analysis: call.analysis,
    endedReason: call.endedReason,
  };
}

export type LineWatchResult = {
  businessId: string;
  checked: number;
  recovered: string[];
  unrecovered: string[];
  lineRepaired: boolean;
  lineProblem: string | null;
};

type Deps = {
  listCalls: (assistantId: string, since: Date) => Promise<VapiCallRecord[]>;
  lineProblem: (business: Business) => Promise<string | null>;
};

const defaultDeps: Deps = {
  listCalls: (assistantId, since) =>
    vapiRequest<VapiCallRecord[]>(`/call?assistantId=${assistantId}&createdAtGt=${since.toISOString()}&limit=100`),
  lineProblem: detectLineProblem,
};

async function detectLineProblem(business: Business): Promise<string | null> {
  const line = business.vapiPhoneNumber ?? business.twilioPhone;
  if (!business.vapiAssistantId || !line) return null;
  const [numbers, assistant] = await Promise.all([
    vapiRequest<Array<{ number?: string; assistantId?: string | null }>>("/phone-number?limit=100"),
    vapiRequest<{ serverUrl?: string; server?: { url?: string } }>(`/assistant/${business.vapiAssistantId}`),
  ]);
  const entry = numbers.find((n) => n.number === line);
  if (!entry) return `${line} is not connected to the receptionist`;
  if (entry.assistantId !== business.vapiAssistantId) return `${line} is answered by a different receptionist`;
  const url = assistant.server?.url ?? assistant.serverUrl ?? null;
  if (url !== getWebhookUrl("/api/webhooks/vapi")) return "the receptionist is sending calls to the wrong address";
  return null;
}

function callerLabel(call: VapiCallRecord) {
  return call.customer?.number ?? "an unknown number";
}

export async function watchShopLine(
  business: Business,
  options: { now?: Date; deps?: Partial<Deps> } = {},
): Promise<LineWatchResult> {
  const now = options.now ?? new Date();
  const deps = { ...defaultDeps, ...options.deps };
  const result: LineWatchResult = {
    businessId: business.id,
    checked: 0,
    recovered: [],
    unrecovered: [],
    lineRepaired: false,
    lineProblem: null,
  };
  if (!business.vapiAssistantId) return result;

  const calls = await deps.listCalls(business.vapiAssistantId, new Date(now.getTime() - LOOKBACK_MS));
  result.checked = calls.length;
  const saved = await prisma.call.findMany({
    where: { vapiCallId: { in: calls.map((c) => c.id) } },
    select: { vapiCallId: true },
  });
  const lost = findLostCalls(calls, new Set(saved.flatMap((s) => (s.vapiCallId ? [s.vapiCallId] : []))), now);

  for (const call of lost) {
    const recovered = await ingestEndOfCallReport({ business, vapiCallId: call.id, message: reportFromVapiCall(call) })
      .then((r) => !r.duplicate)
      .catch((error: unknown) => {
        logWarn("line_watch.recover_failed", {
          businessId: business.id,
          vapiCallId: call.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      });
    if (recovered) {
      result.recovered.push(call.id);
      logInfo("line_watch.recovered", { businessId: business.id, vapiCallId: call.id });
      continue;
    }
    result.unrecovered.push(call.id);
    await enqueueOwnerAlert({
      businessId: business.id,
      dedupeKey: `lost-call:${call.id}`,
      businessName: business.name,
      message: `A call from ${callerLabel(call)} reached your line but was not saved. Call them back.`,
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
    });
  }

  const problem = await deps.lineProblem(business).catch(() => null);
  if (problem) {
    await syncBusinessAssistant(business).catch(() => undefined);
    const after = await deps.lineProblem(business).catch(() => problem);
    result.lineRepaired = !after;
    result.lineProblem = after;
    logWarn("line_watch.line_problem", { businessId: business.id, problem, repaired: !after });
    if (after) {
      await enqueueOwnerAlert({
        businessId: business.id,
        dedupeKey: `line-problem:${business.id}:${now.toISOString().slice(0, 13)}`,
        businessName: business.name,
        message: `Your phone line needs attention: ${after}. Calls may not be answered — reply or email hello@orvius.im.`,
        ownerPhone: business.ownerPhone,
        ownerEmail: business.ownerEmail,
      });
    }
  }
  return result;
}

export async function watchAllLines(now = new Date()) {
  if (!process.env.VAPI_API_KEY) return { shops: 0, recovered: 0, unrecovered: 0, lineProblems: 0, skipped: "no VAPI_API_KEY" };
  const shops = await prisma.business.findMany({
    where: { isActive: true, vapiAssistantId: { not: null }, environment: { not: "test" } },
    take: 200,
  });
  let recovered = 0;
  let unrecovered = 0;
  let lineProblems = 0;
  const seen = new Set<string>();
  for (const shop of shops) {
    if (seen.has(shop.vapiAssistantId!)) continue;
    seen.add(shop.vapiAssistantId!);
    const r = await watchShopLine(shop, { now }).catch((error: unknown) => {
      logWarn("line_watch.shop_failed", { businessId: shop.id, error: error instanceof Error ? error.message : String(error) });
      return null;
    });
    recovered += r?.recovered.length ?? 0;
    unrecovered += r?.unrecovered.length ?? 0;
    lineProblems += r?.lineProblem ? 1 : 0;
  }
  return { shops: shops.length, recovered, unrecovered, lineProblems };
}

import type { Business } from "@prisma/client";
import { ingestEndOfCallReport } from "@/lib/call-ingest";
import { getWebhookUrl } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { listVapiNumbers, vapiRequest, type VapiNumber, type VapiWebhookMessage } from "@/lib/vapi";

/**
 * Vapi finishing a call and Orvius having it are two different facts. When
 * the end-of-call webhook is lost — a deploy mid-call, a database blip, a
 * timeout — the caller exists only in Vapi and the owner never hears of them.
 * The watcher compares the two, re-ingests what Vapi still has, and asks the
 * owner to call back anyone it cannot recover.
 */

export type VapiCallRecord = {
  id: string;
  assistantId?: string;
  createdAt?: string;
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
/** The account-wide sweep runs every 30 minutes; two hours covers three missed runs. */
export const ACCOUNT_SWEEP_LOOKBACK_MS = 2 * 60 * 60_000;
const ACCOUNT_SWEEP_PAGE = 100;
const ACCOUNT_SWEEP_MAX_PAGES = 400;
const ACCOUNT_SWEEP_BUDGET_MS = 25_000;

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

/* One sweep checks many shops; they share one walk of the account's numbers. */
let numbersCache: { at: number; list: Promise<VapiNumber[]> } | null = null;
function accountNumbers() {
  if (!numbersCache || Date.now() - numbersCache.at > 60_000) {
    const list = listVapiNumbers();
    numbersCache = { at: Date.now(), list };
    list.catch(() => (numbersCache = null));
  }
  return numbersCache.list;
}

async function detectLineProblem(business: Business): Promise<string | null> {
  const line = business.vapiPhoneNumber ?? business.twilioPhone;
  if (!business.vapiAssistantId || !line) return null;
  const [numbers, assistant] = await Promise.all([
    accountNumbers(),
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

async function recoverLostCall(business: Business, call: VapiCallRecord, result: { recovered: string[]; unrecovered: string[] }) {
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
    return;
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

type ListAccountCalls = (query: { since: Date; before: string | null; limit: number }) => Promise<VapiCallRecord[]>;

const listAccountCalls: ListAccountCalls = ({ since, before, limit }) =>
  vapiRequest<VapiCallRecord[]>(
    `/call?createdAtGt=${encodeURIComponent(since.toISOString())}${before ? `&createdAtLt=${encodeURIComponent(before)}` : ""}&limit=${limit}`,
  );

/**
 * Every lost call on the account, whatever the shop count: one paged walk of
 * Vapi's call list, newest first, matched to shops by assistant. Asking shop by
 * shop meant a slice of 200 shops per run, and past ~2,400 shops a lost call
 * aged out of the lookback before its shop's turn came round.
 */
export async function recoverLostCallsAccountWide(
  options: { now?: Date; list?: ListAccountCalls; budgetMs?: number } = {},
) {
  const now = options.now ?? new Date();
  const list = options.list ?? listAccountCalls;
  const since = new Date(now.getTime() - ACCOUNT_SWEEP_LOOKBACK_MS);
  const started = Date.now();
  const result = { pages: 0, checked: 0, lost: 0, recovered: [] as string[], unrecovered: [] as string[], unmatched: 0, truncated: false };
  let before: string | null = null;
  const seen = new Set<string>();

  for (let page = 0; page < ACCOUNT_SWEEP_MAX_PAGES; page++) {
    if (Date.now() - started > (options.budgetMs ?? ACCOUNT_SWEEP_BUDGET_MS)) {
      result.truncated = true;
      break;
    }
    const rows = await list({ since, before, limit: ACCOUNT_SWEEP_PAGE });
    result.pages += 1;
    if (!Array.isArray(rows) || !rows.length) break;
    const fresh = rows.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => seen.add(r.id));
    result.checked += fresh.length;

    const saved = await prisma.call.findMany({
      where: { vapiCallId: { in: fresh.map((c) => c.id) } },
      select: { vapiCallId: true },
    });
    const lost = findLostCalls(fresh, new Set(saved.flatMap((s) => (s.vapiCallId ? [s.vapiCallId] : []))), now);
    result.lost += lost.length;
    if (lost.length) {
      const assistantIds = [...new Set(lost.map((c) => c.assistantId).filter((id): id is string => Boolean(id)))];
      const shops = await prisma.business.findMany({ where: { vapiAssistantId: { in: assistantIds }, isActive: true } });
      const byAssistant = new Map(shops.map((b) => [b.vapiAssistantId!, b]));
      for (const call of lost) {
        const business = call.assistantId ? byAssistant.get(call.assistantId) : undefined;
        if (!business) {
          result.unmatched += 1;
          continue;
        }
        await recoverLostCall(business, call, result);
      }
    }

    const oldest = rows.map((r) => r.createdAt).filter((c): c is string => Boolean(c)).sort()[0];
    if (rows.length < ACCOUNT_SWEEP_PAGE || !oldest || oldest === before) break;
    before = oldest;
    if (page === ACCOUNT_SWEEP_MAX_PAGES - 1) result.truncated = true;
  }
  if (result.truncated) logWarn("line_watch.account_sweep_truncated", { pages: result.pages, checked: result.checked });
  return result;
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

  for (const call of lost) await recoverLostCall(business, call, result);

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

const WATCH_WINDOW = 200;
const WATCH_SLOT_MS = 30 * 60_000;
const WATCH_CONCURRENCY = 5;
const WATCH_BUDGET_MS = 40_000;

/**
 * Lost calls first, account-wide, so recovery never depends on shop count.
 * Then line health, which changes rarely: past one window of shops each run
 * checks a different slice, rotating on the 30-minute schedule.
 */
export async function watchAllLines(now = new Date()) {
  if (!process.env.VAPI_API_KEY) return { shops: 0, recovered: 0, unrecovered: 0, lineProblems: 0, skipped: "no VAPI_API_KEY" };
  const sweep = await recoverLostCallsAccountWide({ now }).catch((error: unknown) => {
    logWarn("line_watch.account_sweep_failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  const where = { isActive: true, vapiAssistantId: { not: null }, environment: { not: "test" } };
  const total = await prisma.business.count({ where });
  const windows = Math.max(1, Math.ceil(total / WATCH_WINDOW));
  const window = Math.floor(now.getTime() / WATCH_SLOT_MS) % windows;
  const shops = await prisma.business.findMany({
    where,
    orderBy: { id: "asc" },
    skip: window * WATCH_WINDOW,
    take: WATCH_WINDOW,
  });
  let recovered = 0;
  let unrecovered = 0;
  let lineProblems = 0;
  let watched = 0;
  const seen = new Set<string>();
  const queue = shops.filter((shop) => {
    if (seen.has(shop.vapiAssistantId!)) return false;
    seen.add(shop.vapiAssistantId!);
    return true;
  });
  const started = Date.now();
  const worker = async () => {
    for (let shop = queue.shift(); shop; shop = queue.shift()) {
      if (Date.now() - started > WATCH_BUDGET_MS) return;
      const r = await watchShopLine(shop, { now, deps: sweep ? { listCalls: async () => [] } : {} }).catch((error: unknown) => {
        logWarn("line_watch.shop_failed", { businessId: shop!.id, error: error instanceof Error ? error.message : String(error) });
        return null;
      });
      watched += 1;
      recovered += r?.recovered.length ?? 0;
      unrecovered += r?.unrecovered.length ?? 0;
      lineProblems += r?.lineProblem ? 1 : 0;
    }
  };
  await Promise.all(Array.from({ length: WATCH_CONCURRENCY }, worker));
  return {
    shops: shops.length,
    watched,
    window: `${window + 1}/${windows}`,
    recovered: recovered + (sweep?.recovered.length ?? 0),
    unrecovered: unrecovered + (sweep?.unrecovered.length ?? 0),
    lineProblems,
    sweep: sweep ? { pages: sweep.pages, checked: sweep.checked, unmatched: sweep.unmatched, truncated: sweep.truncated } : "failed",
  };
}

import { pageStalledPorts } from "@/lib/port-request";
import { NextRequest, NextResponse } from "next/server";
import { runAutopilot } from "@/lib/autopilot";
import { ensureAssistantCurrent } from "@/lib/sync-business-assistant";
import { prisma } from "@/lib/prisma";
import { sweepUnfinishedCallReports } from "@/lib/call-ingest";
import { sweepUntoldAssignments } from "@/lib/notify-tech-assign";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { releaseLapsedLines, suspendUnpaidLines } from "@/lib/line-lifecycle";
import { sweepPausedPlans } from "@/lib/plan-pause";
import { watchAllLines } from "@/lib/line-watch";
import { sendDueWeeklyReports } from "@/lib/weekly-report";
import { runBillingReconcile } from "@/lib/billing-reconcile";
import { sweepUnbilledJobs } from "@/lib/job-billing";
import { sendFounderScoreboard } from "@/lib/company-scoreboard";
import { logError, logInfo } from "@/lib/logger";
import { processNotificationQueue } from "@/lib/notifications";
import { alertStrandedTextLeads } from "@/lib/stranded-lead-alerts";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";
import { billPreviousMonthOverage } from "@/lib/overage-billing";
import { sendOwnerNudges } from "@/lib/owner-nudges";
import { pruneOperationalLogs, purgeExpiredCallContent } from "@/lib/retention";
import { voiceLatencyRollup } from "@/lib/call-latency";
import { drainJobberSyncs } from "@/lib/jobber";
import { drainHousecallSyncs } from "@/lib/housecall";
import { drainServiceTitanSyncs } from "@/lib/servicetitan";
import { drainQuickBooksSyncs } from "@/lib/quickbooks";
import { purgeStaleVisitorShops } from "@/lib/public-demo";
import { forEachShop } from "@/lib/for-each-shop";
import { claimDailyRun, dailyStepSuccesses, markDailyStep, oldestFirst } from "@/lib/cron-runs";

/*
  The daily sweep, not the thing that makes the retry ladder work.

  Owner alerts back off on 1/5/15/60/240 minutes, so a once-a-day drain can
  never keep up — shop health flags any alert pending five minutes as stuck.
  The obvious answer, scheduling this every minute, is not a schedule on this
  project's Vercel scope, it is a rejected build, and it has taken deploys
  down three times. So the webhooks advance the ladder instead: every call,
  text and delivery receipt drains what is due, which is the same traffic
  that produced the alert. See lib/drain-owner-alerts.ts.

  What is left for a daily run is the case webhooks cannot cover — something
  that fell due while the phone was quiet. Drains overlap, so
  processNotificationQueue claims each row under a lease before sending.
*/
export const maxDuration = 60;

/* Leaves room to answer before the platform kills the function at 60s. */
const DEADLINE_MS = 50_000;

export async function GET(request: NextRequest) {
  if (!isUnauthenticatedAccessAllowed()) {
    const cronSecret = process.env.CRON_SECRET?.trim();

    /*
      The guard used to be conditional on the secret existing, so production
      without CRON_SECRET meant no check at all: anyone could drive the queue
      and read back how many alerts a shop had waiting. Refusing instead is
      the only safe reading of a missing secret, and 503 rather than 401 says
      whose fault it is. deploy:check treats the secret as required so this
      cannot quietly stop the drain — Vercel only sends the bearer header when
      CRON_SECRET is set, which is the same condition being checked here.
    */
    if (!cronSecret) {
      logError("cron.secret_missing", {
        detail: "CRON_SECRET is unset against a live database; refusing to drain",
      });
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 503 },
      );
    }

    if (
      !secretsMatch(getBearerToken(request), cronSecret) &&
      !verifyAdminRequest(request)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  /*
    One request, many shops. Steps run money and alerts first, and anything
    that would start past the deadline is skipped and named in the response,
    rather than the platform killing the function and silently dropping
    whatever came last. The per-shop loops start at a random shop and wrap, so
    a cut-off day still reaches different shops than yesterday.
  */
  if (!(await claimDailyRun())) {
    return NextResponse.json({ ok: false, error: "The daily sweep is already running" }, { status: 409 });
  }

  const started = Date.now();
  const pastDeadline = () => Date.now() - started > DEADLINE_MS;
  const failed: string[] = [];
  const skipped: string[] = [];
  const step = async <T,>(name: string, run: () => Promise<T>): Promise<T | null> => {
    if (pastDeadline()) {
      skipped.push(name);
      return null;
    }
    try {
      const result = await run();
      await markDailyStep(name).catch(() => {});
      return result;
    } catch (error) {
      failed.push(name);
      logError("cron.step_failed", { step: name, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  };

  const perShop = async <T,>(name: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      failed.push(name);
      logError("cron.step_failed", { step: name, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  };

  const [strandedTextLeads, lateCallReports, untoldAssignments] = await Promise.all([
    step("stranded_text_leads", () => alertStrandedTextLeads()),
    step("unfinished_call_reports", () => sweepUnfinishedCallReports()),
    step("untold_assignments", () => sweepUntoldAssignments()),
  ]);
  const notifications = await step("notifications", () => processNotificationQueue(50));

  const overage = await step("overage_billing", () => billPreviousMonthOverage());
  const unpaidLines = await step("unpaid_lines", () => suspendUnpaidLines());
  const pausedPlans = await step("paused_plans", () => sweepPausedPlans());
  const lapsedLines = await step("lapsed_lines", () => releaseLapsedLines());
  const ownerNudges = await step("owner_nudges", () => sendOwnerNudges());
  const stalledPorts = await step("stalled_ports", () => pageStalledPorts());
  const weeklyReports = await step("weekly_reports", () => sendDueWeeklyReports());
  const founderScoreboard = await step("founder_scoreboard", () => sendFounderScoreboard());
  const billingReconcile = await step("billing_reconcile", () => runBillingReconcile());
  /*
    Backstop for a completed job whose invoice write failed or whose process
    died mid-create. Completion and the desk retry are the timely path. This
    daily run is the one schedule Vercel accepts on this project; it does not
    text the customer or change a bill that was already sent.
  */
  const jobBilling = await step("job_billing", () => sweepUnbilledJobs());

  /* Housekeeping and syncs share what is left of the deadline, longest-waiting first. */
  const housekeeping = {
    call_content_retention: () => purgeExpiredCallContent({ budgetMs: 10_000 }),
    log_retention: () => pruneOperationalLogs({ budgetMs: 5_000 }),
    visitor_demo_purge: () => purgeStaleVisitorShops(),
    jobber_sync: () => drainJobberSyncs({ limit: 100, budgetMs: 10_000 }),
    housecall_sync: () => drainHousecallSyncs({ limit: 100, budgetMs: 10_000 }),
    servicetitan_sync: () => drainServiceTitanSyncs({ limit: 100, budgetMs: 10_000 }),
    quickbooks_sync: () => drainQuickBooksSyncs({ limit: 100, budgetMs: 10_000 }),
    voice_latency: async () => {
      const rollup = await voiceLatencyRollup(new Date(Date.now() - 24 * 60 * 60 * 1000));
      logInfo("voice.latency_daily", rollup);
      return rollup;
    },
    // Lost calls and line health have their own 30-minute sweep; this is the daily backstop.
    line_watch: () => watchAllLines(),
  } as const;
  type Housekeeping = keyof typeof housekeeping;
  const names = Object.keys(housekeeping) as Housekeeping[];
  const order = oldestFirst(names, await dailyStepSuccesses(names).catch(() => new Map())) as Housekeeping[];
  const done: Partial<Record<Housekeeping, unknown>> = {};
  for (const name of order) done[name] = await step<unknown>(name, housekeeping[name]);
  const { call_content_retention: retention, log_retention: prunedLogs, visitor_demo_purge: visitorShops, jobber_sync: jobber, housecall_sync: housecall, servicetitan_sync: servicetitan, quickbooks_sync: quickbooks, voice_latency: voiceLatency, line_watch: lines } = done;

  let autopilotShops = 0;
  let autopilotAssigned = 0;
  let autopilotConfirmations = 0;
  const autopilotDone = await forEachShop(
    { autopilot: true, isActive: true, environment: { not: "test" } },
    pastDeadline,
    async (shop) => {
      autopilotShops += 1;
      const ran = await perShop(`autopilot:${shop.id}`, () => runAutopilot(shop.id, { force: true }));
      autopilotAssigned += ran?.assigned ?? 0;
      autopilotConfirmations += ran?.confirmationsSent ?? 0;
    },
  );

  // Calls already refresh a shop's assistant as they connect; this catches shops that had no call.
  const assistants = { current: 0, updated: 0, skipped: 0 };
  const assistantsDone = await forEachShop(
    { isActive: true, vapiAssistantId: { not: null }, environment: { not: "test" } },
    pastDeadline,
    async (shop) => {
      const outcome = await perShop(`assistant:${shop.id}`, () => ensureAssistantCurrent(shop));
      if (outcome) assistants[outcome] += 1;
    },
  );
  if (!autopilotDone) skipped.push("autopilot:rest");
  if (!assistantsDone) skipped.push("assistants:rest");
  if (skipped.length) logError("cron.daily_deadline", { skipped, elapsedMs: Date.now() - started });
  const ok = failed.length === 0 && skipped.length === 0;
  /* "daily:all" ages only when every step succeeded inside the deadline. */
  if (ok) await markDailyStep("all").catch(() => {});

  /* A failed or cut-short run is not a 200: Vercel and any monitor read the status, not the body. */
  return NextResponse.json({
    ...notifications,
    ok: failed.length === 0 && skipped.length === 0,
    failedSteps: failed,
    skipped,
    assistants,
    lines,
    weeklyReports,
    founderScoreboard,
    billingMismatches: billingReconcile?.checked ? billingReconcile.mismatches.length : null,
    jobBilling,
    stalledPorts,
    overage,
    strandedTextLeads,
    lateCallReports,
    untoldAssignments,
    lapsedLines,
    unpaidLines,
    pausedPlans,
    ownerNudges,
    retention,
    prunedLogs,
    visitorShops,
    jobber,
    housecall,
    servicetitan,
    quickbooks,
    voiceLatency,
    autopilot: { shops: autopilotShops, assigned: autopilotAssigned, confirmations: autopilotConfirmations },
  }, { status: ok ? 200 : failed.length ? 500 : 503 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}

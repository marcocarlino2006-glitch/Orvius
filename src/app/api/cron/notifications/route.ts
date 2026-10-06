import { NextRequest, NextResponse } from "next/server";
import { runAutopilot } from "@/lib/autopilot";
import { ensureAssistantCurrent } from "@/lib/sync-business-assistant";
import { prisma } from "@/lib/prisma";
import { sendDueCustomerConfirmationReminders } from "@/lib/customer-confirm";
import { sweepUnfinishedCallReports } from "@/lib/call-ingest";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { releaseLapsedLines } from "@/lib/line-lifecycle";
import { watchAllLines } from "@/lib/line-watch";
import { sendDueWeeklyReports } from "@/lib/weekly-report";
import { sendFounderScoreboard } from "@/lib/company-scoreboard";
import { logError, logInfo } from "@/lib/logger";
import { processNotificationQueue } from "@/lib/notifications";
import { alertStrandedTextLeads } from "@/lib/stranded-lead-alerts";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";
import { billPreviousMonthOverage } from "@/lib/overage-billing";
import { sendOwnerNudges } from "@/lib/owner-nudges";
import { purgeExpiredCallContent } from "@/lib/retention";
import { voiceLatencyRollup } from "@/lib/call-latency";
import { drainJobberSyncs } from "@/lib/jobber";
import { purgeStaleVisitorShops } from "@/lib/public-demo";
import { forEachShop } from "@/lib/for-each-shop";

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
      return await run();
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

  const [strandedTextLeads, lateCallReports] = await Promise.all([
    step("stranded_text_leads", () => alertStrandedTextLeads()),
    step("unfinished_call_reports", () => sweepUnfinishedCallReports()),
  ]);
  const [notifications, customerConfirmations] = await Promise.all([
    step("notifications", () => processNotificationQueue(50)),
    step("customer_confirmations", () => sendDueCustomerConfirmationReminders(new Date(), 25)),
  ]);

  const overage = await step("overage_billing", () => billPreviousMonthOverage());
  const lapsedLines = await step("lapsed_lines", () => releaseLapsedLines());
  const ownerNudges = await step("owner_nudges", () => sendOwnerNudges());
  const weeklyReports = await step("weekly_reports", () => sendDueWeeklyReports());
  const founderScoreboard = await step("founder_scoreboard", () => sendFounderScoreboard());
  const retention = await step("call_content_retention", () => purgeExpiredCallContent());
  const visitorShops = await step("visitor_demo_purge", () => purgeStaleVisitorShops());
  const jobber = await step("jobber_sync", () => drainJobberSyncs({ limit: 100, budgetMs: 10_000 }));
  const voiceLatency = await step("voice_latency", async () => {
    const rollup = await voiceLatencyRollup(new Date(Date.now() - 24 * 60 * 60 * 1000));
    logInfo("voice.latency_daily", rollup);
    return rollup;
  });
  // Lost calls and line health have their own 30-minute sweep; this is the daily backstop.
  const lines = await step("line_watch", () => watchAllLines());

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

  return NextResponse.json({
    ...notifications,
    ok: failed.length === 0 && skipped.length === 0,
    failedSteps: failed,
    skipped,
    assistants,
    lines,
    weeklyReports,
    founderScoreboard,
    overage,
    customerConfirmations,
    strandedTextLeads,
    lateCallReports,
    lapsedLines,
    ownerNudges,
    retention,
    visitorShops,
    jobber,
    voiceLatency,
    autopilot: { shops: autopilotShops, assigned: autopilotAssigned, confirmations: autopilotConfirmations },
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}

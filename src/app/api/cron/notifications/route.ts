import { NextRequest, NextResponse } from "next/server";
import type { Business, Prisma } from "@prisma/client";
import { runAutopilot } from "@/lib/autopilot";
import { ensureAssistantCurrent } from "@/lib/sync-business-assistant";
import { prisma } from "@/lib/prisma";
import { sendDueCustomerConfirmationReminders } from "@/lib/customer-confirm";
import { sweepUnfinishedCallReports } from "@/lib/call-ingest";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { releaseLapsedLines } from "@/lib/line-lifecycle";
import { watchAllLines } from "@/lib/line-watch";
import { sendDueWeeklyReports } from "@/lib/weekly-report";
import { logError, logInfo } from "@/lib/logger";
import { processNotificationQueue } from "@/lib/notifications";
import { alertStrandedTextLeads } from "@/lib/stranded-lead-alerts";
import { isProduction } from "@/lib/runtime";
import { billPreviousMonthOverage } from "@/lib/overage-billing";
import { sendOwnerNudges } from "@/lib/owner-nudges";
import { purgeExpiredCallContent } from "@/lib/retention";
import { voiceLatencyRollup } from "@/lib/call-latency";
import { drainJobberSyncs } from "@/lib/jobber";

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
export async function GET(request: NextRequest) {
  if (isProduction()) {
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
        detail: "CRON_SECRET is unset in production; refusing to drain",
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

  const failed: string[] = [];
  const step = async <T,>(name: string, run: () => Promise<T>): Promise<T | null> => {
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

  let autopilotShops = 0;
  let autopilotAssigned = 0;
  let autopilotConfirmations = 0;
  await forEachShop({ autopilot: true, isActive: true, environment: { not: "test" } }, async (shop) => {
    autopilotShops += 1;
    const ran = await step(`autopilot:${shop.id}`, () => runAutopilot(shop.id, { force: true }));
    autopilotAssigned += ran?.assigned ?? 0;
    autopilotConfirmations += ran?.confirmationsSent ?? 0;
  });

  const assistants = { current: 0, updated: 0, skipped: 0 };
  await forEachShop({ isActive: true, vapiAssistantId: { not: null }, environment: { not: "test" } }, async (shop) => {
    const outcome = await step(`assistant:${shop.id}`, () => ensureAssistantCurrent(shop));
    if (outcome) assistants[outcome] += 1;
  });

  const lines = await step("line_watch", () => watchAllLines());
  const weeklyReports = await step("weekly_reports", () => sendDueWeeklyReports());
  const overage = await step("overage_billing", () => billPreviousMonthOverage());
  const lapsedLines = await step("lapsed_lines", () => releaseLapsedLines());
  const ownerNudges = await step("owner_nudges", () => sendOwnerNudges());
  const jobber = await step("jobber_sync", () => drainJobberSyncs({ limit: 100, budgetMs: 60_000 }));
  const retention = await step("call_content_retention", () => purgeExpiredCallContent());
  const voiceLatency = await step("voice_latency", async () => {
    const rollup = await voiceLatencyRollup(new Date(Date.now() - 24 * 60 * 60 * 1000));
    logInfo("voice.latency_daily", rollup);
    return rollup;
  });
  return NextResponse.json({
    ok: failed.length === 0,
    failed,
    ...notifications,
    assistants,
    lines,
    weeklyReports,
    overage,
    customerConfirmations,
    strandedTextLeads,
    lateCallReports,
    lapsedLines,
    ownerNudges,
    retention,
    jobber,
    voiceLatency,
    autopilot: { shops: autopilotShops, assigned: autopilotAssigned, confirmations: autopilotConfirmations },
  });
}

const SHOP_PAGE = 100;
const SHOP_CONCURRENCY = 8;

/** Every matching shop, paged by id, a few at a time — no silent cap as the shop count grows. */
async function forEachShop(
  where: Prisma.BusinessWhereInput,
  run: (shop: Business) => Promise<void>,
) {
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.business.findMany({
      where,
      orderBy: { id: "asc" },
      take: SHOP_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (let i = 0; i < page.length; i += SHOP_CONCURRENCY) {
      await Promise.all(page.slice(i, i + SHOP_CONCURRENCY).map(run));
    }
    if (page.length < SHOP_PAGE) return;
    cursor = page[page.length - 1]!.id;
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

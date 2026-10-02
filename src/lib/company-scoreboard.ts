import { unitEconomicsSince, type UnitEconomics } from "@/lib/call-cost";
import { unitCostLines } from "@/lib/unit-cost-lines";
import { company } from "@/lib/company";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * The one board the company is run from, reviewed weekly. Real shops only:
 * demo and test workspaces never count.
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** A call still "in progress" after this long never finished; it counts as failed. */
const STUCK_CALL_MS = 60 * 60 * 1000;

const realShop = { environment: "production" } as const;

export type ScoreboardWeek = {
  start: string;
  newShops: number;
  churnedShops: number;
  calls: number;
  failedCalls: number;
  /** Share of calls that finished cleanly, 0–100; null with no calls. */
  answeredCleanPct: number | null;
  leads: number;
  leadsBooked: number;
  /** Leads that became a job, 0–100; null with no leads. */
  bookingRate: number | null;
  jobsBooked: number;
  collectedCents: number;
};

export type CompanyScoreboard = {
  generatedAt: string;
  payingShops: number;
  activeShops: number;
  thisWeek: ScoreboardWeek;
  lastWeek: ScoreboardWeek;
  /** Median minutes from a shop's signup to its first booked job, shops from the last 30 days. */
  signupToFirstJobMinutes: number | null;
  shopsWithoutFirstJob: number;
  /** Last 30 days of real calls that reported a cost; null until the first one does. */
  unitCost: UnitEconomics | null;
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

async function week(start: Date, end: Date, now: Date): Promise<ScoreboardWeek> {
  const inWindow = { gte: start, lt: end };
  const stuckBefore = new Date(Math.min(end.getTime(), now.getTime() - STUCK_CALL_MS));
  const [newShops, churnedShops, calls, failedCalls, stuckCalls, leads, leadsBooked, jobsBooked, collected] =
    await Promise.all([
      prisma.business.count({ where: { ...realShop, createdAt: inWindow } }),
      prisma.business.count({ where: { ...realShop, canceledAt: inWindow } }),
      prisma.call.count({ where: { business: realShop, createdAt: inWindow } }),
      prisma.call.count({ where: { business: realShop, createdAt: inWindow, status: "failed" } }),
      prisma.call.count({
        where: { business: realShop, createdAt: { gte: start, lt: stuckBefore }, status: "in-progress" },
      }),
      prisma.lead.count({ where: { business: realShop, createdAt: inWindow } }),
      prisma.lead.count({ where: { business: realShop, createdAt: inWindow, job: { isNot: null } } }),
      prisma.job.count({ where: { business: realShop, createdAt: inWindow } }),
      prisma.payment.aggregate({
        where: { business: realShop, createdAt: inWindow, status: { not: "refunded" } },
        _sum: { amountCents: true },
      }),
    ]);
  const failed = failedCalls + stuckCalls;
  return {
    start: start.toISOString().slice(0, 10),
    newShops,
    churnedShops,
    calls,
    failedCalls: failed,
    answeredCleanPct: pct(calls - failed, calls),
    leads,
    leadsBooked,
    bookingRate: pct(leadsBooked, leads),
    jobsBooked,
    collectedCents: collected._sum.amountCents ?? 0,
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function getCompanyScoreboard(now = new Date()): Promise<CompanyScoreboard> {
  const thisStart = new Date(now.getTime() - WEEK_MS);
  const lastStart = new Date(now.getTime() - 2 * WEEK_MS);
  const [payingShops, activeShops, thisWeek, lastWeek, recentShops, unitCost] = await Promise.all([
    prisma.business.count({
      where: { ...realShop, isActive: true, billingStatus: { in: ["active", "past_due"] } },
    }),
    prisma.business.count({ where: { ...realShop, isActive: true } }),
    week(thisStart, now, now),
    week(lastStart, thisStart, now),
    prisma.business.findMany({
      where: { ...realShop, createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      select: {
        createdAt: true,
        jobs: { orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } },
      },
      take: 1000,
    }),
    unitEconomicsSince(new Date(now.getTime() - 30 * DAY_MS)),
  ]);

  const minutes = recentShops
    .filter((shop) => shop.jobs[0])
    .map((shop) => Math.max(0, Math.round((shop.jobs[0].createdAt.getTime() - shop.createdAt.getTime()) / 60_000)));

  return {
    generatedAt: now.toISOString(),
    payingShops,
    activeShops,
    thisWeek,
    lastWeek,
    signupToFirstJobMinutes: median(minutes),
    shopsWithoutFirstJob: recentShops.length - minutes.length,
    unitCost,
  };
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const rate = (value: number | null) => (value == null ? "—" : `${value}%`);

function duration(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 120) return `${minutes} min`;
  if (minutes < 2 * 24 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (24 * 60))} days`;
}

export function scoreboardLines(board: CompanyScoreboard): string[] {
  const now = board.thisWeek;
  const prev = board.lastWeek;
  return [
    `Paying shops: ${board.payingShops} (${board.activeShops} active)`,
    `New shops: ${now.newShops} (last week ${prev.newShops}) · canceled: ${now.churnedShops} (last week ${prev.churnedShops})`,
    `Calls: ${now.calls} · finished cleanly: ${rate(now.answeredCleanPct)} (last week ${rate(prev.answeredCleanPct)}) · failed: ${now.failedCalls}`,
    `Booking rate: ${rate(now.bookingRate)} of ${now.leads} leads (last week ${rate(prev.bookingRate)})`,
    `Jobs booked: ${now.jobsBooked} (last week ${prev.jobsBooked})`,
    `Collected through Orvius: ${money(now.collectedCents)} (last week ${money(prev.collectedCents)})`,
    `Signup to first booked job: ${duration(board.signupToFirstJobMinutes)} median · ${board.shopsWithoutFirstJob} new shop(s) still without one`,
    ...unitCostLines(board.unitCost),
  ];
}


export function buildScoreboardEmail(board: CompanyScoreboard) {
  return {
    subject: `${company.productName} weekly: ${board.payingShops} paying, ${board.thisWeek.jobsBooked} jobs booked, ${rate(board.thisWeek.answeredCleanPct)} calls clean`,
    text: [
      `${company.productName} — week ending ${board.generatedAt.slice(0, 10)}`,
      "",
      ...scoreboardLines(board),
      "",
      `Full board: ${getAppUrl()}/admin`,
    ].join("\n"),
  };
}

function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function founderRecipients() {
  return (process.env.ORVIUS_FOUNDER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Monday (UTC), once per ISO week, to the founders. */
export async function sendFounderScoreboard(now = new Date()) {
  if (now.getUTCDay() !== 1) return { sent: 0, skipped: "not monday" };
  if (!isEmailConfigured()) return { sent: 0, skipped: "email not configured" };
  const recipients = founderRecipients();
  if (!recipients.length) return { sent: 0, skipped: "no founder emails" };

  const externalId = isoWeek(now);
  try {
    await prisma.webhookEvent.create({
      data: { source: "orvius", externalId, eventType: "founder-scoreboard", status: "processing" },
    });
  } catch {
    return { sent: 0, skipped: "already sent this week" };
  }

  try {
    const email = buildScoreboardEmail(await getCompanyScoreboard(now));
    for (const to of recipients) await sendOwnerEmail({ to, ...email });
    await prisma.webhookEvent.updateMany({
      where: { source: "orvius", externalId, eventType: "founder-scoreboard" },
      data: { status: "completed" },
    });
    logInfo("founder_scoreboard.sent", { week: externalId, recipients: recipients.length });
    return { sent: recipients.length };
  } catch (error) {
    await prisma.webhookEvent.deleteMany({
      where: { source: "orvius", externalId, eventType: "founder-scoreboard" },
    });
    logWarn("founder_scoreboard.failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

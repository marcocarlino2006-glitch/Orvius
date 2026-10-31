import { holdDecisionsByLead } from "@/lib/booking-decision";
import { loadCallReviews } from "@/lib/call-review";
import { gradeCall } from "@/lib/call-quality";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/unique-violation";

/**
 * Orvius's proof, across every real shop: of the phone calls that came in,
 * how many were answered, how long callers waited for a reply, how many that
 * could have been booked were, and how many a shop owner would not need to
 * listen to. This week against the week before, so a drop is seen the day it
 * starts, not when a shop complains.
 */
export type ScoreWeek = {
  calls: number;
  answered: number;
  bookable: number;
  booked: number;
  clean: number;
  graded: number;
  transferred: number;
  /** Median of each call's 90th-percentile wait for a reply, in ms. */
  replyP90Ms: number | null;
};

export type Scorecard = { thisWeek: ScoreWeek; lastWeek: ScoreWeek; drops: string[] };

const DAY_MS = 86_400_000;
const MIN_CALLS = 10;

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export type ScoredCall = {
  answered: boolean;
  booked: boolean;
  bookable: boolean;
  clean: boolean;
  transferred: boolean;
  replyP90Ms: number | null;
};

export function scoreWeek(calls: ScoredCall[]): ScoreWeek {
  return {
    calls: calls.length,
    answered: calls.filter((c) => c.answered).length,
    bookable: calls.filter((c) => c.bookable).length,
    booked: calls.filter((c) => c.bookable && c.booked).length,
    clean: calls.filter((c) => c.answered && c.clean).length,
    graded: calls.filter((c) => c.answered).length,
    transferred: calls.filter((c) => c.transferred).length,
    replyP90Ms: median(calls.map((c) => c.replyP90Ms).filter((v): v is number => typeof v === "number")),
  };
}

/** What got worse enough to act on. Quiet weeks say nothing: ten calls is too few to call a trend. */
export function scorecardDrops(thisWeek: ScoreWeek, lastWeek: ScoreWeek): string[] {
  if (thisWeek.calls < MIN_CALLS || lastWeek.calls < MIN_CALLS) return [];
  const drops: string[] = [];
  const answeredNow = pct(thisWeek.answered, thisWeek.calls)!;
  const answeredThen = pct(lastWeek.answered, lastWeek.calls)!;
  if (answeredThen - answeredNow >= 5) drops.push(`Answered fell from ${answeredThen}% to ${answeredNow}% of calls.`);
  const bookedNow = pct(thisWeek.booked, thisWeek.bookable);
  const bookedThen = pct(lastWeek.booked, lastWeek.bookable);
  if (bookedNow != null && bookedThen != null && thisWeek.bookable >= 5 && bookedThen - bookedNow >= 15) {
    drops.push(`Booked fell from ${bookedThen}% to ${bookedNow}% of bookable calls.`);
  }
  const cleanNow = pct(thisWeek.clean, thisWeek.graded);
  const cleanThen = pct(lastWeek.clean, lastWeek.graded);
  if (cleanNow != null && cleanThen != null && cleanThen - cleanNow >= 15) {
    drops.push(`Calls an owner wouldn't need to hear fell from ${cleanThen}% to ${cleanNow}%.`);
  }
  if (thisWeek.replyP90Ms != null && lastWeek.replyP90Ms != null && thisWeek.replyP90Ms - lastWeek.replyP90Ms >= 300 && thisWeek.replyP90Ms >= lastWeek.replyP90Ms * 1.3) {
    drops.push(`Slowest replies grew from ${(lastWeek.replyP90Ms / 1000).toFixed(1)}s to ${(thisWeek.replyP90Ms / 1000).toFixed(1)}s.`);
  }
  return drops;
}

async function scoredCalls(from: Date, to: Date): Promise<ScoredCall[]> {
  const calls = await prisma.call.findMany({
    where: {
      createdAt: { gte: from, lt: to },
      business: { environment: "production" },
      channel: null,
      direction: "inbound",
      status: { notIn: ["in-progress", "ringing"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      id: true,
      businessId: true,
      status: true,
      durationSec: true,
      transcript: true,
      summary: true,
      booked: true,
      successEvaluation: true,
      endedReason: true,
      replyP90Ms: true,
      business: { select: { trade: true, servicesJson: true, name: true } },
      customer: { select: { address: true } },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
          serviceType: true,
          urgency: true,
          categoryCode: true,
          notes: true,
          status: true,
          job: { select: { id: true } },
        },
      },
    },
  });
  const unbookedByShop = new Map<string, string[]>();
  for (const call of calls) {
    if (call.lead && !call.lead.job) unbookedByShop.set(call.businessId, [...(unbookedByShop.get(call.businessId) ?? []), call.lead.id]);
  }
  const holds = new Map<string, string>();
  for (const [businessId, leadIds] of unbookedByShop) {
    for (const [leadId, reason] of await holdDecisionsByLead(businessId, leadIds)) holds.set(leadId, reason);
  }
  const reviews = await loadCallReviews(calls.map((call) => call.id));
  return calls.map((call) => {
    const grade = gradeCall({
      call,
      lead: call.lead,
      business: call.business ?? {},
      knownAddress: call.customer?.address,
      holdDecision: call.lead ? holds.get(call.lead.id) : null,
      review: reviews.get(call.id),
    });
    const keys = new Set(grade.findings.map((f) => f.key));
    const booked = call.booked || Boolean(call.lead?.job);
    return {
      answered: !keys.has("not_connected"),
      booked,
      bookable: booked || keys.has("not_booked"),
      clean: grade.verdict === "clean",
      transferred: call.endedReason === "assistant-forwarded-call",
      replyP90Ms: call.replyP90Ms,
    };
  });
}

export async function getReceptionistScorecard(now = new Date()): Promise<Scorecard> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);
  const [thisWeek, lastWeek] = await Promise.all([scoredCalls(weekAgo, now).then(scoreWeek), scoredCalls(twoWeeksAgo, weekAgo).then(scoreWeek)]);
  return { thisWeek, lastWeek, drops: scorecardDrops(thisWeek, lastWeek) };
}

const founderRecipients = () =>
  (process.env.ORVIUS_FOUNDER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** Once a day: when the receptionist got measurably worse this week, the founders hear it with the numbers. */
export async function checkScorecardOnceADay(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  try {
    await prisma.webhookEvent.create({ data: { source: "orvius", externalId: day, eventType: "scorecard-check", status: "processing" } });
  } catch (error) {
    if (isUniqueViolation(error)) return { ran: false as const };
    throw error;
  }
  const card = await getReceptionistScorecard(now);
  await prisma.webhookEvent.updateMany({
    where: { source: "orvius", externalId: day, eventType: "scorecard-check" },
    data: { status: card.drops.length ? "dropped" : "steady", payloadJson: JSON.stringify(card) },
  });
  if (!card.drops.length) {
    logInfo("scorecard.steady", { calls: card.thisWeek.calls });
    return { ran: true as const, drops: [] };
  }
  logWarn("scorecard.dropped", { drops: card.drops });
  const recipients = founderRecipients();
  if (recipients.length && isEmailConfigured()) {
    const text = [
      "The receptionist got worse this week than last, across every real shop:",
      "",
      ...card.drops.map((d) => `- ${d}`),
      "",
      `This week: ${card.thisWeek.calls} calls. Last week: ${card.lastWeek.calls}.`,
      "The full scorecard is on the admin Launch tab.",
    ].join("\n");
    for (const to of recipients) await sendOwnerEmail({ to, subject: "Orvius alarm: the receptionist got worse this week", text });
  }
  return { ran: true as const, drops: card.drops };
}

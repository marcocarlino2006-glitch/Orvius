import { buildAskBrief, type AskBrief } from "@/lib/ask-brief";
import { formatCents } from "@/lib/money";
import { getAttentionQueue } from "@/lib/attention-queue";
import {
  getOwnerSetupStatus,
  ownerSetupHref,
} from "@/lib/owner-setup-state";
import { prisma } from "@/lib/prisma";
import { getShopHealth } from "@/lib/shop-health";
import {
  isNextActionQuestion,
  resolveShopOperateNext,
  type ShopOperateNext,
} from "@/lib/shop-operate";
import { answerFromRecords } from "@/lib/ask-answer";
import { answerWithModel } from "@/lib/ask-model";
import {
  composeMemoryAnswer,
  retrieveShopMemory,
  type MemoryHit,
  type ShopMemory,
} from "@/lib/shop-memory";
import { getShopOutcomes } from "@/lib/shop-outcomes";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isOutcomesQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    q.includes("book") ||
    q.includes("booking") ||
    q.includes("how many job") ||
    q.includes("after-hours") ||
    q.includes("after hours") ||
    q.includes("this week") ||
    q.includes("outcomes") ||
    q.includes("utilization") ||
    q.includes("pipeline") ||
    q.includes("revenue") ||
    q.includes("ticket")
  );
}

/** Cursor tunnel — owner asks what to do; we answer from the same next-gate as Command. */
export { isNextActionQuestion } from "@/lib/shop-operate";

function formatOutcomesAnswer(
  outcomes: Awaited<ReturnType<typeof getShopOutcomes>>,
): string {
  const booking =
    outcomes.bookingRate != null
      ? `${outcomes.bookingRate}% of leads became jobs`
      : "no leads yet to compute a booking rate";
  const lines = [
    `Last ${outcomes.windowDays} days:`,
    `${outcomes.calls} calls · ${outcomes.leads} leads · ${outcomes.jobsBooked} jobs booked (${booking}).`,
  ];
  if (outcomes.afterHoursLeads > 0) {
    lines.push(`${outcomes.afterHoursLeads} after-hours leads captured.`);
  }
  if (outcomes.emergenciesBooked > 0) {
    lines.push(`${outcomes.emergenciesBooked} emergencies booked.`);
  }
  if (outcomes.unassignedJobs > 0) {
    lines.push(`${outcomes.unassignedJobs} jobs still need a technician.`);
  }
  if (outcomes.jobsPerTech != null) {
    lines.push(`${outcomes.jobsPerTech} jobs per active tech.`);
  }
  const pipeline = formatCents(outcomes.estimatedPipelineCents);
  const leadValue = formatCents(outcomes.estimatedLeadValueCents);
  if (pipeline) {
    lines.push(`Est. pipeline from booked jobs: ${pipeline} (avg ticket).`);
  } else if (outcomes.jobsBooked > 0) {
    lines.push("Set average ticket in Settings to estimate pipeline dollars.");
  }
  if (leadValue) {
    lines.push(`Est. value of leads this window: ${leadValue}.`);
  }
  return lines.join(" ");
}

function formatOperateAnswer(
  next: ShopOperateNext,
  topTitle?: string,
  topAction?: string,
): string {
  const lines = [`${next.title}. ${next.detail}`, `Next: ${next.cta}.`];
  if (topTitle && topAction) {
    lines.push(`First on the board: ${topTitle} — ${topAction}.`);
  }
  return lines.join(" ");
}

async function loadOperateNext(businessId: string): Promise<{
  next: ShopOperateNext;
  top: { title: string; action: string; href: string; id: string } | null;
}> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: {
      ownerPhone: true,
      twilioPhone: true,
      vapiPhoneNumber: true,
      overflowForwardConfirmedAt: true,
      lineVerifiedAt: true,
      avgTicketCents: true,
      baselineMissedCallsPerWeek: true,
      baselineJobsPerWeek: true,
      lastWeeklyProofAt: true,
    },
  });

  const [health, attention, outcomes] = await Promise.all([
    getShopHealth(businessId),
    getAttentionQueue(businessId),
    getShopOutcomes(businessId, 7),
  ]);

  const setup = getOwnerSetupStatus(business);
  const criticalAttention = attention.filter((i) => i.impact === "critical").length;
  const nothingToProve = outcomes.calls === 0 && outcomes.leads === 0;
  const economicsReady = Boolean(
    business.avgTicketCents &&
      business.baselineMissedCallsPerWeek != null &&
      business.baselineJobsPerWeek != null,
  );
  const proofTime = business.lastWeeklyProofAt?.getTime() ?? 0;
  const proofStale =
    !nothingToProve &&
    economicsReady &&
    (!proofTime || Date.now() - proofTime > WEEK_MS);

  const next = resolveShopOperateNext({
    setupReady: setup.ready,
    setupNext: setup.nextStep,
    setupHref: ownerSetupHref(setup.nextStep),
    failedAlerts: health.failedAlerts24h,
    stuckAlerts: health.stuckPendingAlerts,
    criticalAttention,
    attentionCount: attention.length,
    proofStale,
    economicsReady,
  });

  const topItem = attention[0];
  return {
    next,
    top: topItem
      ? {
          title: topItem.title,
          action: topItem.recommendedAction,
          href: topItem.href,
          id: topItem.id,
        }
      : null,
  };
}

export type AskResult = {
  answer: string;
  source: "memory" | "memory+model" | "outcomes" | "operate";
  hits: MemoryHit[];
  stats: ShopMemory["stats"];
  /** Present when the answer rests on individual records. */
  brief?: AskBrief;
};

export async function askShop(question: string, businessId: string): Promise<AskResult> {
  if (isNextActionQuestion(question)) {
    const { next, top } = await loadOperateNext(businessId);
    const hits: MemoryHit[] = [
      {
        type: "operate",
        id: next.id,
        href: next.href,
        title: next.cta,
        summary: next.title,
        score: 1,
        observedAt: new Date().toISOString(),
      },
    ];
    if (top) {
      hits.push({
        type: "operate",
        id: top.id,
        href: top.href,
        title: top.action,
        summary: top.title,
        score: 0.9,
        observedAt: new Date().toISOString(),
      });
    }
    return {
      answer: formatOperateAnswer(next, top?.title, top?.action),
      source: "operate",
      hits,
      stats: { customers: 0, jobs: 0, leads: 0, calls: 0 },
    };
  }

  if (isOutcomesQuestion(question)) {
    const outcomes = await getShopOutcomes(businessId, 7);
    return {
      answer: formatOutcomesAnswer(outcomes),
      source: "outcomes",
      hits: [],
      stats: {
        customers: 0,
        jobs: outcomes.jobsBooked,
        leads: outcomes.leads,
        calls: outcomes.calls,
      },
    };
  }

  const memory = await retrieveShopMemory(question, businessId);
  const [direct, brief] = await Promise.all([
    answerFromRecords({ businessId, hits: memory.hits }),
    buildAskBrief({ businessId, hits: memory.hits, modelWorded: false }),
  ]);
  const grounded = direct ?? composeMemoryAnswer(memory);
  const model = await answerWithModel({ question, memory, brief, direct, businessId });

  if (!model) {
    return { answer: grounded, source: "memory", hits: memory.hits, stats: memory.stats, brief };
  }
  const cited = new Set(model.cited);
  const hits = [...memory.hits].sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id)));
  return {
    answer: model.answer,
    source: "memory+model",
    hits,
    stats: memory.stats,
    brief: {
      ...brief,
      uncertainty: [...(model.unsure ? [model.unsure] : []), ...brief.uncertainty].slice(0, 4),
    },
  };
}

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
import { answerDirect } from "@/lib/ask-direct";
import { answerWithModel, type AskHistoryTurn } from "@/lib/ask-model";
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
  source: "memory" | "memory+model" | "outcomes" | "operate" | "records";
  hits: MemoryHit[];
  stats: ShopMemory["stats"];
  /** Present when the answer rests on individual records. */
  brief?: AskBrief;
  /** A next question worth asking, when the answer opens one up. */
  followUp?: string | null;
};

/**
 * Follow-ups rarely name the record again ("and tomorrow?", "text her back").
 * When a question reads like a continuation, search with the last question's
 * words attached so the same records surface. Facts still come from records.
 */
const REFERENTIAL =
  /^(and|but|so|what about|how about|why|when|where|who else|which|what else|text|call|email|him|her|them|they|that|this|it|the same|same|ok|okay|then)\b/i;

export function retrievalQuery(question: string, history: AskHistoryTurn[] = []): string {
  const last = history[history.length - 1];
  if (!last) return question;
  const short = question.trim().split(/\s+/).length <= 5;
  if (!short && !REFERENTIAL.test(question.trim())) return question;
  return `${last.question} ${question}`;
}

export type AskOpening = {
  headline: string;
  detail: string;
  suggestions: string[];
};

/**
 * What Ask says before the owner types: where the shop stands right now and
 * the questions that follow from it. Built from the same attention queue and
 * outcomes Command reads, so the two screens never disagree.
 */
export async function askOpening(businessId: string): Promise<AskOpening> {
  const [attention, outcomes] = await Promise.all([
    getAttentionQueue(businessId).catch(() => []),
    getShopOutcomes(businessId, 7).catch(() => null),
  ]);
  const suggestions: string[] = [];
  if (attention.length) suggestions.push("What should I do now?");
  if (outcomes && outcomes.afterHoursLeads > 0) suggestions.push("What happened overnight?");
  if (attention.some((i) => /unassigned|technician/i.test(`${i.title} ${i.recommendedAction}`))) {
    suggestions.push("What's unassigned on dispatch?");
  }
  if (outcomes && outcomes.jobsBooked > 0) suggestions.push("How many jobs did we book this week?");
  suggestions.push("Which customers are waiting on a callback?");
  const unique = [...new Set(suggestions)].slice(0, 4);

  if (attention.length) {
    const top = attention.slice(0, 2).map((i) => i.title.replace(/\.$/, ""));
    return {
      headline: attention.length === 1 ? "One thing needs you." : `${attention.length} things need you.`,
      detail: `${top.join(". ")}. Ask me about any of it — or tell me what you want handled first.`,
      suggestions: unique,
    };
  }
  if (outcomes && outcomes.calls > 0) {
    return {
      headline: "The shop is covered.",
      detail: `In the last 7 days Orvius took ${outcomes.calls} ${outcomes.calls === 1 ? "call" : "calls"} and booked ${outcomes.jobsBooked} ${outcomes.jobsBooked === 1 ? "job" : "jobs"}. Nothing is waiting on you right now.`,
      suggestions: unique,
    };
  }
  return {
    headline: "Ask what happened, what matters, and what to do next.",
    detail: "Every answer cites the records it used. When Orvius proposes an action, it tells you exactly what will happen and waits for your approval.",
    suggestions: unique,
  };
}

export async function askShop(question: string, businessId: string, history: AskHistoryTurn[] = []): Promise<AskResult> {
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

  const exact = await answerDirect(question, businessId);
  if (exact) {
    return {
      answer: exact.answer,
      source: "records",
      hits: exact.hits,
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

  const memory = await retrieveShopMemory(retrievalQuery(question, history), businessId);
  const [direct, brief] = await Promise.all([
    answerFromRecords({ businessId, hits: memory.hits }),
    buildAskBrief({ businessId, hits: memory.hits, modelWorded: false }),
  ]);
  const grounded = direct ?? composeMemoryAnswer(memory);
  const model = await answerWithModel({ question, memory, brief, direct, businessId, history });

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
    followUp: model.followUp,
    brief: {
      ...brief,
      uncertainty: [...(model.unsure ? [model.unsure] : []), ...brief.uncertainty].slice(0, 4),
    },
  };
}

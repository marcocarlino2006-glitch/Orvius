import "server-only";

import { rollUpByPerson } from "@/lib/attention-rollup";
import { isLeadQualifiedForBooking, isPriorityUrgency } from "@/lib/auto-job";
import { isAfterHours } from "@/lib/business";
import { listCrew } from "@/lib/field";
import {
  concurrentCallsImpact,
  concurrentCallsRecommendedAction,
} from "@/lib/concurrent-calls";
import { isOwnerAlertUnacked } from "@/lib/owner-alert-unacked";
import { leadIsNotAJob } from "@/lib/lead-not-a-job";
import { leadIsPartialCapture } from "@/lib/lead-partial-capture";
import { leadHasTranscriptDispute } from "@/lib/lead-transcript-dispute";
import { jobIsCustomerNoShow, jobIsTechNoShow } from "@/lib/job-no-show";
import { depositNeedsOwnerFollowUp } from "@/lib/deposit-fail";
import { depositMoneyPathBroken } from "@/lib/deposit-money-path";
import { estimateNeedsOwnerFollowUp } from "@/lib/estimate-fail";
import { ownerAlertsAreMuted } from "@/lib/owner-alerts-muted";
import { leadWantsHuman } from "@/lib/lead-wants-human";
import { ownerSetupHref } from "@/lib/owner-setup-state";
import { prisma } from "@/lib/prisma";
import type {
  AttentionImpact,
  AttentionItem,
  AttentionKind,
} from "@/lib/attention-types";

export type {
  AttentionImpact,
  AttentionItem,
  AttentionKind,
} from "@/lib/attention-types";
export { attentionKindLabel } from "@/lib/attention-types";

const FOLLOWUP_HOURS = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/*
  Housekeeping. Real work, but not work anyone does in the dark, and the
  board should not spend its first screen on it while the line is live.
*/
const HOUSEKEEPING: ReadonlySet<AttentionKind> = new Set([
  "founder_cert",
  "missing_baseline",
  "stale_weekly_proof",
  "available_tech",
]);

/* Rows that only exist because a call came in and nobody has answered it. */
const NIGHT_WORK: ReadonlySet<AttentionKind> = new Set([
  "needs_capture",
  "needs_qualify",
  "urgent_lead",
  "needs_booking",
  "new_lead",
  "wants_human",
  "partial_capture",
  "alert_unacked",
  "concurrent_calls",
  "transcript_dispute",
  "customer_no_show",
  "tech_no_show",
  "deposit_failed",
  "deposit_delivery_failed",
  "estimate_failed",
  "alerts_muted",
  "money_path_broken",
]);

/**
 * Where a row sits on the board. Lower is higher up.
 *
 * The same row is not worth the same at both ends of the day. Orvius exists
 * because the shop's phone rings after it closes, so inside that window a
 * lead nobody has qualified is the whole product working, and setting an
 * average-ticket baseline is not something an owner does at 2am. Outside the
 * window the ordering stands as authored.
 *
 * The nudge is deliberately smaller than the gaps between kinds, so it
 * reorders rows within a tier rather than letting the clock outrank an
 * emergency.
 */
function kindRank(
  kind: AttentionKind,
  urgency?: string | null,
  afterHours = false,
): number {
  return baseRank(kind, urgency) + (afterHours ? nightShift(kind) : 0);
}

function nightShift(kind: AttentionKind): number {
  if (NIGHT_WORK.has(kind)) return -3;
  if (HOUSEKEEPING.has(kind)) return 12;
  return 0;
}

function baseRank(kind: AttentionKind, urgency?: string | null): number {
  const emergency = isPriorityUrgency(urgency);
  switch (kind) {
    case "billing_action":
      return 5;
    case "alert_failed":
      return 6;
    case "wants_human":
      return emergency ? 7 : 12;
    case "transcript_dispute":
      return emergency ? 7 : 11;
    case "customer_no_show":
      return 8;
    case "tech_no_show":
      return 9;
    case "deposit_failed":
      return 10;
    case "deposit_delivery_failed":
      return 7;
    case "estimate_failed":
      return 13;
    case "alerts_muted":
      return 3;
    case "money_path_broken":
      return 7;
    case "tech_needs_phone":
      return 48;
    case "partial_capture":
      return emergency ? 8 : 15;
    case "alert_unacked":
      return emergency ? 7 : 13;
    case "concurrent_calls":
      return 4;
    case "not_a_job":
      return 55;
    case "needs_capture":
      return 11;
    case "founder_cert":
      return 88;
    case "needs_qualify":
      return emergency ? 9 : 22;
    case "open_invoice":
      return 12;
    case "open_estimate":
      return 14;
    case "urgent_lead":
      return emergency ? 10 : 20;
    case "needs_booking":
      return emergency ? 11 : 25;
    case "needs_customer_confirm":
      return emergency ? 16 : 28;
    case "missing_baseline":
      return 82;
    case "stale_weekly_proof":
      return 18;
    case "appointment_at_risk":
      return 30;
    case "unassigned_job":
      return emergency ? 35 : 40;
    case "overdue_followup":
      return 50;
    case "new_lead":
      return 60;
    case "available_tech":
      return 90;
  }
}

/**
 * Ranked command-center queue from existing shop data.
 * No invented revenue — impact is operational urgency.
 */
export async function getAttentionQueue(
  businessId: string,
  limit = 12,
): Promise<AttentionItem[]> {
  const now = new Date();
  const followupCutoff = new Date(now.getTime() - FOLLOWUP_HOURS * 60 * 60 * 1000);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const weekAgo = new Date(now.getTime() - WEEK_MS);

  const [
    newLeads,
    activeJobs,
    crew,
    business,
    failedAlerts,
    deliveredAlerts,
    liveCalls,
    weekTraffic,
    failedDepositDeliveries,
  ] = await Promise.all([
      prisma.lead.findMany({
        where: { businessId, status: { in: ["new", "contacted"] } },
        take: 40,
        orderBy: { createdAt: "desc" },
        include: {
          job: { select: { id: true, technicianId: true, status: true, scheduledAt: true } },
        },
      }),
      prisma.job.findMany({
        where: {
          businessId,
          status: { in: ["scheduled", "confirmed", "en_route", "on_site"] },
        },
        take: 60,
        orderBy: { scheduledAt: "asc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          lead: { select: { id: true, name: true, phone: true, urgency: true } },
          technician: { select: { id: true, name: true, phone: true } },
        },
      }),
      listCrew(businessId),
      prisma.business.findUnique({
        where: { id: businessId },
        select: {
          avgTicketCents: true,
          baselineMissedCallsPerWeek: true,
          baselineJobsPerWeek: true,
          lastWeeklyProofAt: true,
          billingStatus: true,
          pilotEndsAt: true,
          createdAt: true,
          overflowForwardConfirmedAt: true,
          lineVerifiedAt: true,
          vapiPhoneNumber: true,
          twilioPhone: true,
          ownerPhone: true,
          ownerSmsOptOutAt: true,
          depositEnabled: true,
          stripeConnectAccountId: true,
          stripeConnectChargesEnabled: true,
          stripeConnectPayoutsEnabled: true,
          stripeConnectDetailsSubmitted: true,
          /* Read to rank: what matters at 2am is not what matters at 2pm. */
          hoursJson: true,
          timezone: true,
        },
      }),
      prisma.ownerNotification.findMany({
        where: { businessId, status: "failed" },
        take: 12,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          leadId: true,
          channel: true,
          error: true,
          createdAt: true,
          message: true,
        },
      }),
      prisma.ownerNotification.findMany({
        where: {
          businessId,
          status: "sent",
          leadId: { not: null },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        take: 40,
        orderBy: { createdAt: "asc" },
        select: {
          leadId: true,
          createdAt: true,
          channel: true,
        },
      }),
      prisma.call.findMany({
        where: { businessId, status: "in-progress" },
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          callerPhone: true,
          createdAt: true,
        },
      }),
      // Whether there is anything to prove this week at all.
      Promise.all([
        prisma.call.count({ where: { businessId, createdAt: { gte: weekAgo } } }),
        prisma.lead.count({ where: { businessId, createdAt: { gte: weekAgo } } }),
      ]).then(([calls, leads]) => calls + leads),
      prisma.webhookEvent.findMany({
        where: { businessId, source: "deposit-sms", status: "failed" },
        take: 12,
        orderBy: { createdAt: "desc" },
        select: { id: true, payloadJson: true, error: true, createdAt: true },
      }),
    ]);

  const failedDepositDeliveryIds = new Set(
    failedDepositDeliveries.flatMap((delivery) => {
      try {
        const payload = JSON.parse(delivery.payloadJson ?? "{}") as {
          depositId?: unknown;
        };
        return typeof payload.depositId === "string" ? [payload.depositId] : [];
      } catch {
        return [];
      }
    }),
  );

  const ticket = business?.avgTicketCents ?? null;

  /*
    Read once and passed down, so every row on a single board is ranked
    against the same moment. Recomputing per row would let a queue built
    across midnight order itself by two different sets of rules.
  */
  const afterHours = isAfterHours(
    now,
    business?.hoursJson ?? "{}",
    business?.timezone ?? undefined,
  );

  /** Earliest delivered alert per lead — silence after this is the failure. */
  const alertedAtByLead = new Map<string, Date>();
  for (const row of deliveredAlerts) {
    if (!row.leadId) continue;
    if (!alertedAtByLead.has(row.leadId)) {
      alertedAtByLead.set(row.leadId, row.createdAt);
    }
  }

  const items: AttentionItem[] = [];

  const status = (business?.billingStatus ?? "none").toLowerCase();
  if (status === "past_due" || status === "canceled") {
    items.push({
      id: `billing_action:${businessId}`,
      kind: "billing_action",
      rank: kindRank("billing_action", null, afterHours),
      impact: "critical",
      title: status === "past_due" ? "Payment failed" : "Subscription canceled",
      detail: "Shop access depends on an active plan.",
      recommendedAction: "Open billing",
      href: "/dashboard/billing",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  } else if (status === "pilot" || status === "none") {
    const ends = business?.pilotEndsAt
      ? new Date(business.pilotEndsAt)
      : business?.createdAt
        ? new Date(new Date(business.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
        : null;
    const daysLeft =
      ends != null
        ? Math.ceil((ends.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null;
    if (daysLeft != null && daysLeft <= 7) {
      items.push({
        id: `billing_action:${businessId}`,
        kind: "billing_action",
        rank: kindRank("billing_action", null, afterHours),
        impact: "critical",
        title:
          daysLeft <= 0
            ? "Your access ended — pay to keep the line live"
            : `Shop access ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — pay with card`,
        detail: "Pay with card so after-hours calls keep becoming qualified jobs.",
        recommendedAction: "Pay with card",
        href: "/dashboard/billing",
        entityType: "shop",
        entityId: businessId,
        createdAt: now.toISOString(),
      });
    }
  }

  if (business && ownerAlertsAreMuted(business)) {
    items.push({
      id: `alerts_muted:${businessId}`,
      kind: "alerts_muted",
      rank: kindRank("alerts_muted", null, afterHours),
      impact: "critical",
      title: "Owner SMS alerts are off",
      detail:
        "This number texted STOP — night leads will not reach you until you text START or update the owner phone.",
      recommendedAction: "Fix alerts",
      href: "/dashboard/settings#owner-alerts",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  }

  if (business && depositMoneyPathBroken(business)) {
    items.push({
      id: `money_path_broken:${businessId}`,
      kind: "money_path_broken",
      rank: kindRank("money_path_broken", null, afterHours),
      impact: "critical",
      title: "Deposits on — cards cannot charge",
      detail:
        "Deposit holds are enabled but Stripe Connect is not cleared to take cards. Finish payouts setup or turn deposits off.",
      recommendedAction: "Open payouts",
      href: "/dashboard/billing#payouts",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  }

  const hasLine = Boolean(
    business?.vapiPhoneNumber?.trim() || business?.twilioPhone?.trim(),
  );
  // Prove before capture — never ask owners to confirm theater first.
  if (hasLine && !business?.lineVerifiedAt) {
    items.push({
      id: `needs_capture:${businessId}`,
      kind: "needs_capture",
      rank: kindRank("needs_capture", null, afterHours),
      impact: "critical",
      title: "Prove your line",
      detail: "Place one test call so we know Orvius answers end-to-end.",
      recommendedAction: "Call your Orvius line",
      href: ownerSetupHref("verify"),
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  } else if (
    hasLine &&
    business?.ownerPhone?.trim() &&
    !business.overflowForwardConfirmedAt
  ) {
    items.push({
      id: `needs_capture:${businessId}`,
      kind: "needs_capture",
      rank: kindRank("needs_capture", null, afterHours),
      impact: "critical",
      title: "Confirm call capture",
      detail: "Forward missed calls to Orvius — or publish the Orvius number.",
      recommendedAction: "Finish capture setup",
      href: ownerSetupHref("capture"),
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  }

  // Founder phone cert stays on Settings /admin — never on the owner Command board.

  const baselineReady =
    ticket != null &&
    ticket > 0 &&
    business?.baselineMissedCallsPerWeek != null &&
    business?.baselineJobsPerWeek != null;
  if (!baselineReady) {
    items.push({
      id: `missing_baseline:${businessId}`,
      kind: "missing_baseline",
      rank: kindRank("missing_baseline", null, afterHours),
      impact: "med",
      title: "Baseline economics missing",
      detail: "Set avg ticket + before-Orvius weekly numbers when you have a minute.",
      recommendedAction: "Set baseline",
      href: "/dashboard/settings#economics-baseline",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  }

  const proofAt = business?.lastWeeklyProofAt
    ? new Date(business.lastWeeklyProofAt)
    : null;
  const proofStale =
    !proofAt ||
    Number.isNaN(proofAt.getTime()) ||
    now.getTime() - proofAt.getTime() > WEEK_MS;
  // A shop with no calls and no leads this week has nothing to prove yet.
  if (proofStale && weekTraffic > 0) {
    items.push({
      id: `stale_weekly_proof:${businessId}`,
      kind: "stale_weekly_proof",
      rank: kindRank("stale_weekly_proof", null, afterHours),
      impact: "high",
      title: "Weekly proof due",
      detail: proofAt
        ? "Last proof is older than 7 days — copy a fresh artifact."
        : "No weekly proof copied yet — measured outcomes, not vanity stats.",
      recommendedAction: "Copy weekly proof",
      href: "/dashboard#shop-economics",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  }

  const openMoney = await Promise.all([
    prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ["sent", "open", "overdue", "draft"] },
      },
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountCents: true,
        status: true,
        jobId: true,
        createdAt: true,
        job: {
          select: {
            lead: { select: { phone: true, name: true } },
            customer: { select: { phone: true, name: true } },
          },
        },
      },
    }),
    prisma.estimate.findMany({
      where: {
        businessId,
        OR: [
          {
            status: { in: ["draft", "sent", "accepted"] },
            invoice: null,
          },
          { status: "payment_failed" },
        ],
      },
      take: 12,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountCents: true,
        status: true,
        jobId: true,
        leadId: true,
        sentAt: true,
        createdAt: true,
        lead: { select: { phone: true, name: true } },
      },
    }),
    prisma.deposit.findMany({
      where: {
        businessId,
        status: { in: ["pending", "failed"] },
      },
      take: 12,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountCents: true,
        status: true,
        sentAt: true,
        paidAt: true,
        jobId: true,
        leadId: true,
        createdAt: true,
        lead: { select: { phone: true, name: true } },
      },
    }),
  ]);

  for (const invoice of openMoney[0]) {
    if (invoice.status === "paid" || invoice.status === "void") continue;
    const phone =
      invoice.job?.customer?.phone ?? invoice.job?.lead?.phone ?? null;
    const who =
      invoice.job?.customer?.name ?? invoice.job?.lead?.name ?? null;
    items.push({
      id: `open_invoice:${invoice.id}`,
      kind: "open_invoice",
      rank: kindRank("open_invoice", null, afterHours),
      impact: "high",
      title: who
        ? `${who} · $${Math.round(invoice.amountCents / 100)}`
        : `Open invoice · $${Math.round(invoice.amountCents / 100)}`,
      detail: `Status ${invoice.status} — collect before the work cools.`,
      recommendedAction: phone ? "Call to collect" : "Review invoice",
      href: invoice.jobId ? `/dashboard/jobs/${invoice.jobId}` : "/dashboard#shop-economics",
      entityType: "shop",
      entityId: businessId,
      createdAt: invoice.createdAt.toISOString(),
      estimatedRevenueCents: invoice.amountCents,
      meta: { phone, status: invoice.status },
    });
  }

  for (const estimate of openMoney[1]) {
    if (
      estimateNeedsOwnerFollowUp({
        status: estimate.status,
        sentAt: estimate.sentAt,
        createdAt: estimate.createdAt,
        now,
        afterHours,
      })
    ) {
      items.push({
        id: `estimate_failed:${estimate.id}`,
        kind: "estimate_failed",
        rank: kindRank("estimate_failed", null, afterHours),
        impact: "critical",
        title: estimate.lead?.name
          ? `${estimate.lead.name} · $${Math.round(estimate.amountCents / 100)}`
          : `Estimate · $${Math.round(estimate.amountCents / 100)}`,
        detail:
          estimate.status === "payment_failed"
            ? "Card checkout failed or expired — call to collect or resend."
            : "Estimate still unpaid — call the customer before the work cools.",
        recommendedAction: "Call to collect",
        href: estimate.jobId
          ? `/dashboard/jobs/${estimate.jobId}`
          : estimate.leadId
            ? `/dashboard/inbox/${estimate.leadId}`
            : "/dashboard#shop-economics",
        entityType: estimate.leadId ? "lead" : "shop",
        entityId: estimate.leadId ?? businessId,
        createdAt: (estimate.sentAt ?? estimate.createdAt).toISOString(),
        estimatedRevenueCents: estimate.amountCents,
        meta: { phone: estimate.lead?.phone ?? null, status: estimate.status },
      });
      continue;
    }
    if (estimate.status === "payment_failed") continue;
    items.push({
      id: `open_estimate:${estimate.id}`,
      kind: "open_estimate",
      rank: kindRank("open_estimate", null, afterHours),
      impact: "med",
      title: estimate.lead?.name
        ? `${estimate.lead.name} · $${Math.round(estimate.amountCents / 100)}`
        : `Open estimate · $${Math.round(estimate.amountCents / 100)}`,
      detail: `Status ${estimate.status} — convert or close before it goes cold.`,
      recommendedAction: estimate.lead?.phone ? "Call to close" : "Review estimate",
      href: estimate.jobId
        ? `/dashboard/jobs/${estimate.jobId}`
        : estimate.leadId
          ? `/dashboard/inbox/${estimate.leadId}`
          : "/dashboard#shop-economics",
      entityType: estimate.leadId ? "lead" : "shop",
      entityId: estimate.leadId ?? businessId,
      createdAt: estimate.createdAt.toISOString(),
      estimatedRevenueCents: estimate.amountCents,
      meta: { phone: estimate.lead?.phone ?? null, status: estimate.status },
    });
  }

  for (const deposit of openMoney[2]) {
    if (failedDepositDeliveryIds.has(deposit.id)) continue;
    if (
      !depositNeedsOwnerFollowUp({
        status: deposit.status,
        sentAt: deposit.sentAt,
        paidAt: deposit.paidAt,
        createdAt: deposit.createdAt,
        now,
        afterHours,
      })
    ) {
      continue;
    }
    const who = deposit.lead?.name ?? "Customer";
    const failed = deposit.status === "failed";
    const unsent = !deposit.sentAt && deposit.status === "pending";
    items.push({
      id: `deposit_failed:${deposit.id}`,
      kind: "deposit_failed",
      rank: kindRank("deposit_failed", null, afterHours),
      impact: "critical",
      title: `${who} · $${Math.round(deposit.amountCents / 100)} deposit`,
      detail: failed
        ? "Card checkout failed or expired — call to collect or resend the pay link."
        : unsent
          ? "Deposit hold never sent — call or text the pay link before the slot softens."
          : "Deposit still unpaid after the hold window — call to collect.",
      recommendedAction: unsent ? "Send pay link" : "Call to collect",
      href: deposit.jobId
        ? `/dashboard/jobs/${deposit.jobId}`
        : deposit.leadId
          ? `/dashboard/inbox/${deposit.leadId}`
          : "/dashboard#shop-economics",
      entityType: deposit.leadId ? "lead" : "shop",
      entityId: deposit.leadId ?? businessId,
      createdAt: (deposit.sentAt ?? deposit.createdAt).toISOString(),
      estimatedRevenueCents: deposit.amountCents,
      meta: {
        phone: deposit.lead?.phone ?? null,
        status: deposit.status,
      },
    });
  }

  for (const alert of failedAlerts) {
    items.push({
      id: `alert_failed:${alert.id}`,
      kind: "alert_failed",
      rank: kindRank("alert_failed", null, afterHours),
      impact: "critical",
      title: "Owner alert failed",
      detail: [
        alert.channel.toUpperCase(),
        alert.error ?? "Delivery exhausted retries",
      ]
        .filter(Boolean)
        .join(" · "),
      recommendedAction: "Send test alert",
      href: alert.leadId
        ? `/dashboard/inbox/${alert.leadId}`
        : "/dashboard/settings#owner-alerts",
      entityType: alert.leadId ? "lead" : "shop",
      entityId: alert.leadId ?? businessId,
      createdAt: alert.createdAt.toISOString(),
    });
  }

  const failedDepositIds = [...failedDepositDeliveryIds];
  const failedDeposits = failedDepositIds.length
    ? await prisma.deposit.findMany({
        where: {
          businessId,
          id: { in: failedDepositIds },
          status: "pending",
          sentAt: null,
        },
        select: {
          id: true,
          amountCents: true,
          leadId: true,
          jobId: true,
          createdAt: true,
        },
      })
    : [];

  for (const deposit of failedDeposits) {
    const failure = failedDepositDeliveries.find((delivery) => {
      try {
        const payload = JSON.parse(delivery.payloadJson ?? "{}") as {
          depositId?: unknown;
        };
        return payload.depositId === deposit.id;
      } catch {
        return false;
      }
    });
    items.push({
      id: `deposit_delivery_failed:${deposit.id}`,
      kind: "deposit_delivery_failed",
      rank: kindRank("deposit_delivery_failed", null, afterHours),
      impact: "critical",
      title: "Deposit link not delivered",
      detail: `${failure?.error ?? "Carrier rejected the text"} · $${(
        deposit.amountCents / 100
      ).toFixed(2)} still pending`,
      recommendedAction: "Retry deposit link",
      href: deposit.jobId
        ? `/dashboard/jobs/${deposit.jobId}`
        : deposit.leadId
          ? `/dashboard/inbox/${deposit.leadId}`
          : "/dashboard",
      entityType: deposit.jobId ? "job" : deposit.leadId ? "lead" : "shop",
      entityId: deposit.jobId ?? deposit.leadId ?? businessId,
      createdAt:
        failure?.createdAt.toISOString() ?? deposit.createdAt.toISOString(),
      estimatedRevenueCents: deposit.amountCents,
    });
  }

  if (liveCalls.length >= 2) {
    const overflowOk = Boolean(business?.overflowForwardConfirmedAt);
    items.push({
      id: `concurrent_calls:${businessId}`,
      kind: "concurrent_calls",
      rank: kindRank("concurrent_calls", null, afterHours),
      impact: concurrentCallsImpact(liveCalls.length, afterHours) ?? "critical",
      title: `${liveCalls.length} calls live`,
      detail: overflowOk
        ? "Line is handling more than one caller — watch the board for every capture."
        : "Line is busy with more than one caller — confirm overflow forward so second callers don’t hit voicemail.",
      recommendedAction: concurrentCallsRecommendedAction(
        liveCalls.length,
        overflowOk,
      ),
      href: overflowOk ? "/dashboard/calls" : "/dashboard/settings#overflow-forward",
      entityType: "shop",
      entityId: businessId,
      createdAt: liveCalls[0]?.createdAt.toISOString() ?? now.toISOString(),
      meta: {
        phone: liveCalls[0]?.callerPhone ?? null,
      },
    });
  } else if (liveCalls.length === 1) {
    items.push({
      id: `concurrent_calls:${liveCalls[0].id}`,
      kind: "concurrent_calls",
      rank: kindRank("concurrent_calls", null, afterHours) + 2,
      impact: concurrentCallsImpact(1, afterHours) ?? "med",
      title: "Call in progress",
      detail: liveCalls[0].callerPhone
        ? `Live now · ${liveCalls[0].callerPhone}`
        : "A caller is on the line right now.",
      recommendedAction: concurrentCallsRecommendedAction(1, true),
      href: `/dashboard/calls/${liveCalls[0].id}`,
      entityType: "shop",
      entityId: businessId,
      createdAt: liveCalls[0].createdAt.toISOString(),
      meta: { phone: liveCalls[0].callerPhone },
    });
  }

  for (const lead of newLeads) {
    const urgent = isPriorityUrgency(lead.urgency);
    const overdue = lead.createdAt < followupCutoff;
    const qualified = isLeadQualifiedForBooking(lead);
    const who = lead.name ?? lead.phone ?? "Unknown caller";
    const ageHrs = Math.max(
      1,
      Math.round((now.getTime() - lead.createdAt.getTime()) / 3_600_000),
    );

    let kind: AttentionKind;
    let detail: string;
    let recommendedAction: string;
    let impact: AttentionImpact;

    if (leadIsNotAJob(lead)) {
      kind = "not_a_job";
      impact = "med";
      detail = [
        "Spam, sales, wrong trade, or out of area — clear it off the board",
        lead.serviceType,
        lead.notes,
      ]
        .filter(Boolean)
        .join(" · ");
      recommendedAction = "Not a job";
    } else if (leadWantsHuman(lead) && lead.phone?.trim()) {
      kind = "wants_human";
      impact = urgent || afterHours ? "critical" : "high";
      detail = [
        "Caller asked for a person — call them back now",
        lead.serviceType,
        lead.notes,
      ]
        .filter(Boolean)
        .join(" · ");
      recommendedAction = "Call them now";
    } else if (leadHasTranscriptDispute(lead) && lead.phone?.trim()) {
      kind = "transcript_dispute";
      impact = urgent || afterHours ? "critical" : "high";
      detail = [
        "Caller disputes what was captured — call to correct",
        lead.serviceType,
        lead.address,
        lead.notes,
      ]
        .filter(Boolean)
        .join(" · ");
      recommendedAction = "Call to correct";
    } else if (leadIsPartialCapture(lead)) {
      kind = "partial_capture";
      impact = urgent || afterHours ? "critical" : "high";
      detail = [
        "Hung up mid-call — call back to finish intake",
        lead.serviceType,
        lead.address,
        lead.notes,
      ]
        .filter(Boolean)
        .join(" · ");
      recommendedAction = "Call back";
    } else if (
      lead.phone?.trim() &&
      isOwnerAlertUnacked({
        alertedAt: alertedAtByLead.get(lead.id) ?? new Date(0),
        firstContactedAt: lead.firstContactedAt,
        now,
        afterHours,
      }) &&
      alertedAtByLead.has(lead.id)
    ) {
      kind = "alert_unacked";
      impact = urgent || afterHours ? "critical" : "high";
      detail = [
        "You were alerted — lead still open. Call them now.",
        lead.serviceType,
        lead.address,
      ]
        .filter(Boolean)
        .join(" · ");
      recommendedAction = "Call now";
    } else if (!qualified) {
      kind = "needs_qualify";
      impact = urgent ? "critical" : "high";
      detail = [
        "Needs phone + service/address before booking",
        lead.serviceType,
        lead.address,
      ]
        .filter(Boolean)
        .join(" · ");
      recommendedAction = "Qualify lead";
    } else if (!lead.job) {
      if (urgent) {
        kind = "urgent_lead";
        impact = "critical";
        detail = ["Emergency / same-day — not booked yet", lead.serviceType, lead.address]
          .filter(Boolean)
          .join(" · ");
        recommendedAction = "Call back & book";
      } else if (/\[capacity-followup-sms\]/i.test(lead.notes ?? "")) {
        kind = "needs_booking";
        impact = "high";
        detail = [
          "No open window — customer told shop will call",
          lead.serviceType,
          lead.address,
        ]
          .filter(Boolean)
          .join(" · ");
        recommendedAction = "Call to schedule";
      } else if (overdue) {
        kind = "overdue_followup";
        impact = "high";
        detail = [`Qualified · unworked ${ageHrs}h`, lead.serviceType, lead.address]
          .filter(Boolean)
          .join(" · ");
        recommendedAction = "Book job";
      } else {
        kind = "needs_booking";
        impact = "high";
        detail = ["Qualified — waiting to book", lead.serviceType, lead.address]
          .filter(Boolean)
          .join(" · ");
        recommendedAction = "Book job";
      }
    } else {
      kind = overdue ? "overdue_followup" : "new_lead";
      impact = overdue ? "high" : "med";
      detail = [
        overdue ? `Unworked ${ageHrs}h` : "New lead",
        lead.serviceType,
        lead.address,
      ]
        .filter(Boolean)
        .join(" · ");
      recommendedAction = "Open lead";
    }

    items.push({
      id: `${kind}:${lead.id}`,
      kind,
      rank: kindRank(kind, lead.urgency, afterHours) + Math.min(ageHrs, 20),
      impact,
      title: who,
      detail,
      recommendedAction,
      href: `/dashboard/inbox/${lead.id}`,
      entityType: "lead",
      entityId: lead.id,
      createdAt: lead.createdAt.toISOString(),
      estimatedRevenueCents: ticket,
      group: {
        key: lead.customerId ?? `lead:${lead.id}`,
        label: who,
        href: lead.customerId
          ? `/dashboard/customers/${lead.customerId}`
          : `/dashboard/inbox/${lead.id}`,
      },
      meta: {
        urgency: lead.urgency,
        address: lead.address,
        phone: lead.phone,
        scheduledAt: lead.job?.scheduledAt?.toISOString() ?? null,
      },
    });
  }

  for (const job of activeJobs) {
    const who =
      job.customer?.name ??
      job.lead?.name ??
      job.customer?.phone ??
      job.title;
    const urgency = job.urgency ?? job.lead?.urgency;
    const scheduled = job.scheduledAt;
    const pastDue =
      scheduled != null &&
      scheduled < now &&
      (job.status === "scheduled" || job.status === "confirmed");
    const dueToday =
      scheduled != null && scheduled >= dayStart && scheduled < dayEnd;
    const unassigned = !job.technicianId;
    const group = {
      key: job.customer?.id ?? job.lead?.id ?? `job:${job.id}`,
      label: who,
      href: job.customer?.id
        ? `/dashboard/customers/${job.customer.id}`
        : `/dashboard/jobs/${job.id}`,
    };

    if (
      !job.customerConfirmedAt &&
      (job.status === "scheduled" || job.status === "confirmed") &&
      job.scheduledAt
    ) {
      const rescheduleRequested = /Customer requested reschedule/i.test(
        job.notes ?? "",
      );
      items.push({
        id: `needs_customer_confirm:${job.id}`,
        kind: "needs_customer_confirm",
        rank: kindRank("needs_customer_confirm", urgency, afterHours) + (dueToday ? 0 : 4),
        impact: isPriorityUrgency(urgency) || dueToday ? "critical" : "high",
        title: who,
        detail: [
          rescheduleRequested
            ? "Customer asked for a different window"
            : "Awaiting customer confirm",
          job.title,
          scheduled
            ? scheduled.toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        recommendedAction: rescheduleRequested ? "Call to reschedule" : "Text confirm",
        href: `/dashboard/jobs/${job.id}`,
        entityType: "job",
        entityId: job.id,
        createdAt: job.createdAt.toISOString(),
        estimatedRevenueCents: ticket,
        group,
        meta: {
          urgency,
          address: job.address,
          phone: job.customer?.phone ?? job.lead?.phone,
          scheduledAt: scheduled?.toISOString() ?? null,
          status: job.status,
        },
      });
    }

    if (unassigned) {
      items.push({
        id: `unassigned_job:${job.id}`,
        kind: "unassigned_job",
        rank: kindRank("unassigned_job", urgency, afterHours) + (dueToday ? 0 : 5),
        impact: isPriorityUrgency(urgency) || dueToday ? "critical" : "high",
        title: who,
        detail: [
          "Needs a tech",
          job.title,
          scheduled
            ? scheduled.toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        recommendedAction: "Assign technician",
        href: `/dashboard/jobs/${job.id}`,
        entityType: "job",
        entityId: job.id,
        createdAt: job.createdAt.toISOString(),
        estimatedRevenueCents: ticket,
        group,
        meta: {
          urgency,
          address: job.address,
          phone: job.customer?.phone ?? job.lead?.phone,
          scheduledAt: scheduled?.toISOString() ?? null,
        },
      });
    } else if (
      jobIsCustomerNoShow({
        scheduledAt: job.scheduledAt,
        status: job.status,
        customerConfirmedAt: job.customerConfirmedAt,
        onSiteAt: job.onSiteAt,
        completedAt: job.completedAt,
        now,
      })
    ) {
      items.push({
        id: `customer_no_show:${job.id}`,
        kind: "customer_no_show",
        rank: kindRank("customer_no_show", urgency, afterHours),
        impact: "critical",
        title: who,
        detail: [
          "Customer no-show — call to reschedule",
          job.title,
          job.technician?.name ? `Tech: ${job.technician.name}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        recommendedAction: "Call customer",
        href: `/dashboard/jobs/${job.id}`,
        entityType: "job",
        entityId: job.id,
        createdAt: job.createdAt.toISOString(),
        estimatedRevenueCents: ticket,
        group,
        meta: {
          urgency,
          address: job.address,
          phone: job.customer?.phone ?? job.lead?.phone,
          scheduledAt: scheduled?.toISOString() ?? null,
          status: job.status,
        },
      });
    } else if (
      jobIsTechNoShow({
        scheduledAt: job.scheduledAt,
        status: job.status,
        technicianId: job.technicianId,
        customerConfirmedAt: job.customerConfirmedAt,
        dispatchedAt: job.dispatchedAt,
        onSiteAt: job.onSiteAt,
        completedAt: job.completedAt,
        now,
      })
    ) {
      items.push({
        id: `tech_no_show:${job.id}`,
        kind: "tech_no_show",
        rank: kindRank("tech_no_show", urgency, afterHours),
        impact: "critical",
        title: job.technician?.name ?? who,
        detail: [
          "Tech late / never rolled — call them",
          job.title,
          who !== job.technician?.name ? who : null,
        ]
          .filter(Boolean)
          .join(" · "),
        recommendedAction: "Call tech",
        href: `/dashboard/jobs/${job.id}`,
        entityType: "job",
        entityId: job.id,
        createdAt: job.createdAt.toISOString(),
        estimatedRevenueCents: ticket,
        group,
        meta: {
          urgency,
          address: job.address,
          phone: job.technician?.phone ?? job.customer?.phone ?? job.lead?.phone,
          scheduledAt: scheduled?.toISOString() ?? null,
          status: job.status,
        },
      });
    } else if (pastDue) {
      items.push({
        id: `appointment_at_risk:${job.id}`,
        kind: "appointment_at_risk",
        rank: kindRank("appointment_at_risk", urgency, afterHours),
        impact: "critical",
        title: who,
        detail: [
          "Appointment past due",
          job.technician?.name ? `Tech: ${job.technician.name}` : null,
          job.status.replace(/_/g, " "),
        ]
          .filter(Boolean)
          .join(" · "),
        recommendedAction: "Update status",
        href: `/dashboard/jobs/${job.id}`,
        entityType: "job",
        entityId: job.id,
        createdAt: job.createdAt.toISOString(),
        estimatedRevenueCents: ticket,
        group,
        meta: {
          urgency,
          address: job.address,
          phone: job.customer?.phone ?? job.lead?.phone,
          scheduledAt: scheduled?.toISOString() ?? null,
          status: job.status,
        },
      });
    }
  }

  const busyTechIds = new Set(
    activeJobs
      .filter((j) => j.technicianId && j.status !== "completed")
      .map((j) => j.technicianId as string),
  );

  for (const tech of crew) {
    if (!tech.isActive) continue;
    if (!tech.phone?.trim()) {
      items.push({
        id: `tech_needs_phone:${tech.id}`,
        kind: "tech_needs_phone",
        rank: kindRank("tech_needs_phone", null, afterHours),
        impact: "med",
        title: tech.name,
        detail: "No mobile on file — SMS assign and field links will not reach them.",
        recommendedAction: "Add phone",
        href: "/dashboard/dispatch",
        entityType: "technician",
        entityId: tech.id,
        createdAt: now.toISOString(),
      });
      continue;
    }
    if (busyTechIds.has(tech.id)) continue;
    items.push({
      id: `available_tech:${tech.id}`,
      kind: "available_tech",
      rank: kindRank("available_tech", null, afterHours),
      impact: "med",
      title: tech.name,
      detail: `Available · ${tech.phone}`,
      recommendedAction: "Open dispatch",
      href: "/dashboard/dispatch",
      entityType: "technician",
      entityId: tech.id,
      createdAt: now.toISOString(),
      meta: { phone: tech.phone },
    });
  }

  // Suppress "crew free" noise when unassigned jobs already need those techs
  const hasUnassigned = items.some((i) => i.kind === "unassigned_job");
  const filtered = hasUnassigned
    ? items.filter((i) => i.kind !== "available_tech")
    : items;

  return rollUpByPerson(filtered.sort((a, b) => a.rank - b.rank)).slice(0, limit);
}

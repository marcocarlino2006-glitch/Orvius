import type { Business } from "@prisma/client";
import { formatShopTime } from "@/lib/availability";
import { openWindows, windowLabel } from "@/lib/copilot-propose";
import { classifyRequest } from "@/lib/trade-playbooks";
import { formatCentsExact } from "@/lib/money";
import { normalizePhone } from "@/lib/customer";
import { collectedCents, moneyTotals } from "@/lib/payment-math";
import { isSimulatedWorkspace } from "@/lib/sms-simulation";
import { getConnectStatus } from "@/lib/stripe-connect";
import { recommendTechnician } from "@/lib/technician-match";
import { textingHeld } from "@/lib/twilio-sms";
import { prisma } from "@/lib/prisma";

/*
  Where one customer request stands, from the call to the money, read from
  the records each stage already writes: the request, the job, the texts in
  the intent ledger, the invoice and its payments, open reconciliation
  exceptions and open plans. Nothing here is stored. A stage is "done" only
  when its own record says so; a text that left but has no receipt is
  "unknown", not delivered; a bill that exists is not a bill that was sent,
  and a sent bill is not a paid one.
*/

export const OUTCOME_STAGES = ["booking", "assignment", "confirmation", "completion", "invoice", "payment"] as const;
export type OutcomeStageId = (typeof OUTCOME_STAGES)[number];

/**
 * done: its record says so. waiting: someone else's move. needs_you: a person
 * at the shop decides. blocked: a setting or missing fact stops it. failed: it
 * was tried and didn't happen. unknown: it was tried and the result isn't
 * known. not_yet: an earlier stage comes first. not_needed: this work skips it.
 */
export type StageState = "done" | "waiting" | "needs_you" | "blocked" | "failed" | "unknown" | "not_yet" | "not_needed";
export type NextActor = "orvius" | "you" | "teammate" | "technician" | "customer" | "provider";
/** What the outside system said: a carrier, Stripe. Null when nothing external was asked. */
export type Execution = "confirmed" | "failed" | "unknown" | null;

export type OutcomeOption =
  | { kind: "assign_tech"; label: string; jobId: string; technicianId: string; note: string }
  | { kind: "reschedule"; label: string; jobId: string; at: string; note: string }
  | { kind: "link"; label: string; href: string; note: string };

export type OutcomeStage = {
  stage: OutcomeStageId;
  label: string;
  state: StageState;
  /** What the record shows, in words. */
  evidence: string;
  nextActor: NextActor | null;
  nextAction: string | null;
  blocker: string | null;
  /** Where the blocker is fixed. */
  setupHref: string | null;
  execution: Execution;
  at: string | null;
  /** Which record this stage was read from. */
  source: string;
};

export type Outcome = {
  businessId: string;
  businessName: string;
  leadId: string | null;
  jobId: string | null;
  title: string;
  customer: string | null;
  headline: string;
  stages: OutcomeStage[];
  /** The first stage that isn't done, and the decision it needs if a person makes it. */
  next: { stage: OutcomeStageId; actor: NextActor | null; action: string | null; options: OutcomeOption[] } | null;
  /** The job's state and its money, kept apart: the agreed total, the bill, and what was actually collected. */
  job: { status: string; scheduledAt: string | null } | null;
  /** `totalCents` is the work before tax and deposit, which is what the invoice route bills from; `billedCents` is what the customer owes. */
  /** `collectedCents` is what counts toward the bill; `refundedCents` went back out and `keptCents` is what the shop holds. */
  money: { totalCents: number | null; billedCents: number | null; collectedCents: number; refundedCents: number; keptCents: number };
  /** Demo and test shops: nothing here reached a real customer or provider. */
  synthetic: boolean;
  updatedAt: string;
};

const LABEL: Record<OutcomeStageId, string> = {
  booking: "Booked",
  assignment: "Technician",
  confirmation: "Customer confirmed",
  completion: "Work done",
  invoice: "Bill sent",
  payment: "Paid",
};

const FAILED_TEXT = new Set(["undelivered", "rejected", "retry_exhausted"]);
const SETTINGS_TEXTING = "/dashboard/settings?settings=integrations";
/* A booking's confirmation text goes out just after the booking answers; past this it is not "queued" any more. */
const CONFIRM_QUEUE_MS = 2 * 60_000;

type Intent = { status: string; updatedAt: Date; messageVersion: number; lastError: string | null; providerAccount: string | null };

/** What the text ledger says about the latest send of one event. */
function textExecution(intent: Intent | null): { execution: Execution; words: string } {
  if (!intent) return { execution: null, words: "" };
  if (intent.status === "delivered") return { execution: "confirmed", words: "delivered" };
  if (FAILED_TEXT.has(intent.status)) return { execution: "failed", words: intent.status === "undelivered" ? "didn't reach the phone" : "was refused" };
  if (intent.status === "unknown_submission") return { execution: "unknown", words: "may or may not have gone out — Orvius won't resend it on its own" };
  if (intent.status === "submitted") {
    return intent.providerAccount === "simulated"
      ? { execution: "confirmed", words: "sent (simulated)" }
      : { execution: "unknown", words: "sent; no delivery receipt yet" };
  }
  return { execution: "unknown", words: "being sent" };
}

const stage = (id: OutcomeStageId, s: Omit<OutcomeStage, "stage" | "label" | "setupHref" | "blocker" | "execution"> & Partial<Pick<OutcomeStage, "setupHref" | "blocker" | "execution">>): OutcomeStage => ({
  stage: id,
  label: LABEL[id],
  blocker: null,
  setupHref: null,
  execution: null,
  ...s,
});

/** "Booked; assignment needed" — the furthest stage reached, then what the next one is waiting on. */
export function outcomeHeadline(stages: OutcomeStage[]): string {
  const by = new Map(stages.map((s) => [s.stage, s]));
  const booking = by.get("booking")!;
  if (booking.state !== "done") {
    if (booking.state === "not_needed") return booking.evidence;
    return booking.state === "blocked" ? `Not booked; ${booking.blocker ?? "blocked"}` : "Not booked yet";
  }
  const reached = (id: OutcomeStageId) => by.get(id)?.state === "done" || by.get(id)?.state === "not_needed";
  const lead =
    by.get("payment")!.state === "done"
      ? "Paid"
      : by.get("invoice")!.state === "done"
        ? /\bdelivered\b/.test(by.get("invoice")!.evidence)
          ? "Bill delivered"
          : "Bill sent"
        : reached("completion")
          ? "Completed"
          : reached("confirmation")
            ? "Confirmed"
            : reached("assignment")
              ? "Assigned"
              : "Booked";
  const pending = stages.find((s) => s.state !== "done" && s.state !== "not_needed" && s.state !== "not_yet");
  if (!pending) return lead === "Paid" ? "Paid in full" : lead;
  const what: Record<OutcomeStageId, string> = {
    booking: "booking",
    assignment: "assignment",
    confirmation: "customer confirmation",
    completion: "completion",
    invoice: "invoice delivery",
    payment: "payment",
  };
  const state =
    pending.state === "failed"
      ? "failed"
      : pending.state === "unknown"
        ? "unconfirmed"
        : pending.state === "blocked"
          ? "blocked"
          : pending.state === "needs_you"
            ? "needed"
            : "pending";
  return `${lead}; ${what[pending.stage]} ${state}`;
}

type Shop = Pick<Business, "id" | "name" | "timezone" | "hoursJson" | "servicesJson" | "trade" | "jobLengthsJson">;
type JobForOptions = { id: string; scheduledAt: Date | null; durationMin: number | null; serviceType: string | null; notes: string | null; urgency: string | null };

/**
 * Decisions that can finish an assignment Orvius couldn't make: someone free
 * then who isn't listed for the skill (the owner knows their crew), or a
 * nearby time when a qualified technician is free.
 */
export async function assignmentOptions(shop: Shop, job: JobForOptions): Promise<{ blocked: string | null; options: OutcomeOption[] }> {
  if (!job.scheduledAt) return { blocked: "No time set", options: [] };
  const skill = classifyRequest({ business: shop, serviceType: job.serviceType, notes: job.notes, urgency: null }).service.skill;
  const base = { businessId: shop.id, durationMin: job.durationMin, excludeJobId: job.id, timezone: shop.timezone };
  const [qualified, anyone] = await Promise.all([
    recommendTechnician({ ...base, scheduledAt: job.scheduledAt, skill }),
    recommendTechnician({ ...base, scheduledAt: job.scheduledAt, skill: null }),
  ]);
  const options: OutcomeOption[] = [];
  if (qualified.pick) {
    options.push({ kind: "assign_tech", label: `Assign ${qualified.pick.name}`, jobId: job.id, technicianId: qualified.pick.technicianId, note: qualified.pick.reason });
    return { blocked: null, options };
  }
  const freeUnlisted = anyone.considered.filter((c) => c.fit === "available" || c.fit === "picked");
  for (const c of freeUnlisted.slice(0, 2)) {
    options.push({ kind: "assign_tech", label: `Assign ${c.name}`, jobId: job.id, technicianId: c.id, note: `free then, but not listed for ${skill.replace(/_/g, " ")} work` });
  }
  const windows = await openWindows(shop, { kind: "job", job }, 8);
  for (const at of windows) {
    if (options.filter((o) => o.kind === "reschedule").length >= 2) break;
    if (at.getTime() === job.scheduledAt.getTime()) continue;
    const then = await recommendTechnician({ ...base, scheduledAt: at, skill });
    if (!then.pick) continue;
    options.push({ kind: "reschedule", label: `Move to ${windowLabel(at, shop.timezone)}`, jobId: job.id, at: at.toISOString(), note: `${then.pick.name} is free then (${then.pick.reason})` });
  }
  options.push({ kind: "link", label: "Add or edit technicians", href: "/dashboard/team", note: "a new technician or skill counts at once" });
  return { blocked: qualified.blocked, options };
}

/** The outcome of one request or job. Null when it isn't this shop's. */
export async function buildOutcome(businessId: string, target: { jobId?: string | null; leadId?: string | null }, now = new Date()): Promise<Outcome | null> {
  const job = target.jobId
    ? await prisma.job.findFirst({ where: { id: target.jobId, businessId }, include: outcomeJobInclude })
    : target.leadId
      ? await prisma.job.findFirst({ where: { leadId: target.leadId, businessId }, include: outcomeJobInclude })
      : null;
  if (target.jobId && !job) return null;
  const leadId = job?.leadId ?? target.leadId ?? null;
  const [shop, lead] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    leadId ? prisma.lead.findFirst({ where: { id: leadId, businessId } }) : null,
  ]);
  if (!job && !lead) return null;
  const tz = shop.timezone ?? "America/New_York";
  const when = (d: Date) => formatShopTime(d, tz);
  const who = job?.customer?.name ?? lead?.name ?? "the customer";
  const phone = job?.customer?.phone ?? lead?.phone ?? null;
  const to = phone ? (normalizePhone(phone) ?? phone) : null;
  const [simulated, held, proposal] = await Promise.all([
    isSimulatedWorkspace(businessId),
    textingHeld(businessId),
    prisma.copilotAction.findFirst({
      where: {
        businessId,
        status: "proposed",
        OR: [...(job ? [{ paramsJson: { contains: job.id } }] : []), ...(leadId ? [{ paramsJson: { contains: leadId } }] : [])],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, preview: true },
    }),
  ]);
  const invoice = job?.invoices[0] ?? null;
  const [confirmIntent, invoiceIntent, mismatches] = await Promise.all([
    job && to && job.scheduledAt
      ? prisma.smsIntent.findFirst({
          where: { businessId, eventType: "job.confirm_request", eventId: `${job.id}@${job.scheduledAt.toISOString()}`, recipientNormalized: to },
          orderBy: { messageVersion: "desc" },
        })
      : null,
    invoice
      ? prisma.smsIntent.findFirst({ where: { businessId, eventType: "invoice.pay_link", eventId: invoice.id }, orderBy: [{ createdAt: "desc" }, { messageVersion: "desc" }] })
      : null,
    prisma.reconciliationException.findMany({
      where: {
        businessId,
        status: "open",
        OR: [...(job ? [{ entityType: "job", entityId: job.id }] : []), ...(invoice ? [{ entityType: "invoice", entityId: invoice.id }] : [])],
      },
      select: { id: true, kind: true, system: true, entityType: true },
    }),
  ]);

  const stages: OutcomeStage[] = [];
  const cancelled = job?.status === "cancelled";

  /* Booking */
  if (job) {
    stages.push(
      stage("booking", {
        state: cancelled ? "not_needed" : "done",
        evidence: cancelled ? "Cancelled" : job.scheduledAt ? `Booked for ${when(job.scheduledAt)}` : "Job created; no time set",
        nextActor: null,
        nextAction: null,
        at: job.createdAt.toISOString(),
        source: "Job",
        execution: null,
      }),
    );
  } else if (lead) {
    const closed = lead.status === "spam" || lead.status === "lost";
    stages.push(
      stage("booking", {
        state: closed ? "not_needed" : proposal ? "needs_you" : !lead.address?.trim() ? "blocked" : "needs_you",
        evidence: closed ? `Closed as ${lead.status}` : proposal ? "A booking plan is waiting for approval" : "Request taken; no job yet",
        nextActor: closed ? null : "you",
        nextAction: closed ? null : proposal ? "Approve or change the plan" : !lead.address?.trim() ? `Get ${who}'s service address` : `Book ${who}`,
        blocker: !closed && !proposal && !lead.address?.trim() ? "no service address yet" : null,
        at: lead.updatedAt.toISOString(),
        source: "Lead",
      }),
    );
  }

  /* Assignment */
  let options: OutcomeOption[] = [];
  if (!job || cancelled) {
    stages.push(stage("assignment", { state: cancelled ? "not_needed" : "not_yet", evidence: "", nextActor: null, nextAction: null, at: null, source: "Job" }));
  } else if (job.technician) {
    const accepted = Boolean(job.techAcceptedAt);
    const name = job.technician.name;
    /* Same rule as the job steps: a job text Twilio hasn't taken a couple of minutes after assigning did not go out. */
    const started = Boolean(job.dispatchedAt || job.onSiteAt || job.completedAt) || ["en_route", "on_site", "completed"].includes(job.status);
    const untold = !accepted && !started && !job.techNotifiedAt && job.techAssignedAt != null && now.getTime() - job.techAssignedAt.getTime() > 2 * 60_000;
    const noNumber = !job.technician.phone?.trim();
    stages.push(
      stage("assignment", {
        state: "done",
        evidence: `${name} assigned${accepted ? " and accepted" : job.techNotifiedAt ? "; job text sent, not accepted yet" : untold ? "; the job text didn't go out" : ""}`,
        nextActor: accepted ? null : untold ? "you" : "technician",
        nextAction: accepted ? null : untold ? (noNumber ? `Add ${name}'s mobile number in Team, or call them` : `Call ${name}; the job text didn't go out`) : `${name} accepts in the tech app`,
        at: (job.techAcceptedAt ?? job.techAssignedAt ?? job.updatedAt).toISOString(),
        source: "Job.technician",
      }),
    );
  } else {
    const found = job.status === "completed" ? { blocked: null, options: [] } : await assignmentOptions(shop, job);
    options = found.options;
    stages.push(
      stage("assignment", {
        state: job.status === "completed" ? "not_needed" : "needs_you",
        evidence: job.techDeclinedBy ? `${job.techDeclinedBy} can't take it` : "Nobody assigned",
        nextActor: "you",
        nextAction: "Pick who goes",
        blocker: found.blocked,
        setupHref: found.blocked ? "/dashboard/team" : null,
        at: job.updatedAt.toISOString(),
        source: "Job.technician · technician calendars",
      }),
    );
  }

  /* Customer confirmation */
  if (!job || cancelled) {
    stages.push(stage("confirmation", { state: cancelled ? "not_needed" : "not_yet", evidence: "", nextActor: null, nextAction: null, at: null, source: "Job" }));
  } else if (job.customerConfirmedAt || job.status === "confirmed") {
    stages.push(stage("confirmation", { state: "done", evidence: `${who} confirmed the time`, nextActor: null, nextAction: null, at: (job.customerConfirmedAt ?? job.updatedAt).toISOString(), source: "Job.customerConfirmedAt", execution: "confirmed" }));
  } else if (["en_route", "on_site", "completed"].includes(job.status)) {
    stages.push(stage("confirmation", { state: "not_needed", evidence: "The visit went ahead without a text confirmation", nextActor: null, nextAction: null, at: null, source: "Job.status" }));
  } else {
    const text = textExecution(confirmIntent);
    const failed = Boolean(job.customerConfirmFailedAt) || text.execution === "failed";
    stages.push(
      stage("confirmation", failed
        ? { state: "failed", evidence: `The confirmation text ${text.words || "didn't go through"}`, nextActor: "you", nextAction: `Call ${who} to confirm`, at: (job.customerConfirmFailedAt ?? confirmIntent?.updatedAt ?? job.updatedAt).toISOString(), source: "SmsIntent job.confirm_request", execution: "failed" }
        : job.customerConfirmSentAt
          ? { state: text.execution === "unknown" ? "unknown" : "waiting", evidence: `Confirmation text ${text.words || "sent"}; ${who} hasn't confirmed`, nextActor: "customer", nextAction: `${who} taps the confirm link`, at: job.customerConfirmSentAt.toISOString(), source: "SmsIntent job.confirm_request", execution: text.execution ?? "unknown" }
          : !phone
            ? { state: "blocked", evidence: "No phone on file", nextActor: "you", nextAction: `Call ${who} to confirm`, blocker: "no customer phone", at: job.updatedAt.toISOString(), source: "Job.customer" }
            : held
              ? { state: "blocked", evidence: "No confirmation text was sent", nextActor: "you", nextAction: `Call ${who} to confirm`, blocker: `Texting isn't ready: ${held.detail}`, setupHref: SETTINGS_TEXTING, at: job.updatedAt.toISOString(), source: "texting eligibility" }
              : !confirmIntent && now.getTime() - job.createdAt.getTime() < CONFIRM_QUEUE_MS
                ? { state: "waiting", evidence: "Confirmation text queued", nextActor: "orvius", nextAction: `Text ${who} the window with a confirm link`, at: job.createdAt.toISOString(), source: "Job · SmsIntent job.confirm_request", execution: null }
              : text.execution === "unknown"
                ? { state: "unknown", evidence: `The confirmation text ${text.words}`, nextActor: "you", nextAction: `Check with ${who} before resending`, at: (confirmIntent?.updatedAt ?? job.updatedAt).toISOString(), source: "SmsIntent job.confirm_request", execution: "unknown" }
                : { state: "needs_you", evidence: "No confirmation text was sent", nextActor: "you", nextAction: `Confirm the time with ${who}`, at: job.updatedAt.toISOString(), source: "Job.customerConfirmSentAt" }),
    );
  }

  /* Completion: only a person records it, with what happened. */
  if (!job || cancelled) {
    stages.push(stage("completion", { state: cancelled ? "not_needed" : "not_yet", evidence: "", nextActor: null, nextAction: null, at: null, source: "Job" }));
  } else if (job.status === "completed") {
    const amount = job.finalAmountCents != null ? (job.finalAmountCents === 0 ? " · no charge" : ` · ${formatCentsExact(job.finalAmountCents)}`) : "";
    stages.push(
      stage("completion", {
        state: "done",
        evidence: `Marked done${job.resolutionCode ? ` (${job.resolutionCode.replace(/_/g, " ")})` : ""}${amount}`,
        nextActor: null,
        nextAction: null,
        at: (job.completedAt ?? job.updatedAt).toISOString(),
        source: "Job.completedAt · resolution",
      }),
    );
  } else {
    const field = job.status === "on_site" || job.status === "en_route";
    stages.push(
      stage("completion", {
        state: field ? "waiting" : "not_yet",
        evidence: job.status === "on_site" ? "Technician on site" : job.status === "en_route" ? "Technician on the way" : "",
        nextActor: field ? "technician" : null,
        nextAction: field ? "Mark it done with what happened and the final amount" : null,
        at: field ? job.updatedAt.toISOString() : null,
        source: "Job.status",
      }),
    );
  }

  /* Invoice: created, sent and delivered are three different facts. */
  const completed = job?.status === "completed";
  const connect = getConnectStatus(shop);
  const nothingOwed = invoice != null && invoice.amountCents <= 0;
  if (!job || !completed) {
    stages.push(stage("invoice", { state: cancelled ? "not_needed" : "not_yet", evidence: "", nextActor: null, nextAction: null, at: null, source: "Invoice" }));
  } else if (!invoice) {
    const noCharge = job.finalAmountCents != null && job.finalAmountCents <= 0;
    const amount = noCharge ? null : job.finalAmountCents ?? (job.estimate?.status === "accepted" ? job.estimate.amountCents : null);
    const billingNote = job.billing?.lastError ? ` Last attempt failed: ${job.billing.lastError}` : job.billing?.status === "pending" ? " Invoice creation is in progress." : "";
    stages.push(
      stage("invoice", noCharge
        ? { state: "not_needed", evidence: job.finalAmountCents === 0 ? "No charge" : "Nothing owed", nextActor: null, nextAction: null, at: null, source: "Job.finalAmountCents" }
        : amount && amount > 0
          ? { state: "failed", evidence: `Done with a ${formatCentsExact(amount)} total, but no bill was created.${billingNote}`, nextActor: "you", nextAction: "Open the bill", at: (job.completedAt ?? job.updatedAt).toISOString(), source: "Job.finalAmountCents · no Invoice", execution: "failed" }
          : { state: "blocked", evidence: "Done without a final amount", nextActor: "you", nextAction: "Add the final amount", blocker: "no final amount", at: (job.completedAt ?? job.updatedAt).toISOString(), source: "Job.finalAmountCents" }),
    );
  } else {
    const paid = invoice.status === "paid" || Boolean(invoice.paidAt);
    const text = textExecution(invoiceIntent);
    const created = `${formatCentsExact(invoice.amountCents)} bill created ${when(invoice.createdAt)}`;
    stages.push(
      stage("invoice", paid
        ? { state: "done", evidence: `${created}; paid`, nextActor: null, nextAction: null, at: (invoice.paidAt ?? invoice.updatedAt).toISOString(), source: "Invoice", execution: "confirmed" }
        : nothingOwed
          ? { state: "not_needed", evidence: "The deposit covered the bill; nothing is owed", nextActor: null, nextAction: null, at: invoice.updatedAt.toISOString(), source: "Invoice.amountCents" }
        : text.execution === "failed"
          ? { state: "failed", evidence: `${created}; the pay-link text ${text.words}`, nextActor: "you", nextAction: `Call ${who}, or fix the number and resend the bill`, at: (invoiceIntent?.updatedAt ?? invoice.updatedAt).toISOString(), source: "SmsIntent invoice.pay_link", execution: "failed" }
          : invoice.sentAt
            ? { state: text.execution === "confirmed" ? "done" : "unknown", evidence: `${created}; texted ${when(invoice.sentAt)}, ${text.words || "no delivery receipt yet"}`, nextActor: text.execution === "confirmed" ? null : "provider", nextAction: text.execution === "confirmed" ? null : "Waiting on the carrier's delivery receipt", at: invoice.sentAt.toISOString(), source: "Invoice.sentAt · SmsIntent invoice.pay_link", execution: text.execution ?? "unknown" }
            : text.execution === "unknown"
              ? { state: "unknown", evidence: `${created}; the pay-link text ${text.words}`, nextActor: "you", nextAction: `Check with ${who} before resending`, at: (invoiceIntent?.updatedAt ?? invoice.updatedAt).toISOString(), source: "SmsIntent invoice.pay_link", execution: "unknown" }
              : !phone
                ? { state: "blocked", evidence: `${created}; not sent`, nextActor: "you", nextAction: "Add the customer's phone or hand them the bill", blocker: "no customer phone", at: invoice.updatedAt.toISOString(), source: "Invoice" }
                : !connect.canAcceptPayments
                  ? { state: "blocked", evidence: `${created}; not sent`, nextActor: "you", nextAction: "Collect in person, or finish card payments", blocker: "card payments aren't set up, so there's no pay link to send", setupHref: SETTINGS_TEXTING, at: invoice.updatedAt.toISOString(), source: "Invoice · Stripe account" }
                  : held
                    ? { state: "blocked", evidence: `${created}; not sent`, nextActor: "you", nextAction: `Give ${who} the bill another way`, blocker: `Texting isn't ready: ${held.detail}`, setupHref: SETTINGS_TEXTING, at: invoice.updatedAt.toISOString(), source: "Invoice · texting eligibility" }
                    : { state: "needs_you", evidence: `${created}; not sent`, nextActor: "you", nextAction: "Send the bill", at: invoice.updatedAt.toISOString(), source: "Invoice" }),
    );
  }

  /* Payment: money in is what Stripe or a person recorded, never a guess. */
  if (!invoice) {
    stages.push(stage("payment", { state: completed && job?.finalAmountCents === 0 ? "not_needed" : "not_yet", evidence: "", nextActor: null, nextAction: null, at: null, source: "Payment" }));
  } else {
    const collected = collectedCents(invoice.payments);
    const totals = moneyTotals(invoice.payments);
    const refundNote = totals.refundedCents > 0 ? `; ${formatCentsExact(totals.refundedCents)} refunded, ${formatCentsExact(totals.netCents)} kept` : "";
    const claimed = invoice.payments.some((p) => p.status === "claimed");
    const refunded = invoice.status === "refunded";
    const paid = invoice.status === "paid" || Boolean(invoice.paidAt);
    stages.push(
      stage("payment", paid
        ? { state: "done", evidence: `${formatCentsExact(collected || invoice.amountCents)} collected${refundNote}`, nextActor: null, nextAction: null, at: (invoice.paidAt ?? invoice.updatedAt).toISOString(), source: "Payment", execution: "confirmed" }
        : nothingOwed && !refunded
          ? { state: "not_needed", evidence: "Nothing owed after the deposit", nextActor: null, nextAction: null, at: invoice.updatedAt.toISOString(), source: "Invoice.amountCents" }
        : refunded
          ? { state: "not_needed", evidence: totals.grossCents > 0 ? `${formatCentsExact(totals.grossCents)} collected, all refunded` : "Refunded", nextActor: null, nextAction: null, at: invoice.updatedAt.toISOString(), source: "Invoice.status", execution: "confirmed" }
          : claimed
            ? { state: "needs_you", evidence: `${who} says they paid; not confirmed`, nextActor: "you", nextAction: "Confirm the money arrived", at: invoice.updatedAt.toISOString(), source: "Payment (claimed)", execution: "unknown" }
            : { state: "waiting", evidence: collected > 0 ? `${formatCentsExact(collected)} of ${formatCentsExact(invoice.amountCents)} collected${refundNote}` : "Nothing collected yet", nextActor: "customer", nextAction: `${who} pays`, at: invoice.updatedAt.toISOString(), source: "Payment" }),
    );
  }

  /* An open disagreement with another system holds the stage it's about. */
  for (const m of mismatches) {
    const target = stages.find((s) => s.stage === (m.entityType === "invoice" ? (m.kind === "payment" ? "payment" : "invoice") : "completion"));
    if (target && target.state === "done") {
      target.state = "unknown";
      target.evidence = `${target.evidence}; ${m.system} disagrees — see Exceptions`;
      target.nextActor = "you";
      target.nextAction = "Check it and mark it resolved";
    }
  }

  const first = stages.find((s) => s.state !== "done" && s.state !== "not_needed" && s.state !== "not_yet") ?? null;
  return {
    businessId,
    businessName: shop.name,
    leadId,
    jobId: job?.id ?? null,
    title: job?.title ?? lead?.serviceType ?? "Request",
    customer: job?.customer?.name ?? lead?.name ?? null,
    headline: outcomeHeadline(stages),
    stages,
    next: first ? { stage: first.stage, actor: first.nextActor, action: first.nextAction, options: first.stage === "assignment" ? options : [] } : null,
    job: job ? { status: job.status, scheduledAt: job.scheduledAt?.toISOString() ?? null } : null,
    money: {
      totalCents: invoice?.subtotalCents ?? job?.finalAmountCents ?? (job?.estimate?.status === "accepted" ? job.estimate.amountCents : null),
      billedCents: invoice?.amountCents ?? null,
      collectedCents: invoice ? collectedCents(invoice.payments) : 0,
      refundedCents: invoice ? moneyTotals(invoice.payments).refundedCents : 0,
      keptCents: invoice ? moneyTotals(invoice.payments).netCents : 0,
    },
    synthetic: simulated || shop.environment !== "production",
    updatedAt: now.toISOString(),
  };
}

const outcomeJobInclude = {
  technician: { select: { id: true, name: true, phone: true } },
  customer: { select: { name: true, phone: true } },
  estimate: { select: { amountCents: true, status: true } },
  invoices: { orderBy: { createdAt: "desc" as const }, take: 1, include: { payments: { select: { amountCents: true, status: true, method: true, refundedCents: true } } } },
  billing: true,
} as const;

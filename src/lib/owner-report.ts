import { prisma } from "@/lib/prisma";
import { COLLECTED_STATUSES, moneyTotals, refundedOf } from "@/lib/payment-math";
import { MIN_ESTIMATES_FOR_RATE, type CallLeadRow, type EstimateRow, type JobRow, type MoneyRow, type OpenInvoiceRow, type OwnerReport, type ReportPeriodId, type ReportRow } from "@/lib/owner-report-types";

export { MIN_ESTIMATES_FOR_RATE, REPORT_PERIODS } from "@/lib/owner-report-types";
export type { OwnerReport, ReportPeriodId, ReportRow } from "@/lib/owner-report-types";

/*
  The numbers an owner runs the shop on, from the shop's own records: money
  collected, what each technician brought in, estimate close rate, and which
  channel the paying work came from. "Collected" means a paid invoice or a paid
  deposit, by card or recorded by hand, on the day it was paid; the same money
  QuickBooks receives. Nothing here is projected or estimated.
*/

export const SOURCE_LABELS: Record<string, string> = {
  call: "Phone calls",
  booking_page: "Booking page",
  chat: "Website chat",
  network: "Orvius Network referrals",
  sms: "Texts",
};
export const NO_SOURCE_LABEL = "Added by your team";

const DAY = 24 * 60 * 60 * 1000;

/** Calendar months on the shop's clock; the 90-day window is rolling. */
export function reportWindow(period: ReportPeriodId, timezone: string, now = new Date()) {
  if (period === "last_90") {
    const end = now;
    const start = new Date(now.getTime() - 90 * DAY);
    return { start, end, prevStart: new Date(start.getTime() - 90 * DAY), prevEnd: start };
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric" }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month) - (period === "last_month" ? 1 : 0);
  const monthStart = (y: number, m: number) => zonedMidnight(new Date(Date.UTC(y, m - 1, 1)), timezone);
  const start = monthStart(year, month);
  const end = period === "last_month" ? monthStart(year, month + 1) : now;
  const prevStart = monthStart(year, month - 1);
  // Compare like with like: this month so far against the same days of last month.
  const prevEnd = period === "this_month" ? new Date(prevStart.getTime() + (now.getTime() - start.getTime())) : start;
  return { start, end, prevStart, prevEnd };
}

/** The instant the shop's clock reads 00:00 on the given UTC calendar date. */
function zonedMidnight(dateUtc: Date, timezone: string) {
  const guess = new Date(Date.UTC(dateUtc.getUTCFullYear(), dateUtc.getUTCMonth(), dateUtc.getUTCDate()));
  const shown = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(guess);
  const get = (t: string) => Number(shown.find((p) => p.type === t)?.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asIfUtc - guess.getTime()));
}

export function summarizeReport(input: {
  money: MoneyRow[];
  previousMoney: Array<{ amountCents: number; refundedCents?: number }>;
  estimates: EstimateRow[];
  jobs: JobRow[];
  callLeads: CallLeadRow[];
  technicians: Array<{ id: string; name: string }>;
  openInvoices?: OpenInvoiceRow[];
}): OwnerReport {
  const sum = (rows: Array<{ amountCents: number }>) => rows.reduce((s, r) => s + r.amountCents, 0);
  const totals = (rows: Array<{ amountCents: number; refundedCents?: number }>) => moneyTotals(rows.map((r) => ({ amountCents: r.amountCents, status: "paid", refundedCents: r.refundedCents ?? 0 })));
  const kept = (m: { amountCents: number; refundedCents?: number }) => totals([m]).netCents;
  const invoices = input.money.filter((m) => m.kind === "invoice");
  const won = input.estimates.filter((e) => e.won);
  const booked = input.callLeads.filter((l) => l.booked).length;

  const names = new Map(input.technicians.map((t) => [t.id, t.name]));
  const techRows = new Map<string, ReportRow>();
  const techRow = (id: string | null) => {
    const key = id && names.has(id) ? id : "none";
    if (!techRows.has(key)) {
      techRows.set(key, { key, label: key === "none" ? "No technician assigned" : names.get(key)!, collectedCents: 0, payments: 0, jobsCompleted: 0, estimatesSent: 0, estimatesWon: 0 });
    }
    return techRows.get(key)!;
  };
  for (const m of input.money) {
    const row = techRow(m.technicianId);
    row.collectedCents += kept(m);
    row.payments += 1;
  }
  for (const j of input.jobs) techRow(j.technicianId).jobsCompleted! += 1;
  for (const e of input.estimates) {
    const row = techRow(e.technicianId);
    row.estimatesSent! += 1;
    if (e.won) row.estimatesWon! += 1;
  }

  const sourceRows = new Map<string, ReportRow>();
  for (const m of input.money) {
    const key = m.source && SOURCE_LABELS[m.source] ? m.source : "none";
    if (!sourceRows.has(key)) sourceRows.set(key, { key, label: key === "none" ? NO_SOURCE_LABEL : SOURCE_LABELS[key], collectedCents: 0, payments: 0 });
    const row = sourceRows.get(key)!;
    row.collectedCents += kept(m);
    row.payments += 1;
  }

  const byMoney = (a: ReportRow, b: ReportRow) => b.collectedCents - a.collectedCents || a.label.localeCompare(b.label);
  const open = (input.openInvoices ?? []).filter((i) => i.balanceCents > 0);
  return {
    collectedCents: totals(input.money).netCents,
    money: totals(input.money),
    previousCollectedCents: totals(input.previousMoney).netCents,
    payments: input.money.length,
    averageInvoiceCents: invoices.length ? Math.round(sum(invoices) / invoices.length) : null,
    jobsCompleted: input.jobs.length,
    estimates: {
      sent: input.estimates.length,
      won: won.length,
      sentCents: sum(input.estimates),
      wonCents: sum(won),
      closeRate: input.estimates.length >= MIN_ESTIMATES_FOR_RATE ? won.length / input.estimates.length : null,
    },
    calls: { leads: input.callLeads.length, booked, bookedRate: input.callLeads.length >= MIN_ESTIMATES_FOR_RATE ? booked / input.callLeads.length : null },
    stillToCollect: {
      totalCents: open.reduce((s, i) => s + i.balanceCents, 0),
      count: open.length,
      invoices: [...open].sort((a, b) => b.agedDays - a.agedDays || b.balanceCents - a.balanceCents),
    },
    byTechnician: [...techRows.values()].sort(byMoney),
    bySource: [...sourceRows.values()].sort(byMoney),
  };
}

const ROW_CAP = 5000;
const WON = ["accepted", "paid"];

async function moneyIn(businessId: string, start: Date, end: Date): Promise<MoneyRow[]> {
  /*
    Paid means paid, even when the paid-on date is missing: every production
    path stamps paidAt alongside the status, but a paid row with no paidAt
    must not vanish from the owner's books. Undated rows count on the day
    they were last touched (for a paid row, that is the status change).
  */
  const dated = (dateField: "paidAt" | "updatedAt") => ({ [dateField]: { gte: start, lt: end } });
  const inWindow = (field: "paidAt") => ({ OR: [dated(field), { [field]: null, ...dated("updatedAt") }] });
  const [invoices, deposits] = await Promise.all([
    prisma.invoice.findMany({
      where: { businessId, status: { in: ["paid", "partial", "refunded"] }, ...inWindow("paidAt") },
      select: { amountCents: true, status: true, payments: { select: { amountCents: true, status: true, refundedCents: true } }, job: { select: { technicianId: true, lead: { select: { source: true } } } } },
      take: ROW_CAP,
    }),
    prisma.deposit.findMany({
      where: { businessId, status: { in: ["paid", "refunded"] }, ...inWindow("paidAt") },
      select: { amountCents: true, status: true, refundedCents: true, lead: { select: { source: true } }, job: { select: { technicianId: true, lead: { select: { source: true } } } } },
      take: ROW_CAP,
    }),
  ]);
  return [
    ...invoices.map((i) => {
      /*
        What came in on a bill is its receipts, so a refunded card share that
        reopens the bill doesn't take the cash with it. A bill marked paid with
        no receipt rows (older records) still counts at its amount.
      */
      const money = moneyTotals(i.payments);
      const legacyPaid = money.grossCents === 0 && i.status === "paid";
      return {
        amountCents: legacyPaid ? i.amountCents : money.grossCents,
        refundedCents: legacyPaid ? 0 : money.refundedCents,
        technicianId: i.job?.technicianId ?? null,
        source: i.job?.lead?.source ?? null,
        kind: "invoice" as const,
      };
    }),
    ...deposits.map((d) => ({
      amountCents: d.amountCents,
      refundedCents: refundedOf(d),
      technicianId: d.job?.technicianId ?? null,
      source: d.job?.lead?.source ?? d.lead?.source ?? null,
      kind: "deposit" as const,
    })),
  ];
}

export async function buildOwnerReport(businessId: string, period: ReportPeriodId, now = new Date()) {
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const timezone = shop?.timezone ?? "America/New_York";
  const w = reportWindow(period, timezone, now);
  const inWindow = { gte: w.start, lt: w.end };
  const [money, previousMoney, estimates, jobs, callLeads, technicians, openInvoices] = await Promise.all([
    moneyIn(businessId, w.start, w.end),
    moneyIn(businessId, w.prevStart, w.prevEnd),
    prisma.estimate.findMany({
      where: { businessId, sentAt: inWindow },
      select: { amountCents: true, status: true, job: { select: { technicianId: true } } },
      take: ROW_CAP,
    }),
    prisma.job.findMany({ where: { businessId, status: "completed", completedAt: inWindow }, select: { technicianId: true }, take: ROW_CAP }),
    prisma.lead.findMany({ where: { businessId, source: "call", createdAt: inWindow }, select: { job: { select: { id: true } } }, take: ROW_CAP }),
    prisma.technician.findMany({ where: { businessId }, select: { id: true, name: true } }),
    prisma.invoice.findMany({
      where: { businessId, status: { in: ["sent", "open", "partial"] } },
      select: {
        id: true,
        amountCents: true,
        status: true,
        sentAt: true,
        createdAt: true,
        payments: { where: { status: { in: COLLECTED_STATUSES } }, select: { amountCents: true } },
        job: { select: { id: true, title: true, customer: { select: { name: true } }, lead: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
      take: ROW_CAP,
    }),
  ]);
  const report = summarizeReport({
    money,
    previousMoney,
    estimates: estimates.map((e) => ({ amountCents: e.amountCents, won: WON.includes(e.status), technicianId: e.job?.technicianId ?? null })),
    jobs,
    callLeads: callLeads.map((l) => ({ booked: Boolean(l.job) })),
    technicians,
    openInvoices: openInvoices.map((i) => {
      const collected = i.payments.reduce((s, p) => s + p.amountCents, 0);
      const who = i.job?.customer?.name ?? i.job?.lead?.name ?? null;
      const what = i.job?.title ?? "Invoice";
      const since = i.sentAt ?? i.createdAt;
      return {
        id: i.id,
        label: who ? `${what} · ${who}` : what,
        jobId: i.job?.id ?? null,
        amountCents: i.amountCents,
        balanceCents: Math.max(0, i.amountCents - collected),
        agedDays: Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY)),
      };
    }),
  });
  return { period, start: w.start.toISOString(), end: w.end.toISOString(), previousStart: w.prevStart.toISOString(), previousEnd: w.prevEnd.toISOString(), timezone, report };
}

export function reportCsv(report: OwnerReport) {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
  };
  const money = (c: number) => (c / 100).toFixed(2);
  const lines = [
    ["Section", "Name", "Kept after refunds ($)", "Payments", "Jobs completed", "Estimates sent", "Estimates won"],
    ...report.byTechnician.map((r) => ["Technician", r.label, money(r.collectedCents), r.payments, r.jobsCompleted ?? 0, r.estimatesSent ?? 0, r.estimatesWon ?? 0]),
    ...report.bySource.map((r) => ["Source", r.label, money(r.collectedCents), r.payments, "", "", ""]),
    ["Total", "", money(report.collectedCents), report.payments, report.jobsCompleted, report.estimates.sent, report.estimates.won],
    ...(report.money && report.money.refundedCents > 0
      ? [["Before refunds", "", money(report.money.grossCents), "", "", "", ""], ["Refunded", "", money(report.money.refundedCents), "", "", "", ""]]
      : []),
  ];
  return lines.map((row) => row.map(cell).join(",")).join("\n");
}

import { shopDayBounds } from "@/lib/availability";
import { displayPhone } from "@/lib/customer";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { MemoryHit } from "@/lib/shop-memory";
import { COLLECTED_STATUSES } from "@/lib/payment-math";
import { isEmergency } from "@/lib/urgency";

/*
  The questions owners ask most have exact answers in the records: who called,
  what's on the schedule, any emergencies, what came in. Text search can't tell
  "today" from last week, so these are read straight from the right time window
  on the shop's clock. Anything else falls through to search.
*/

export type AskKind = "calls" | "jobs" | "emergencies" | "money";
type Window = { start: Date; end: Date; label: string };
export type AskIntent = { kind: AskKind; window: Window; topic: string[] | null; topicLabel: string | null };

const DAY = 24 * 60 * 60 * 1000;
const LIST_MAX = 6;

const TOPICS: Array<{ match: RegExp; label: string; terms: string[] }> = [
  { match: /\b(ac|a\/c|air ?condition\w*|cooling|no cool)\b/i, label: "AC", terms: ["ac", "a/c", "air condition", "cool"] },
  { match: /\b(furnace|heat\w*|no heat|boiler)\b/i, label: "heating", terms: ["furnace", "heat", "boiler"] },
  { match: /\bwater heater\b/i, label: "water heaters", terms: ["water heater"] },
  { match: /\b(leak\w*|drip\w*)\b/i, label: "leaks", terms: ["leak", "drip"] },
  { match: /\b(drain|clog\w*|sewer)\b/i, label: "drains", terms: ["drain", "clog", "sewer"] },
  { match: /\b(panel|breaker|outlet|wiring|electrical)\b/i, label: "electrical", terms: ["panel", "breaker", "outlet", "wiring", "electric"] },
];

export function readAskIntent(question: string, timezone: string, now = new Date()): AskIntent | null {
  const q = question.toLowerCase();
  const moneyWords = /\b(collect\w*|owe[sd]?|unpaid|outstanding)\b/.test(q);
  // Booking-rate questions belong to the outcomes summary, which knows the denominator.
  if (!moneyWords && (/\b(rate|percent\w*)\b|%/.test(q) || /\bhow many\b.*\bbooked\b/.test(q))) return null;
  const kind: AskKind | null = /\b(collect\w*|paid|payments?|revenue|made|make|earn\w*|owe[sd]?|outstanding|unpaid|money)\b/.test(q)
    ? "money"
    : /emergenc|urgent/.test(q)
      ? "emergencies"
      : /\b(who called|calls|called|callers?|phoned|rang)\b/.test(q)
        ? "calls"
        : /\b(jobs?|schedule|appointments?|visits?|on the books|booked)\b/.test(q)
          ? "jobs"
          : null;
  if (!kind) return null;
  const topic = TOPICS.find((t) => t.match.test(q)) ?? null;
  return { kind, window: readWindow(q, kind, timezone, now), topic: topic?.terms ?? null, topicLabel: topic?.label ?? null };
}

function readWindow(q: string, kind: AskKind, timezone: string, now: Date): Window {
  const today = shopDayBounds(null, timezone, now);
  const dayAt = (offset: number) => shopDayBounds(null, timezone, new Date(today.start.getTime() + offset * DAY + 12 * 3600_000));
  if (/\btomorrow\b/.test(q)) {
    const d = dayAt(1);
    return { start: d.start, end: d.end, label: "tomorrow" };
  }
  if (/\byesterday\b/.test(q)) {
    const d = dayAt(-1);
    return { start: d.start, end: d.end, label: "yesterday" };
  }
  if (/\blast night\b|\bovernight\b/.test(q)) {
    return { start: new Date(today.start.getTime() - 7 * 3600_000), end: new Date(today.start.getTime() + 8 * 3600_000), label: "last night" };
  }
  if (/\bthis month\b/.test(q)) {
    const parts = today.day.split("-").map(Number);
    const first = shopDayBounds(`${parts[0]}-${String(parts[1]).padStart(2, "0")}-01`, timezone, now);
    return { start: first.start, end: kind === "jobs" ? new Date(first.start.getTime() + 32 * DAY) : now, label: "this month" };
  }
  if (/\b(this|next) week\b|\bweek\b/.test(q)) {
    return kind === "jobs"
      ? { start: today.start, end: new Date(today.start.getTime() + 7 * DAY), label: "in the next 7 days" }
      : { start: new Date(now.getTime() - 7 * DAY), end: now, label: "in the last 7 days" };
  }
  if (/\btoday\b|\btonight\b/.test(q) || kind === "calls" || kind === "jobs") {
    return { start: today.start, end: today.end, label: "today" };
  }
  return { start: new Date(now.getTime() - 7 * DAY), end: now, label: "in the last 7 days" };
}

const has = (text: string | null | undefined, terms: string[]) => {
  const t = ` ${(text ?? "").toLowerCase()} `;
  return terms.some((term) => (term.length <= 3 ? new RegExp(`[^a-z]${term.replace("/", "\\/")}[^a-z]`).test(t) : t.includes(term)));
};

function clock(at: Date, timezone: string, withDay: boolean) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...(withDay ? { weekday: "short", month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

const list = (items: string[]) => {
  const shown = items.slice(0, LIST_MAX);
  const more = items.length - shown.length;
  return shown.join("; ") + (more > 0 ? `; and ${more} more` : "") + ".";
};

export async function answerDirect(
  question: string,
  businessId: string,
  now = new Date(),
): Promise<{ answer: string; hits: MemoryHit[]; kind: AskKind } | null> {
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const timezone = shop?.timezone ?? "America/New_York";
  const intent = readAskIntent(question, timezone, now);
  if (!intent) return null;
  const { window: w, topic, topicLabel } = intent;
  const about = topicLabel ? ` about ${topicLabel}` : "";
  const multiDay = w.end.getTime() - w.start.getTime() > DAY + 3600_000;

  if (intent.kind === "calls") {
    const calls = await prisma.call.findMany({
      where: { businessId, direction: "inbound", OR: [{ channel: null }, { channel: { not: "web_demo" } }], createdAt: { gte: w.start, lt: w.end } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, createdAt: true, callerPhone: true, summary: true, lead: { select: { name: true, serviceType: true, urgency: true, job: { select: { id: true } } } }, customer: { select: { name: true } } },
    });
    const matched = topic ? calls.filter((c) => has(c.lead?.serviceType, topic) || has(c.summary, topic)) : calls;
    if (!matched.length) {
      const total = topic && calls.length ? ` ${calls.length} ${calls.length === 1 ? "call" : "calls"} came in ${w.label} on other things.` : "";
      return { kind: "calls", answer: `No calls${about} ${w.label}.${total}`, hits: [] };
    }
    const lines = matched.map((c) => {
      const who = c.lead?.name ?? c.customer?.name ?? (c.callerPhone ? displayPhone(c.callerPhone) : "Unknown caller");
      const what = c.lead?.serviceType ? `, ${c.lead.serviceType}` : "";
      const flag = isEmergency(c.lead?.urgency) ? " (emergency)" : "";
      const state = c.lead?.job ? ", booked" : c.lead ? ", not booked yet" : "";
      return `${who}${what}${flag} at ${clock(c.createdAt, timezone, multiDay)}${state}`;
    });
    const count = `${matched.length} ${matched.length === 1 ? "call" : "calls"}${about} ${w.label}`;
    return {
      kind: "calls",
      answer: `${count}: ${list(lines)}`,
      hits: matched.slice(0, LIST_MAX).map((c, i) => ({
        type: "call",
        id: c.id,
        href: `/dashboard/calls/${c.id}`,
        title: c.lead?.name ?? c.customer?.name ?? (c.callerPhone ? displayPhone(c.callerPhone) : "Caller"),
        summary: c.lead?.serviceType ?? c.summary?.slice(0, 120) ?? "Call",
        score: 1 - i * 0.01,
        observedAt: c.createdAt.toISOString(),
      })),
    };
  }

  if (intent.kind === "jobs") {
    const jobs = await prisma.job.findMany({
      where: { businessId, scheduledAt: { gte: w.start, lt: w.end }, status: { not: "cancelled" } },
      orderBy: { scheduledAt: "asc" },
      take: 200,
      select: { id: true, title: true, serviceType: true, scheduledAt: true, status: true, urgency: true, customer: { select: { name: true } }, technician: { select: { name: true } } },
    });
    const matched = topic ? jobs.filter((j) => has(j.title, topic) || has(j.serviceType, topic)) : jobs;
    if (!matched.length) return { kind: "jobs", answer: `No jobs${about} on the schedule ${w.label}.`, hits: [] };
    const unassigned = matched.filter((j) => !j.technician).length;
    const lines = matched.map((j) => {
      const who = j.customer?.name ? ` for ${j.customer.name}` : "";
      const tech = j.technician ? `, ${j.technician.name.split(" ")[0]}` : ", nobody assigned";
      return `${clock(j.scheduledAt!, timezone, multiDay)} ${j.title}${who}${tech}`;
    });
    const tail = unassigned ? ` ${unassigned} still ${unassigned === 1 ? "needs" : "need"} someone.` : "";
    return {
      kind: "jobs",
      answer: `${matched.length} ${matched.length === 1 ? "job" : "jobs"}${about} ${w.label}: ${list(lines)}${tail}`,
      hits: matched.slice(0, LIST_MAX).map((j, i) => ({
        type: "job",
        id: j.id,
        href: `/dashboard/jobs/${j.id}`,
        title: j.title,
        summary: `${clock(j.scheduledAt!, timezone, true)}${j.technician ? ` · ${j.technician.name}` : " · unassigned"}`,
        score: 1 - i * 0.01,
        observedAt: j.scheduledAt!.toISOString(),
        actionable: !["completed", "cancelled"].includes(j.status),
      })),
    };
  }

  if (intent.kind === "emergencies") {
    const leads = await prisma.lead.findMany({
      where: { businessId, createdAt: { gte: w.start, lt: w.end }, urgency: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, phone: true, serviceType: true, urgency: true, createdAt: true, status: true, job: { select: { id: true, scheduledAt: true, technician: { select: { name: true } } } } },
    });
    const urgent = leads.filter((l) => isEmergency(l.urgency));
    if (!urgent.length) return { kind: "emergencies", answer: `No emergency calls ${w.label}.`, hits: [] };
    const lines = urgent.map((l) => {
      const who = l.name ?? (l.phone ? displayPhone(l.phone) : "Unknown caller");
      const state = l.job?.scheduledAt
        ? `booked ${clock(l.job.scheduledAt, timezone, true)}${l.job.technician ? ` with ${l.job.technician.name.split(" ")[0]}` : ", nobody assigned"}`
        : "not booked yet, call them";
      return `${who}${l.serviceType ? `, ${l.serviceType}` : ""}, called ${clock(l.createdAt, timezone, true)}: ${state}`;
    });
    const open = urgent.filter((l) => !l.job).length;
    return {
      kind: "emergencies",
      answer: `${urgent.length} emergency ${urgent.length === 1 ? "call" : "calls"} ${w.label}${open ? `, ${open} not booked yet` : ""}: ${list(lines)}`,
      hits: urgent.slice(0, LIST_MAX).map((l, i) => ({
        type: "lead",
        id: l.id,
        href: `/dashboard/inbox/${l.id}`,
        title: l.name ?? "Emergency caller",
        summary: l.serviceType ?? "Emergency",
        score: 1 - i * 0.01,
        observedAt: l.createdAt.toISOString(),
        actionable: !l.job,
      })),
    };
  }

  // Same sources as Performance: recorded payments plus paid deposits, so both screens show one number.
  const [paid, deposits, unpaid] = await Promise.all([
    prisma.payment.aggregate({
      where: { businessId, status: { in: COLLECTED_STATUSES }, createdAt: { gte: w.start, lt: w.end } },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.deposit.aggregate({ where: { businessId, status: "paid", paidAt: { gte: w.start, lt: w.end } }, _sum: { amountCents: true }, _count: true }),
    prisma.invoice.findMany({
      where: { businessId, status: { in: ["sent", "open"] } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, amountCents: true, createdAt: true, job: { select: { id: true, title: true, customer: { select: { name: true } } } }, payments: { where: { status: { in: COLLECTED_STATUSES } }, select: { amountCents: true } } },
    }),
  ]);
  const collected = (paid._sum.amountCents ?? 0) + (deposits._sum.amountCents ?? 0);
  const payments = paid._count + deposits._count;
  const owed = unpaid
    .map((i) => ({ ...i, balance: i.amountCents - i.payments.reduce((s, p) => s + p.amountCents, 0) }))
    .filter((i) => i.balance > 0);
  const owedTotal = owed.reduce((s, i) => s + i.balance, 0);
  const owedLine = owed.length
    ? `${owed.length} unpaid ${owed.length === 1 ? "invoice" : "invoices"} still out, ${formatCents(owedTotal)} total.`
    : "No unpaid invoices out.";
  const collectedLine = payments
    ? `Collected ${formatCents(collected)} ${w.label} from ${payments} ${payments === 1 ? "payment" : "payments"}.`
    : `Nothing collected ${w.label}.`;
  const owedFirst = /\b(owe[sd]?|outstanding|unpaid)\b/.test(question.toLowerCase());
  return {
    kind: "money",
    answer: owedFirst ? `${owedLine} ${collectedLine}` : `${collectedLine} ${owedLine}`,
    hits: owed.flatMap((i) => (i.job ? [{ ...i, job: i.job }] : [])).slice(0, LIST_MAX).map((i, n) => ({
      type: "job" as const,
      id: i.job.id,
      href: `/dashboard/jobs/${i.job.id}`,
      title: i.job.customer?.name ?? i.job.title,
      summary: `${formatCents(i.balance)} unpaid`,
      score: 1 - n * 0.01,
      observedAt: i.createdAt.toISOString(),
      actionable: true,
    })),
  };
}

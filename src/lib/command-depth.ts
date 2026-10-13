import { prisma } from "@/lib/prisma";
import { COLLECTED_STATUSES } from "@/lib/payment-math";

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_CAP = 2000;
const OPEN_INVOICE = ["sent", "open", "partial"];

export type FlowStage = {
  key: "requests" | "booked" | "confirmed" | "accepted" | "done" | "paid";
  label: string;
  count: number;
  /** Open work that reached the stage before this one and is still waiting on this one. */
  waiting: number;
  waitingLabel: string | null;
  href: string;
};

export type CommandFlow = {
  windowDays: number;
  stages: FlowStage[];
  /** Jobs read for the flow hit the cap, so counts are a floor. */
  capped: boolean;
};

export type CommandMoney = {
  windowDays: number;
  invoicedCents: number;
  invoices: number;
  collectedCents: number;
  payments: number;
  outstandingCents: number;
  outstandingInvoices: number;
  /** Completed in the window with no bill written yet. */
  doneNotBilled: number;
};

type CohortJob = {
  status: string;
  technicianId: string | null;
  customerConfirmedAt: Date | null;
  techAcceptedAt: Date | null;
  invoices: { status: string }[];
};

/**
 * The window's requests and the jobs booked from them, counted at each step a
 * real record proves: the customer's confirmation, the technician's accept,
 * completion, and a paid bill. Nothing is inferred from status alone except
 * "done", which only the technician or the owner sets.
 */
export function summarizeFlow(input: { requests: number; jobs: CohortJob[]; windowDays: number; capped?: boolean }): CommandFlow {
  const jobs = input.jobs.filter((j) => j.status !== "cancelled");
  const open = jobs.filter((j) => j.status !== "completed");
  const done = jobs.filter((j) => j.status === "completed");
  const paid = done.filter((j) => j.invoices.some((i) => i.status === "paid"));
  const confirmed = jobs.filter((j) => j.customerConfirmedAt);
  const accepted = jobs.filter((j) => j.techAcceptedAt);
  const waitingCustomer = open.filter((j) => !j.customerConfirmedAt).length;
  const unassigned = open.filter((j) => !j.technicianId).length;
  const waitingTech = open.filter((j) => j.technicianId && !j.techAcceptedAt).length;
  const unpaid = done.length - paid.length;
  const unbooked = Math.max(0, input.requests - jobs.length);
  const people = (n: number, one: string, many: string) => (n === 1 ? one : many);
  return {
    windowDays: input.windowDays,
    capped: Boolean(input.capped),
    stages: [
      { key: "requests", label: "Requests", count: input.requests, waiting: 0, waitingLabel: null, href: "/dashboard/inbox" },
      {
        key: "booked",
        label: "Booked",
        count: jobs.length,
        waiting: unbooked,
        waitingLabel: unbooked ? `${unbooked} not booked` : null,
        href: "/dashboard/jobs",
      },
      {
        key: "confirmed",
        label: "Confirmed",
        count: confirmed.length,
        waiting: waitingCustomer,
        waitingLabel: waitingCustomer ? `${waitingCustomer} waiting on the ${people(waitingCustomer, "customer", "customers")}` : null,
        href: "/dashboard/work",
      },
      {
        key: "accepted",
        label: "Accepted",
        count: accepted.length,
        waiting: waitingTech + unassigned,
        waitingLabel:
          [unassigned ? `${unassigned} unassigned` : null, waitingTech ? `${waitingTech} not accepted yet` : null].filter(Boolean).join(" · ") || null,
        href: "/dashboard/schedule",
      },
      { key: "done", label: "Done", count: done.length, waiting: 0, waitingLabel: open.length ? `${open.length} still open` : null, href: "/dashboard/jobs" },
      {
        key: "paid",
        label: "Paid",
        count: paid.length,
        waiting: unpaid,
        waitingLabel: unpaid ? `${unpaid} not paid yet` : null,
        href: "/dashboard/reports",
      },
    ],
  };
}

export async function getCommandFlow(businessId: string, now = new Date(), windowDays = 7): Promise<CommandFlow> {
  const start = new Date(now.getTime() - windowDays * DAY_MS);
  const [requests, jobs] = await Promise.all([
    prisma.lead.count({ where: { businessId, createdAt: { gte: start }, status: { not: "spam" } } }),
    prisma.job.findMany({
      where: { businessId, createdAt: { gte: start } },
      select: {
        status: true,
        technicianId: true,
        customerConfirmedAt: true,
        techAcceptedAt: true,
        invoices: { select: { status: true } },
      },
      take: ROW_CAP,
    }),
  ]);
  return summarizeFlow({ requests, jobs, windowDays, capped: jobs.length >= ROW_CAP });
}

export async function getCommandMoney(businessId: string, now = new Date(), windowDays = 7): Promise<CommandMoney> {
  const start = new Date(now.getTime() - windowDays * DAY_MS);
  const window = { gte: start, lte: now };
  const [invoiced, paid, deposits, open, doneNotBilled] = await Promise.all([
    prisma.invoice.aggregate({
      where: { businessId, createdAt: window, status: { notIn: ["void", "draft"] } },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { businessId, status: { in: COLLECTED_STATUSES }, createdAt: window },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.deposit.aggregate({ where: { businessId, status: "paid", paidAt: window }, _sum: { amountCents: true }, _count: true }),
    prisma.invoice.findMany({
      where: { businessId, status: { in: OPEN_INVOICE } },
      select: { amountCents: true, payments: { where: { status: { in: COLLECTED_STATUSES } }, select: { amountCents: true } } },
      take: ROW_CAP,
    }),
    prisma.job.count({
      where: { businessId, status: "completed", completedAt: window, invoices: { none: { status: { not: "void" } } } },
    }),
  ]);
  const balances = open.map((i) => i.amountCents - i.payments.reduce((s, p) => s + p.amountCents, 0)).filter((b) => b > 0);
  return {
    windowDays,
    invoicedCents: invoiced._sum.amountCents ?? 0,
    invoices: invoiced._count,
    collectedCents: (paid._sum.amountCents ?? 0) + (deposits._sum.amountCents ?? 0),
    payments: paid._count + deposits._count,
    outstandingCents: balances.reduce((s, b) => s + b, 0),
    outstandingInvoices: balances.length,
    doneNotBilled,
  };
}

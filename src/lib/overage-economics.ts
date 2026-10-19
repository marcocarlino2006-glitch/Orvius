import { PHONE_MICROS_PER_MIN, SMS_MICROS_PER_TEXT } from "@/lib/call-cost";
import { OVERAGE_CENTS_PER_CALL } from "@/lib/pricing-plans";

/*
  Overage economics, observed and never acted on. A pure rolling-window report
  over calls, texts, model spend, fixed costs and invoices, reconciled to what
  was actually invoiced and collected. Nothing here changes a price, an
  allowance, a Stripe object or whether a call is answered: the output carries
  no cutoff or throttle decision, by construction.

  Every cost line says where it came from — reported by the provider, metered
  by us, or estimated at list rate — so a reader can tell a measured margin
  from a modelled one.
*/

export const OVERAGE_ECONOMICS_VERSION = "overage-economics-1";
export const LONG_CALL_SEC = 15 * 60;

export type EconShop = {
  id: string;
  environment: "production" | "demo" | "test";
  plan: string | null;
  interval: "month" | "year" | null;
  billingStatus: string | null;
  /** Pilot shops run free and are never billed; shown, not counted as revenue. */
  pilot: boolean;
  signupMonth: string;
  selfTest?: boolean;
};
export type EconCall = {
  id: string;
  businessId: string;
  at: string;
  answered: boolean;
  durationSec: number | null;
  /** Provider-reported charge (Vapi), or null when the report carried none. */
  costMicros: number | null;
  urgent?: boolean;
  humanTransfer?: boolean;
};
export type EconText = { businessId: string; at: string; segments: number; costMicros?: number | null };
export type EconModel = { businessId: string; at: string; micros: number };
export type EconFixed = { businessId: string; month: string; kind: "number" | "a2p" | "storage"; cents: number; source: "invoice" | "estimate" };
export type EconInvoice = {
  id: string;
  businessId: string;
  at: string;
  kind: "subscription" | "overage";
  interval?: "month" | "year" | null;
  amountCents: number;
  discountCents?: number;
  creditCents?: number;
  status: "paid" | "open" | "failed" | "refunded" | "disputed" | "void";
  refundedCents?: number;
};
export type EconWaiver = { businessId: string; period: string; overCalls: number; amountCents: number; reason: "below_minimum" };

export type EconInput = {
  shops: EconShop[];
  calls: EconCall[];
  texts: EconText[];
  model: EconModel[];
  fixed: EconFixed[];
  invoices: EconInvoice[];
  waivers: EconWaiver[];
};

const DAY = 86_400_000;

function pct(sorted: number[], p: number) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}
function dist(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return { n: s.length, p50: pct(s, 50), p90: pct(s, 90), p99: pct(s, 99), max: s.length ? s[s.length - 1]! : null };
}
const cents = (micros: number) => Math.round(micros / 10_000);

export function overageEconomicsReport(input: EconInput, opts: { now: Date; windowDays?: number }) {
  const windowDays = opts.windowDays ?? 30;
  const end = opts.now;
  const start = new Date(end.getTime() - windowDays * DAY);
  const inWindow = (at: string) => {
    const t = Date.parse(at);
    return t >= start.getTime() && t < end.getTime();
  };
  const shops = new Map(input.shops.map((s) => [s.id, s]));

  const excluded = { demo: 0, test: 0, selfTest: 0, pilot: 0, unanswered: 0, unknownShop: 0 };
  const billable: EconCall[] = [];
  for (const call of input.calls) {
    if (!inWindow(call.at)) continue;
    const shop = shops.get(call.businessId);
    if (!shop) excluded.unknownShop++;
    else if (shop.environment === "demo") excluded.demo++;
    else if (shop.environment === "test") excluded.test++;
    else if (shop.selfTest) excluded.selfTest++;
    else if (shop.pilot) excluded.pilot++;
    else if (!call.answered) excluded.unanswered++;
    else billable.push(call);
  }
  const billableShops = new Set(billable.map((c) => c.businessId));
  const counted = (businessId: string) => {
    const s = shops.get(businessId);
    return Boolean(s && s.environment === "production" && !s.selfTest && !s.pilot);
  };

  const reported = billable.filter((c) => c.costMicros != null);
  const callCost = (c: EconCall) => (c.costMicros ?? 0) + Math.round((Math.max(0, c.durationSec ?? 0) / 60) * PHONE_MICROS_PER_MIN);
  const voiceMicros = reported.reduce((n, c) => n + (c.costMicros ?? 0), 0);
  const phoneMicros = billable.reduce((n, c) => n + Math.round((Math.max(0, c.durationSec ?? 0) / 60) * PHONE_MICROS_PER_MIN), 0);

  const texts = input.texts.filter((t) => inWindow(t.at) && counted(t.businessId));
  const textReported = texts.filter((t) => t.costMicros != null);
  const textMicros = texts.reduce((n, t) => n + (t.costMicros ?? t.segments * SMS_MICROS_PER_TEXT), 0);
  const modelMicros = input.model.filter((m) => inWindow(m.at) && counted(m.businessId)).reduce((n, m) => n + m.micros, 0);
  const monthsInWindow = new Set<string>();
  for (let t = start.getTime(); t < end.getTime(); t += DAY) monthsInWindow.add(new Date(t).toISOString().slice(0, 7));
  const fixed = input.fixed.filter((f) => monthsInWindow.has(f.month) && counted(f.businessId));
  const fixedBy = (kind: EconFixed["kind"]) => fixed.filter((f) => f.kind === kind);
  const sum = (xs: { cents: number }[]) => xs.reduce((n, x) => n + x.cents, 0);
  const sourceOf = (xs: EconFixed[]) => (!xs.length ? "none" : xs.every((x) => x.source === "invoice") ? "invoice" : xs.some((x) => x.source === "invoice") ? "mixed" : "estimate");

  const invoices = input.invoices.filter((i) => inWindow(i.at) && counted(i.businessId));
  const subs = invoices.filter((i) => i.kind === "subscription" && i.status !== "void");
  const net = (i: EconInvoice) => i.amountCents - (i.discountCents ?? 0) - (i.creditCents ?? 0) - (i.refundedCents ?? 0);
  const collectedSub = (i: EconInvoice) => (i.status === "paid" || i.status === "refunded" ? net(i) : 0);
  const effective = (interval: "month" | "year") => {
    const list = subs.filter((i) => (i.interval ?? "month") === interval);
    const collected = list.reduce((n, i) => n + collectedSub(i), 0);
    // An annual charge covers twelve months; only the window's share is this window's revenue.
    const recognised = interval === "year" ? Math.round((collected * windowDays) / 365) : collected;
    return { invoices: list.length, invoicedCents: list.reduce((n, i) => n + i.amountCents, 0), discountsCents: list.reduce((n, i) => n + (i.discountCents ?? 0) + (i.creditCents ?? 0), 0), collectedCents: collected, recognisedCents: recognised };
  };
  const monthly = effective("month");
  const annual = effective("year");

  const overage = invoices.filter((i) => i.kind === "overage");
  const by = (pred: (i: EconInvoice) => boolean) => {
    const list = overage.filter(pred);
    return { count: list.length, cents: list.reduce((n, i) => n + i.amountCents, 0) };
  };
  const waivers = input.waivers.filter((w) => counted(w.businessId));
  const overageView = {
    centsPerCall: OVERAGE_CENTS_PER_CALL,
    invoiced: by((i) => i.status !== "void"),
    collected: by((i) => i.status === "paid"),
    failed: by((i) => i.status === "failed"),
    outstanding: by((i) => i.status === "open"),
    refunded: { count: overage.filter((i) => (i.refundedCents ?? 0) > 0 || i.status === "refunded").length, cents: overage.reduce((n, i) => n + (i.refundedCents ?? (i.status === "refunded" ? i.amountCents : 0)), 0) },
    disputed: by((i) => i.status === "disputed"),
    waived: { count: waivers.length, cents: waivers.reduce((n, w) => n + w.amountCents, 0), reason: "below Stripe's $1 minimum" },
  };

  const pastDue = input.shops
    .filter((s) => s.billingStatus === "past_due" && counted(s.id))
    .map((s) => ({ businessId: s.id, callsAnswered: billable.filter((c) => c.businessId === s.id).length, overageOutstandingCents: overage.filter((i) => i.businessId === s.id && i.status !== "paid" && i.status !== "void").reduce((n, i) => n + i.amountCents, 0) }));

  const pilots = input.shops.filter((s) => s.pilot && s.environment === "production").map((s) => ({
    businessId: s.id,
    callsAnswered: input.calls.filter((c) => c.businessId === s.id && c.answered && inWindow(c.at)).length,
    billed: false,
  }));

  const costs = billable.map(callCost);
  const p99 = pct([...costs].sort((a, b) => a - b), 99) ?? Infinity;
  const tail = billable.filter((c) => callCost(c) >= p99 && callCost(c) > 0);
  const long = billable.filter((c) => (c.durationSec ?? 0) >= LONG_CALL_SEC);
  const urgent = billable.filter((c) => c.urgent);
  const transfer = billable.filter((c) => c.humanTransfer);
  const totalCallMicros = costs.reduce((n, x) => n + x, 0);
  const group = (list: EconCall[]) => {
    const m = list.reduce((n, c) => n + callCost(c), 0);
    return { count: list.length, costCents: cents(m), costSharePct: totalCallMicros ? Math.round((m / totalCallMicros) * 1000) / 10 : 0, callIds: list.slice(0, 10).map((c) => c.id) };
  };

  const cohorts = [...new Set(input.shops.filter((s) => counted(s.id)).map((s) => s.signupMonth))].sort().map((month) => {
    const ids = new Set(input.shops.filter((s) => s.signupMonth === month && counted(s.id)).map((s) => s.id));
    const calls = billable.filter((c) => ids.has(c.businessId));
    return {
      signupMonth: month,
      shops: ids.size,
      billableCalls: calls.length,
      callCostCents: cents(calls.reduce((n, c) => n + callCost(c), 0)),
      collectedCents: subs.filter((i) => ids.has(i.businessId)).reduce((n, i) => n + collectedSub(i), 0) + overage.filter((i) => ids.has(i.businessId) && i.status === "paid").reduce((n, i) => n + i.amountCents, 0),
    };
  });

  const costTotalCents =
    cents(voiceMicros + phoneMicros + textMicros + modelMicros) + sum(fixedBy("number")) + sum(fixedBy("a2p")) + sum(fixedBy("storage"));
  const revenueCents = monthly.recognisedCents + annual.recognisedCents + overageView.collected.cents - overageView.refunded.cents;

  return {
    version: OVERAGE_ECONOMICS_VERSION,
    policy: "observe_only" as const,
    window: { start: start.toISOString(), end: end.toISOString(), days: windowDays },
    denominator: { billableCalls: billable.length, billableShops: billableShops.size, excluded },
    coverage: {
      callsWithReportedCost: reported.length,
      callCostCoveragePct: billable.length ? Math.round((reported.length / billable.length) * 1000) / 10 : null,
      textsWithReportedCost: textReported.length,
      texts: texts.length,
    },
    costs: {
      voice: { cents: cents(voiceMicros), source: "provider_reported" },
      telephony: { cents: cents(phoneMicros), source: "estimate_list_rate" },
      sms: { cents: cents(textMicros), source: !texts.length ? "none" : textReported.length === texts.length ? "provider_reported" : textReported.length ? "mixed" : "estimate_list_rate" },
      model: { cents: cents(modelMicros), source: "metered" },
      numbers: { cents: sum(fixedBy("number")), source: sourceOf(fixedBy("number")) },
      a2p: { cents: sum(fixedBy("a2p")), source: sourceOf(fixedBy("a2p")) },
      storage: { cents: sum(fixedBy("storage")), source: sourceOf(fixedBy("storage")) },
      totalCents: costTotalCents,
    },
    distributions: { callCostMicros: dist(costs), durationSec: dist(billable.map((c) => Math.max(0, c.durationSec ?? 0))) },
    exceptions: { costTail: group(tail), long: group(long), urgent: group(urgent), humanTransfer: group(transfer) },
    revenue: { monthly, annual, recognisedTotalCents: revenueCents, perBillableCallCents: billable.length ? Math.round((revenueCents / billable.length) * 10) / 10 : null },
    overage: overageView,
    pastDue,
    pilots,
    cohorts,
    observedMarginCents: revenueCents - costTotalCents,
  };
}

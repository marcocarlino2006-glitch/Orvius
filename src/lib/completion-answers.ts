import { JOB_OUTCOMES, type JobOutcomeCode } from "@/lib/job-outcome";

export const COMPLETION_SOURCES = [
  { source: "customer_confirmed", label: "The customer confirmed" },
  { source: "technician_report", label: "The technician told me" },
  { source: "paper_ticket", label: "A paper ticket" },
  { source: "external_system", label: "Our other system" },
] as const;

export type CompletionAnswers = { resolutionCode: string; price: string; source?: string; reason?: string };
export type CompletionAsk = { completion: Record<string, unknown>; reason?: string } | { error: string };

/** The same checks the server makes, so a bad answer is caught before anything is sent. */
export function readCompletion(answers: CompletionAnswers, opts: { fromOnSite: boolean }): CompletionAsk {
  const resolutionCode = JOB_OUTCOMES.find((o) => o.code === answers.resolutionCode)?.code as JobOutcomeCode | undefined;
  if (!resolutionCode) return { error: "Pick one of the listed outcomes." };
  const dollars = answers.price.trim() ? Number(answers.price.replace(/[$,]/g, "")) : null;
  if (dollars != null && (!Number.isFinite(dollars) || dollars < 0 || dollars > 50_000)) return { error: "The amount must be between $0 and $50,000." };
  const money = { finalAmountCents: dollars == null ? null : Math.round(dollars * 100), noCharge: dollars === 0 };
  if (opts.fromOnSite) return { completion: { path: "field", resolutionCode, ...money } };
  const evidenceSource = COMPLETION_SOURCES.find((s) => s.source === answers.source)?.source;
  if (!evidenceSource) return { error: "Say how you know: customer, technician, paper ticket or other system." };
  const reason = answers.reason?.trim();
  if (!reason) return { error: "Say why it's recorded this way." };
  return { completion: { path: "correction", evidenceSource, resolutionCode, ...money }, reason };
}

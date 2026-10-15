import { JOB_OUTCOMES, outcomeFromWords, type JobOutcomeCode } from "@/lib/job-outcome";

const SOURCES = [
  { word: "customer", source: "customer_confirmed", label: "the customer confirmed" },
  { word: "tech", source: "technician_report", label: "the technician told me" },
  { word: "paper", source: "paper_ticket", label: "a paper ticket" },
  { word: "system", source: "external_system", label: "our other system" },
] as const;

function outcomeFrom(answer: string): JobOutcomeCode | null {
  const typed = answer.trim().toLowerCase();
  return outcomeFromWords(typed) ?? JOB_OUTCOMES.find((o) => o.label.toLowerCase() === typed || o.code === typed)?.code ?? null;
}

/**
 * What happened, the price or no-charge, and — when the technician never
 * marked on site — how the person knows and why. Null when they back out.
 */
export function askCompletion(opts: { fromOnSite: boolean }): { completion: Record<string, unknown>; reason?: string } | { error: string } | null {
  const said = window.prompt("What happened? For example: fixed, replaced part, installed, maintenance, diagnosed, return visit, declined, no access, referred, no fault.");
  if (said == null) return null;
  const resolutionCode = outcomeFrom(said);
  if (!resolutionCode) return { error: "Pick one of the listed outcomes." };
  const price = window.prompt("Total charged in dollars. 0 for no charge. Leave blank if the work lines on the job already price it.");
  if (price == null) return null;
  const dollars = price.trim() ? Number(price.replace(/[$,]/g, "")) : null;
  if (dollars != null && (!Number.isFinite(dollars) || dollars < 0 || dollars > 50_000)) return { error: "The amount must be between $0 and $50,000." };
  const money = { finalAmountCents: dollars == null ? null : Math.round(dollars * 100), noCharge: dollars === 0 };
  if (opts.fromOnSite) return { completion: { path: "field", resolutionCode, ...money } };

  const how = window.prompt(`Nobody marked the technician on site. How do you know it's done? Type one: ${SOURCES.map((s) => `${s.word} (${s.label})`).join(", ")}.`);
  if (how == null) return null;
  const source = SOURCES.find((s) => how.trim().toLowerCase().startsWith(s.word))?.source;
  if (!source) return { error: "Say how you know: customer, tech, paper or system." };
  const reason = window.prompt("Why record it this way? This goes in the job's history.")?.trim();
  if (!reason) return null;
  return { completion: { path: "correction", evidenceSource: source, resolutionCode, ...money }, reason };
}

/**
 * Small, stable completion vocabulary.
 *
 * This records what happened without pretending we have a diagnostic model.
 * Codes are trade-independent and append-only. The optional technician note
 * carries the detail a later, evidence-backed fault taxonomy can learn from.
 */
export const JOB_OUTCOMES = [
  { code: "repaired", label: "Repaired" },
  { code: "replaced_part", label: "Replaced a part" },
  { code: "installed", label: "Installed or replaced equipment" },
  { code: "maintenance", label: "Maintenance completed" },
  { code: "diagnostic_only", label: "Diagnosed only" },
  { code: "return_visit", label: "Return visit needed" },
  { code: "customer_declined", label: "Customer declined work" },
  { code: "no_access", label: "Could not access property" },
  { code: "referred", label: "Referred elsewhere" },
  { code: "no_fault_found", label: "No fault found" },
] as const;

export type JobOutcomeCode = (typeof JOB_OUTCOMES)[number]["code"];

const OUTCOME_LABELS = new Map<string, string>(
  JOB_OUTCOMES.map((outcome) => [outcome.code, outcome.label]),
);

const OUTCOME_WORDS: [RegExp, JobOutcomeCode][] = [
  [/^(repaired|fixed|repair)$/, "repaired"],
  [/^(replaced|replaced part|part|new part)$/, "replaced_part"],
  [/^(installed|install|new unit)$/, "installed"],
  [/^(maintenance|tune ?up|service)$/, "maintenance"],
  [/^(diagnosed|diagnostic|diag)$/, "diagnostic_only"],
  [/^(return|return visit|coming back)$/, "return_visit"],
  [/^(declined|customer declined)$/, "customer_declined"],
  [/^(no access|locked out)$/, "no_access"],
  [/^(referred|referral)$/, "referred"],
  [/^(no fault|no fault found|nothing wrong)$/, "no_fault_found"],
];

/** The outcome an owner typed in a text ("DONE 450 FIXED"), or null when it isn't one of ours. */
export function outcomeFromWords(words: string): JobOutcomeCode | null {
  const w = words.trim().toLowerCase().replace(/\s+/g, " ");
  return OUTCOME_WORDS.find(([re]) => re.test(w))?.[1] ?? null;
}

export function isJobOutcomeCode(value: unknown): value is JobOutcomeCode {
  return typeof value === "string" && OUTCOME_LABELS.has(value);
}

export function jobOutcomeLabel(value: string | null | undefined) {
  if (!value) return null;
  return OUTCOME_LABELS.get(value) ?? null;
}

export function parseFinalAmountCents(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > 5_000_000) return null;
  return value;
}

export function buildOutcomeEvidence(input: {
  resolutionCode: string | null | undefined;
  resolutionSummary: string | null | undefined;
  finalAmountCents: number | null | undefined;
}) {
  const label = jobOutcomeLabel(input.resolutionCode);
  if (!label) return null;
  return {
    outcome: label,
    note: input.resolutionSummary?.trim() || null,
    finalAmountCents: input.finalAmountCents ?? null,
  };
}

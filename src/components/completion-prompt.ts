import { askChoice, askText } from "@/components/ask-dialog";
import { COMPLETION_SOURCES, readCompletion, type CompletionAsk } from "@/lib/completion-answers";
import { JOB_OUTCOMES } from "@/lib/job-outcome";

/**
 * What happened, the price or no-charge, and — when the technician never
 * marked on site — how the person knows and why. Null when they back out.
 */
export async function askCompletion(opts: { fromOnSite: boolean }): Promise<CompletionAsk | null> {
  const resolutionCode = await askChoice({
    title: "Mark this job done",
    label: "What happened?",
    choices: JOB_OUTCOMES.map((o) => ({ value: o.code, label: o.label })),
    confirmLabel: "Next",
  });
  if (resolutionCode == null) return null;
  const price = await askText({
    title: "What was charged?",
    body: "0 for no charge. Leave blank if the work lines on the job already price it.",
    label: "Total charged, in dollars",
    inputMode: "decimal",
    placeholder: "0.00",
    confirmLabel: opts.fromOnSite ? "Mark done" : "Next",
  });
  if (price == null) return null;
  if (opts.fromOnSite) return readCompletion({ resolutionCode, price }, opts);
  const priced = readCompletion({ resolutionCode, price }, { fromOnSite: true });
  if ("error" in priced) return priced;

  const source = await askChoice({
    title: "How do you know it's done?",
    body: "Nobody marked the technician on site.",
    label: "How you know",
    choices: COMPLETION_SOURCES.map((s) => ({ value: s.source, label: s.label })),
    confirmLabel: "Next",
  });
  if (source == null) return null;
  const reason = await askText({
    title: "Why record it this way?",
    body: "This goes in the job's history.",
    label: "Reason",
    multiline: true,
    required: true,
    confirmLabel: "Mark done",
  });
  if (reason == null) return null;
  return readCompletion({ resolutionCode, price, source, reason }, opts);
}

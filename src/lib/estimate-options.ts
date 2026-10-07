import { z } from "zod";

export const ESTIMATE_OPTION_KEYS = ["good", "better", "best"] as const;
export type EstimateOptionKey = (typeof ESTIMATE_OPTION_KEYS)[number];

export const DEFAULT_OPTION_LABELS: Record<EstimateOptionKey, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

export type EstimateOption = {
  key: EstimateOptionKey;
  label: string;
  description: string | null;
  amountCents: number;
};

export const estimateOptionInput = z.object({
  label: z.string().trim().max(40).optional(),
  description: z.string().trim().max(400).optional(),
  amountCents: z.number().int().min(1000).max(5_000_000),
});

/** Two or three choices, in the order the customer reads them. */
export const estimateOptionsInput = z.array(estimateOptionInput).min(2).max(3);

export function buildEstimateOptions(input: z.infer<typeof estimateOptionsInput>): EstimateOption[] {
  return input.map((option, i) => {
    const key = ESTIMATE_OPTION_KEYS[i]!;
    return {
      key,
      label: option.label?.trim() || DEFAULT_OPTION_LABELS[key],
      description: option.description?.trim() || null,
      amountCents: option.amountCents,
    };
  });
}

/** Stored JSON that fails to parse reads as a single-price estimate, never as a broken one. */
export function parseEstimateOptions(json: string | null | undefined): EstimateOption[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((o): EstimateOption[] => {
      if (!o || typeof o !== "object") return [];
      const key = ESTIMATE_OPTION_KEYS.find((k) => k === o.key);
      const amountCents = Number(o.amountCents);
      if (!key || !Number.isInteger(amountCents) || amountCents <= 0) return [];
      return [
        {
          key,
          label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : DEFAULT_OPTION_LABELS[key],
          description: typeof o.description === "string" && o.description.trim() ? o.description.trim() : null,
          amountCents,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Before the customer picks, the estimate's amount is the lowest option, so totals never overstate it. */
export function startingAmountCents(options: EstimateOption[]): number {
  return Math.min(...options.map((o) => o.amountCents));
}

export function findOption(options: EstimateOption[], key: string | null | undefined): EstimateOption | null {
  if (!key) return null;
  return options.find((o) => o.key === key) ?? null;
}

/** "Estimate · $1,900 · Best", or "Estimate · 3 options from $450" before the customer picks. */
export function estimateTitle(
  estimate: { amountCents: number; optionsJson?: string | null; chosenOption?: string | null },
  money: (cents: number) => string,
): string {
  const options = parseEstimateOptions(estimate.optionsJson);
  if (!options.length) return `Estimate · ${money(estimate.amountCents)}`;
  const chosen = findOption(options, estimate.chosenOption);
  return chosen
    ? `Estimate · ${money(chosen.amountCents)} · ${chosen.label}`
    : `Estimate · ${options.length} options from ${money(startingAmountCents(options))}`;
}

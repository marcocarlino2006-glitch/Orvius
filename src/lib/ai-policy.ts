/**
 * One model policy for every AI surface.
 *
 * Model names used to be scattered across provisioning, settings sync, voice,
 * and Ask. That makes a rollout impossible to evaluate or roll back as one
 * system. A model change is now a policy change with an environment override,
 * not a search-and-replace.
 */
export const AI_POLICY_VERSION = "2026-09-09";

export type AiTask = "receptionist" | "shop_answer";

export type AiModelPolicy = {
  task: AiTask;
  provider: "openai";
  model: string;
  /** What this tier is allowed to do; useful in logs/evals and review. */
  risk: "customer_voice" | "grounded_read_only";
  envOverride: string;
};

const DEFAULTS: Record<AiTask, Omit<AiModelPolicy, "task">> = {
  receptionist: {
    provider: "openai",
    // Keep the currently certified voice model until a candidate beats it in
    // the receptionist eval. "Newest" is not a safety or conversion metric.
    model: "gpt-4o",
    risk: "customer_voice",
    envOverride: "ORVIUS_AI_RECEPTIONIST_MODEL",
  },
  shop_answer: {
    provider: "openai",
    model: "gpt-4o-mini",
    risk: "grounded_read_only",
    envOverride: "ORVIUS_AI_SHOP_ANSWER_MODEL",
  },
};

export function getAiModelPolicy(task: AiTask): AiModelPolicy {
  const policy = DEFAULTS[task];
  const override = process.env[policy.envOverride]?.trim();
  return {
    task,
    ...policy,
    model: override || policy.model,
  };
}

export const TRANSCRIPTION_POLICY = {
  provider: "deepgram" as const,
  model: "nova-2",
  envOverride: "ORVIUS_AI_TRANSCRIBER_MODEL",
};

export function getTranscriptionModel() {
  return (
    process.env[TRANSCRIPTION_POLICY.envOverride]?.trim() ||
    TRANSCRIPTION_POLICY.model
  );
}

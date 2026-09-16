import type {
  PipelineProofStage,
  ShiftEvent,
} from "@/lib/shift-timeline";

export type PipelineProofItem = {
  id: PipelineProofStage;
  label: string;
  state: "proven" | "waiting" | "optional";
};

const STAGES: Array<{ id: PipelineProofStage; label: string }> = [
  { id: "call", label: "Call" },
  { id: "lead", label: "Qualified" },
  { id: "job", label: "Booked" },
  { id: "alert", label: "Alerted" },
  { id: "money", label: "Money" },
];

/**
 * A proof state can only turn green from a measured lifecycle record.
 * Deposits remain optional for shops that have not enabled money collection.
 */
export function buildPipelineProof(
  events: ShiftEvent[],
  moneyEnabled: boolean,
): PipelineProofItem[] {
  const proven = new Set(events.flatMap((event) => event.proves));

  return STAGES.map((stage) => ({
    ...stage,
    state: proven.has(stage.id)
      ? "proven"
      : stage.id === "money" && !moneyEnabled
        ? "optional"
        : "waiting",
  }));
}

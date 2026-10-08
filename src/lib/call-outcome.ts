import { isEmergency } from "@/lib/urgency";

/** What happened on the phone, as one of five outcomes the owner can act on. */
export const CALL_OUTCOMES = ["booked", "held", "transferred", "incomplete", "safety"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  booked: "Booked",
  held: "Held for review",
  transferred: "Transferred",
  incomplete: "Incomplete",
  safety: "Safety escalation",
};

export type CallOutcomeInput = {
  status: string;
  booked: boolean;
  durationSec: number | null;
  endedReason?: string | null;
  lead: { urgency: string | null; job?: { id: string } | null } | null;
  /** Orvius recorded a safety escalation on this call's request. */
  escalated?: boolean;
};

const DROPPED = new Set(["failed", "busy", "no-answer", "canceled", "cancelled"]);

/** Order matters: a safety call that was also transferred is still a safety call. */
export function callOutcome(call: CallOutcomeInput): CallOutcome {
  const status = call.status.trim().toLowerCase();
  if (call.escalated || (isEmergency(call.lead?.urgency) && !call.booked && !call.lead?.job)) return "safety";
  if (call.booked || call.lead?.job) return "booked";
  if (call.endedReason && /forward|transfer/i.test(call.endedReason)) return "transferred";
  if (DROPPED.has(status) || status === "in-progress" || status === "ringing") return "incomplete";
  if (!call.lead || (call.durationSec != null && call.durationSec < 15)) return "incomplete";
  return "held";
}

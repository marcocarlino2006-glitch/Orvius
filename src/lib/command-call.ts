import { CALL_OUTCOME_LABEL, callOutcome, type CallOutcome } from "@/lib/call-outcome";

/** The call Command can show without loading the transcript or the recording. */
export type CommandCall = {
  id: string;
  status: string;
  callerPhone?: string | null;
  summary?: string | null;
  booked?: boolean;
  durationSec?: number | null;
  endedReason?: string | null;
  leadName?: string | null;
  serviceType?: string | null;
  leadPhone?: string | null;
  urgency?: string | null;
  address?: string | null;
  hasLead?: boolean;
  job?: { id: string; title: string; status: string; scheduledAt: string | null } | null;
};

export type CommandCallLink = { href: string; label: string };

/** One paragraph. A long write-up stays on the call. */
export function commandCallSummary(summary: string | null | undefined): string | null {
  const text = summary?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  if (text.length <= 280) return text;
  const cut = text.slice(0, 277);
  const space = cut.lastIndexOf(" ");
  return `${(space > 180 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function commandCallOutcome(call: CommandCall): CallOutcome {
  return callOutcome({
    status: call.status,
    booked: Boolean(call.booked && call.job),
    durationSec: call.durationSec ?? null,
    endedReason: call.endedReason ?? null,
    lead: call.hasLead ? { urgency: call.urgency ?? null, job: call.job ? { id: call.job.id } : null } : null,
  });
}

/** Booked work opens the job. Anything still open calls them back. A live call opens itself. */
export function commandCallActions(call: CommandCall, live: boolean): { primary: CommandCallLink; secondary: CommandCallLink | null } {
  const open = { href: `/dashboard/calls/${call.id}`, label: "Open the call" };
  const phone = (call.leadPhone || call.callerPhone || "").trim();
  const callBack = phone ? { href: `tel:${phone}`, label: "Call back" } : null;
  if (live) return { primary: open, secondary: null };
  if (call.job && commandCallOutcome(call) === "booked") {
    return { primary: { href: `/dashboard/jobs/${call.job.id}`, label: "Open the job" }, secondary: callBack };
  }
  if (callBack) return { primary: callBack, secondary: open };
  return { primary: open, secondary: null };
}

export function commandCallPhone(call: CommandCall): string | null {
  const raw = (call.leadPhone || call.callerPhone || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return raw;
}

export function commandCallOutcomeLine(call: CommandCall, live: boolean): string | null {
  if (live) return null;
  return CALL_OUTCOME_LABEL[commandCallOutcome(call)];
}

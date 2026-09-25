import { formatShopTime } from "@/lib/availability";
import { getAppBaseUrl, getLeadInboxUrl } from "@/lib/domains";

export type OwnerAlertLead = {
  name?: string | null;
  phone?: string | null;
  serviceType?: string | null;
  urgency?: string | null;
  address?: string | null;
};

function formatUrgencyLabel(urgency?: string | null): string | null {
  if (!urgency?.trim()) return null;
  const key = urgency.toLowerCase().replace(/\s+/g, "-");
  if (key.includes("emergency")) return "Emergency";
  if (key.includes("same-day") || key.includes("today")) return "Same day";
  if (key.includes("this-week")) return "This week";
  if (key.includes("flexible")) return "Flexible";
  return urgency.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSchedule(iso: string | Date | null | undefined, timezone: string): string | null {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatShopTime(date, timezone);
}

export function getOwnerAlertOpenUrl(params: {
  leadId?: string;
  jobId?: string;
}): string | null {
  if (params.jobId) {
    return `${getAppBaseUrl()}/dashboard/jobs/${params.jobId}`;
  }
  if (params.leadId) {
    return getLeadInboxUrl(params.leadId);
  }
  return null;
}

export type OwnerAlertContext = {
  skipReason?: string | null;
  intent?: "complaint" | "cancel" | "reschedule" | "status" | "new" | null;
  /** Number the caller gave, when it differs from caller ID — one of them was captured wrong. */
  callerId?: string | null;
  existingJob?: { title?: string | null; scheduledAt?: Date | string | null } | null;
  wantsHuman?: boolean;
  /** Caller hung up before saying anything — often a homeowner who does not want to talk to AI. */
  silentHangup?: boolean;
  /** Already-formatted warning about commitments the receptionist voiced. */
  promiseWarning?: string | null;
  summary?: string | null;
  timezone: string;
};

function firstSentence(text: string, max = 80): string {
  const sentence = text.trim().split(/(?<=[.!?])\s/)[0] ?? "";
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** One line telling the owner what the call was actually about when it is not a clean new booking. */
export function ownerAlertContextLine(context: OwnerAlertContext): string | null {
  const { skipReason, intent, existingJob, wantsHuman } = context;
  const jobName = existingJob?.title?.trim() || "appointment";
  const when = formatSchedule(existingJob?.scheduledAt ?? null, context.timezone);
  const jobRef = when ? `${jobName} on ${when}` : jobName;

  let line: string | null = null;
  if (context.silentHangup) {
    line = "Hung up without saying anything · worth a call back if the number looks real";
  } else if (skipReason === "complaint") {
    line = "Unhappy about a past visit or bill · call them yourself — not booked";
  } else if (skipReason === "existing_job" && existingJob) {
    if (intent === "cancel") line = `Wants to cancel the ${jobRef}. Not cancelled yet — call to confirm.`;
    else if (intent === "reschedule") line = `Wants to move the ${jobRef}. Not moved yet — call to pick a time.`;
    else if (intent === "status") line = `Asking about their ${jobRef}. No new job created.`;
    else line = `Called again about the job already booked (${jobRef}). No new job created.`;
  } else if (skipReason === "follow_up") {
    const verb = intent === "cancel" ? "cancel" : intent === "reschedule" ? "reschedule" : "check on";
    line = `Wants to ${verb} an appointment, but no open job matches this number — call back.`;
  } else if (skipReason === "out_of_area") {
    line = "Outside your service area · not booked";
  } else if (skipReason === "missing_address") {
    line = "No address yet · call back to finish booking";
  } else if (skipReason === "capacity_unavailable") {
    line = "No open slot on the board · call back to schedule";
  }

  if (wantsHuman) {
    const ask = "Asked for a person · call back";
    line = line ? `${line}\n${ask}` : ask;
  }
  if (context.callerId) {
    const check = `Called from ${context.callerId} · confirm which number is right`;
    line = line ? `${line}\n${check}` : check;
  }
  if (context.promiseWarning) {
    line = line ? `${line}\n${context.promiseWarning}` : context.promiseWarning;
  }
  return line;
}

/** Lock-screen friendly owner alert — matches homepage OwnerAlertCard story. */
export function buildOwnerLeadAlertMessage(params: {
  lead: OwnerAlertLead;
  job?: {
    scheduledAt?: Date | string | null;
    customerConfirmedAt?: Date | string | null;
  } | null;
  autoBooked?: boolean;
  /** Shop IANA zone — the server runs in UTC, so times must be rendered in the shop's zone. */
  timezone: string;
  context?: Omit<OwnerAlertContext, "timezone">;
}): string {
  const { lead, job, autoBooked, timezone } = params;
  const context = params.context ? { ...params.context, timezone } : undefined;
  const urgency = formatUrgencyLabel(lead.urgency);
  const service = lead.serviceType?.trim() || (context?.summary ? firstSentence(context.summary) : "");
  const name = lead.name?.trim();
  const address = lead.address?.trim();
  const phone = lead.phone?.trim();
  const schedule = formatSchedule(job?.scheduledAt ?? null, timezone);
  const customerConfirmed = Boolean(job?.customerConfirmedAt);

  const headline = [urgency, service].filter(Boolean).join(" · ") || "New lead";
  const who = name ?? phone ?? "Unknown caller";
  const contextLine = context ? ownerAlertContextLine(context) : null;

  let bookingLine: string | null = null;
  if (autoBooked) {
    if (customerConfirmed && schedule) {
      bookingLine = `Confirmed appointment · ${schedule}`;
    } else if (schedule) {
      bookingLine = `Proposed window · ${schedule} (awaiting customer confirm)`;
    } else {
      bookingLine = "Job on board · awaiting customer confirm";
    }
  }

  const lines = [
    headline,
    contextLine,
    who,
    address ?? null,
    phone && name ? phone : null,
    bookingLine,
  ].filter(Boolean);

  return lines.join("\n");
}

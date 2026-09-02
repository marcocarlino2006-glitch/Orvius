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

function formatSchedule(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

/** Lock-screen friendly owner alert — matches homepage OwnerAlertCard story. */
export function buildOwnerLeadAlertMessage(params: {
  lead: OwnerAlertLead;
  job?: { scheduledAt?: Date | string | null } | null;
  autoBooked?: boolean;
}): string {
  const { lead, job, autoBooked } = params;
  const urgency = formatUrgencyLabel(lead.urgency);
  const service = lead.serviceType?.trim();
  const name = lead.name?.trim();
  const address = lead.address?.trim();
  const phone = lead.phone?.trim();
  const schedule = formatSchedule(job?.scheduledAt ?? null);

  const headline = [urgency, service].filter(Boolean).join(" · ") || "New lead";
  const who = name ?? phone ?? "Unknown caller";

  const lines = [
    headline,
    who,
    address ?? null,
    phone && name ? phone : null,
    autoBooked && schedule ? `Job booked · ${schedule}` : autoBooked ? "Job booked on dispatch" : null,
  ].filter(Boolean);

  return lines.join("\n");
}

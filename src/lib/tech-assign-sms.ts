import { getAppBaseUrl } from "@/lib/domains";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

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

export type TechAssignJob = {
  id: string;
  title: string;
  address?: string | null;
  scheduledAt?: Date | string | null;
  urgency?: string | null;
  serviceType?: string | null;
  customer?: { name?: string | null; phone?: string | null } | null;
  lead?: { name?: string | null; phone?: string | null } | null;
  business?: { name?: string | null } | null;
  /** Prefer magic field link when present. */
  techToken?: string | null;
};

/** Short SMS for a tech when a job is assigned to them. */
export function buildTechJobAssignMessage(job: TechAssignJob): string {
  const shop = job.business?.name?.trim() || "Shop";
  const who =
    job.customer?.name?.trim() ||
    job.lead?.name?.trim() ||
    job.customer?.phone?.trim() ||
    job.lead?.phone?.trim() ||
    "Customer";
  const phone = job.customer?.phone?.trim() || job.lead?.phone?.trim() || null;
  const address = job.address?.trim() || null;
  const when = formatSchedule(job.scheduledAt ?? null);
  const urgency = job.urgency?.toLowerCase().includes("emergency")
    ? "Emergency"
    : null;
  const openUrl = job.techToken
    ? `${getAppBaseUrl()}/t/${job.techToken}`
    : `${getAppBaseUrl()}/dashboard/jobs/${job.id}`;

  const lines = [
    `${shop}: new job assigned`,
    [urgency, job.title].filter(Boolean).join(" · "),
    who,
    address,
    phone ? `Callback ${phone}` : null,
    when ? `When: ${when}` : null,
    `Open: ${openUrl}`,
  ].filter(Boolean);

  return withSmsOptOutFooter(lines.join("\n"));
}

import { isEmergency } from "@/lib/urgency";

export type LeadNextAction =
  | { kind: "view_job"; label: "View job"; jobId: string }
  | { kind: "call"; label: "Call now" | "Call back"; phone: string }
  | { kind: "book"; label: "Book job" }
  | { kind: "review"; label: "Review" };

/**
 * The single thing an owner should do with one opportunity. Everything else
 * (text, mark contacted, open the full record) lives in the record drawer.
 */
export function leadNextAction(lead: {
  status: string;
  urgency: string | null;
  phone: string | null;
  address: string | null;
  jobId: string | null;
}): LeadNextAction {
  if (lead.jobId) return { kind: "view_job", label: "View job", jobId: lead.jobId };
  if (lead.status === "lost" || lead.status === "spam") return { kind: "review", label: "Review" };
  if (lead.phone && isEmergency(lead.urgency) && lead.status === "new") {
    return { kind: "call", label: "Call now", phone: lead.phone };
  }
  if (lead.address) return { kind: "book", label: "Book job" };
  if (lead.phone) return { kind: "call", label: "Call back", phone: lead.phone };
  return { kind: "review", label: "Review" };
}

import { isEmergency } from "@/lib/urgency";

/**
 * Inbox holds work that has not become a job. Every request sits in exactly
 * one of four places, so the filters never show the same item twice.
 */
export const INBOX_VIEWS = ["new", "waiting", "person", "resolved"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export const INBOX_VIEW_LABEL: Record<InboxView, string> = {
  new: "New",
  waiting: "Waiting on customer",
  person: "Needs a person",
  resolved: "Resolved",
};

export type InboxLeadInput = {
  status: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  serviceType: string | null;
  urgency: string | null;
  source: string;
  createdAt: Date;
  firstContactedAt: Date | null;
  followUpSentAt: Date | null;
  followUpRepliedAt: Date | null;
  job: { id: string; status: string } | null;
  /** Orvius held it for a person on the call (safety, complaint, out of scope). */
  escalated: boolean;
  /** Someone took over the conversation and hasn't released it. */
  takenOver: boolean;
  /** The latest text in the thread, if there is one. */
  lastMessage: { direction: string; createdAt: Date; readAt: Date | null } | null;
};

export type InboxFacts = {
  view: InboxView;
  /** Why it sits where it does, in a few words. */
  reason: string;
  missing: string[];
  lastContact: { label: string; at: string };
};

const RESOLVED_REASON: Record<string, string> = {
  booked: "Booked — now a job",
  lost: "Closed without booking",
  spam: "Marked spam",
};

export function missingDetails(lead: Pick<InboxLeadInput, "name" | "phone" | "address" | "serviceType">): string[] {
  const out: string[] = [];
  if (!lead.name?.trim()) out.push("name");
  if (!lead.phone?.trim()) out.push("callback number");
  if (!lead.address?.trim()) out.push("address");
  if (!lead.serviceType?.trim()) out.push("what they need");
  return out;
}

function lastContact(lead: InboxLeadInput): InboxFacts["lastContact"] {
  const candidates: Array<{ label: string; at: Date }> = [
    { label: lead.source === "sms" ? "Texted in" : lead.source === "web" || lead.source === "chat" ? "Wrote in" : "Called in", at: lead.createdAt },
  ];
  if (lead.firstContactedAt) candidates.push({ label: "You reached out", at: lead.firstContactedAt });
  if (lead.followUpSentAt) candidates.push({ label: "Follow-up text sent", at: lead.followUpSentAt });
  if (lead.followUpRepliedAt) candidates.push({ label: "Customer replied", at: lead.followUpRepliedAt });
  if (lead.lastMessage) {
    candidates.push({
      label: lead.lastMessage.direction === "in" ? "Customer texted" : "Text sent",
      at: lead.lastMessage.createdAt,
    });
  }
  const latest = candidates.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a));
  return { label: latest.label, at: latest.at.toISOString() };
}

export function inboxFacts(lead: InboxLeadInput): InboxFacts {
  const missing = missingDetails(lead);
  const contact = lastContact(lead);
  const make = (view: InboxView, reason: string): InboxFacts => ({ view, reason, missing, lastContact: contact });

  if (lead.status === "booked" || lead.status === "lost" || lead.status === "spam" || lead.job) {
    return make("resolved", lead.job && lead.status !== "lost" && lead.status !== "spam" ? RESOLVED_REASON.booked : RESOLVED_REASON[lead.status] ?? "Resolved");
  }

  const customerWaiting =
    (lead.lastMessage?.direction === "in" && !lead.lastMessage.readAt) ||
    (lead.followUpRepliedAt != null && (!lead.lastMessage || lead.lastMessage.direction === "in"));
  if (lead.escalated) return make("person", "Held for a person on the call");
  if (isEmergency(lead.urgency)) return make("person", "Urgent — call them back");
  if (lead.takenOver) return make("person", "Someone took this over");
  if (customerWaiting) return make("person", "Customer texted back");
  if (!lead.phone?.trim()) return make("person", "No callback number");

  if (lead.status === "contacted" || lead.followUpSentAt) {
    return make("waiting", lead.followUpSentAt ? "Follow-up sent, no reply yet" : "Reached out, no reply yet");
  }
  return make("new", missing.length ? `Needs ${missing.join(", ")}` : "Ready to book");
}

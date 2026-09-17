export type AttentionKind =
  | "urgent_lead"
  | "new_lead"
  | "needs_qualify"
  | "needs_booking"
  | "needs_customer_confirm"
  | "alert_failed"
  | "overdue_followup"
  | "unassigned_job"
  | "appointment_at_risk"
  | "available_tech"
  | "missing_baseline"
  | "stale_weekly_proof"
  | "billing_action"
  | "founder_cert"
  | "needs_capture"
  | "open_invoice"
  | "open_estimate"
  | "wants_human"
  | "not_a_job"
  | "partial_capture"
  | "alert_unacked";

export type AttentionImpact = "critical" | "high" | "med";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  rank: number;
  impact: AttentionImpact;
  title: string;
  detail: string;
  recommendedAction: string;
  href: string;
  entityType: "lead" | "job" | "technician" | "shop";
  entityId: string;
  createdAt: string;
  estimatedRevenueCents?: number | null;
  /**
   * Who this row is about, so one customer with several open jobs cannot take
   * over the board. Shop-level rows (billing, proof, setup) carry no group.
   */
  group?: { key: string; label: string; href?: string };
  /** Rows for the same person folded behind this one. */
  rolledUp?: number;
  meta?: {
    urgency?: string | null;
    address?: string | null;
    scheduledAt?: string | null;
    phone?: string | null;
    status?: string | null;
  };
};

export function attentionKindLabel(kind: AttentionKind): string {
  switch (kind) {
    case "urgent_lead":
      return "Urgent";
    case "new_lead":
      return "New lead";
    case "needs_qualify":
      return "Qualify";
    case "needs_booking":
      return "Book";
    case "needs_customer_confirm":
      return "Confirm";
    case "alert_failed":
      return "Alert failed";
    case "overdue_followup":
      return "Follow up";
    case "unassigned_job":
      return "Unassigned";
    case "appointment_at_risk":
      return "At risk";
    case "available_tech":
      return "Crew free";
    case "missing_baseline":
      return "Baseline";
    case "stale_weekly_proof":
      return "Proof";
    case "billing_action":
      return "Billing";
    case "founder_cert":
      return "Cert";
    case "needs_capture":
      return "Capture";
    case "open_invoice":
      return "Invoice";
    case "open_estimate":
      return "Estimate";
    case "wants_human":
      return "Wants you";
    case "not_a_job":
      return "Not a job";
    case "partial_capture":
      return "Partial";
    case "alert_unacked":
      return "Unacked";
  }
}

/**
 * Every board kind must resolve to a one-tap strategy.
 * Craft gates fail if a new kind ships without an owner action.
 */
export type AttentionActionStrategy =
  | "call"
  | "book"
  | "assign"
  | "proof"
  | "test_alert"
  | "text_confirm"
  | "advance_status"
  | "open"
  | "dismiss";

export function attentionActionStrategy(kind: AttentionKind): AttentionActionStrategy {
  switch (kind) {
    case "urgent_lead":
    case "new_lead":
    case "needs_qualify":
    case "overdue_followup":
    case "wants_human":
    case "partial_capture":
    case "alert_unacked":
      return "call";
    case "needs_booking":
      return "book";
    case "unassigned_job":
      return "assign";
    case "stale_weekly_proof":
      return "proof";
    case "alert_failed":
      return "test_alert";
    case "needs_customer_confirm":
      return "text_confirm";
    case "appointment_at_risk":
      return "advance_status";
    case "not_a_job":
      return "dismiss";
    case "available_tech":
    case "needs_capture":
    case "missing_baseline":
    case "billing_action":
    case "founder_cert":
    case "open_invoice":
    case "open_estimate":
      return "open";
  }
}

export const ATTENTION_KINDS: AttentionKind[] = [
  "urgent_lead",
  "new_lead",
  "needs_qualify",
  "needs_booking",
  "needs_customer_confirm",
  "alert_failed",
  "overdue_followup",
  "unassigned_job",
  "appointment_at_risk",
  "available_tech",
  "missing_baseline",
  "stale_weekly_proof",
  "billing_action",
  "founder_cert",
  "needs_capture",
  "open_invoice",
  "open_estimate",
  "wants_human",
  "not_a_job",
  "partial_capture",
  "alert_unacked",
];


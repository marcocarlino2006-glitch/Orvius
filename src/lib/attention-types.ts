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
  | "open_estimate";

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
  }
}

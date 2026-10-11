/** What changed about a shop leaving, read from one Stripe subscription sync. Pure. */

export const CANCEL_REASON_LABEL: Record<string, string> = {
  too_expensive: "Too expensive",
  unused: "Not using it",
  missing_features: "Missing features",
  switched_service: "Switched to another service",
  too_complex: "Too complicated",
  low_quality: "Quality",
  customer_service: "Support",
  other: "Other",
  payment_failed: "Card kept failing",
  payment_disputed: "Payment disputed",
  cancellation_requested: "No reason given",
};

export function cancelReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "No reason given";
  return CANCEL_REASON_LABEL[reason] ?? reason.replace(/_/g, " ");
}

type CancellationDetails = {
  feedback?: string | null;
  reason?: string | null;
  comment?: string | null;
} | null | undefined;

/** The owner's own answer beats Stripe's mechanical reason. */
export function cancelReasonFrom(details: CancellationDetails): { reason: string | null; comment: string | null } {
  const reason = details?.feedback || details?.reason || null;
  const comment = details?.comment?.trim().slice(0, 500) || null;
  return { reason, comment };
}

export type CancelState = { billingStatus: string | null; planEndsAt: Date | null };

export type CancelEvent = "scheduled" | "ended_now" | "kept" | null;

/**
 * scheduled  the plan was renewing and is now set to end.
 * ended_now  a paying plan stopped without a scheduled end first (a dashboard cancel, failed cards).
 *            An abandoned first checkout also lands as canceled and is not a shop leaving.
 * kept       a scheduled end was called off and the plan renews.
 * A scheduled plan reaching its end date is not a new event: it was signalled when it was scheduled.
 */
export function cancelEvent(before: CancelState, after: CancelState): CancelEvent {
  const wasEnding = Boolean(before.planEndsAt);
  const wasCanceled = before.billingStatus === "canceled";
  const wasPaying = before.billingStatus === "active" || before.billingStatus === "past_due";
  if (after.billingStatus === "canceled") return wasPaying && !wasCanceled && !wasEnding ? "ended_now" : null;
  if (after.planEndsAt && !wasEnding) return "scheduled";
  if (!after.planEndsAt && wasEnding && after.billingStatus === "active") return "kept";
  return null;
}

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function founderCancelText(input: {
  shopName: string;
  event: "scheduled" | "ended_now";
  reason: string | null;
  comment: string | null;
  planName: string | null;
  monthlyCents: number;
  endsAt: Date | null;
  ownerEmail: string | null;
}): string {
  const what =
    input.event === "scheduled"
      ? `set to cancel${input.endsAt ? `, ends ${dateText(input.endsAt)}` : ""}`
      : "canceled, line stopped";
  const money = input.monthlyCents > 0 ? ` · $${Math.round(input.monthlyCents / 100)}/mo` : "";
  const plan = input.planName ? ` · ${input.planName}` : "";
  const said = input.comment ? ` · "${input.comment}"` : "";
  const reach = input.ownerEmail ? ` · ${input.ownerEmail}` : "";
  return `Orvius: ${input.shopName} ${what}${plan}${money}. Why: ${cancelReasonLabel(input.reason)}${said}${reach}`;
}

export function cancelReasonCounts(rows: Array<{ reason: string | null }>): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = cancelReasonLabel(row.reason);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function cancelReasonText(rows: Array<{ reason: string; count: number }>): string {
  return rows.length ? rows.map((r) => `${r.reason} ${r.count}`).join(" · ") : "none";
}

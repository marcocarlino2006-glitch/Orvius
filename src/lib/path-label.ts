import { formatBeat } from "@/lib/when";

/** The path the owner reads. A booked time replaces the word "Booked". An open bill is the amount. */
export function shownBeatLabel(
  beat: { key: string; label: string; state: string },
  item: { scheduledAt: string | null; amountLabel: string | null },
  timezone?: string | null,
): string {
  if (beat.key === "booked" && item.scheduledAt) {
    const when = formatBeat(item.scheduledAt, timezone);
    if (when) return when;
  }
  if (beat.key === "bill" && beat.state !== "done" && item.amountLabel) return item.amountLabel;
  return beat.label;
}

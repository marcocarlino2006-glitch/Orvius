import { demandCategoryLabel } from "@/lib/job-taxonomy";
import { formatCentsTidy } from "@/lib/money";

/**
 * One shop's closed jobs. A row from another shop makes the whole line refuse,
 * so two shops' prices can never be printed as one area.
 */
export type ClosedJobRow = {
  businessId: string;
  categoryCode: string | null;
  postalCode: string | null;
  finalAmountCents: number | null;
};

type Group = {
  categoryCode: string | null;
  cents: number;
  count: number;
  zip3: string | null;
};

const zip3Of = (postal: string | null) => (/^\d{5}$/.test(postal ?? "") ? postal!.slice(0, 3) : null);

function jobWords(code: string | null, count: number) {
  const label = code ? demandCategoryLabel(code) : null;
  if (!label) return count === 1 ? "1 job with no job type" : `${count} jobs with no job type`;
  const name = label.charAt(0).toLowerCase() + label.slice(1);
  return count === 1 ? `1 ${name} job` : `${count} ${name} jobs`;
}

function piece(group: Group) {
  const money = formatCentsTidy(group.cents) ?? "$0";
  const area = group.zip3 ? ` near ${group.zip3}xx` : "";
  return `${money} on ${jobWords(group.categoryCode, group.count)}${area}`;
}

function joinPieces(parts: string[]) {
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** What this shop closed, by the job type already on the row. Null when there is no amount, or the rows are not one shop. */
export function closedWeekLine(rows: ClosedJobRow[]): string | null {
  const shops = new Set(rows.map((row) => row.businessId));
  if (shops.size !== 1) return null;
  const counted = rows.filter((row) => typeof row.finalAmountCents === "number" && row.finalAmountCents > 0);
  if (!counted.length) return null;

  const groups = new Map<string, Group>();
  for (const row of counted) {
    const key = row.categoryCode ?? "";
    const zip3 = zip3Of(row.postalCode);
    const group = groups.get(key) ?? { categoryCode: row.categoryCode, cents: 0, count: 0, zip3 };
    group.cents += row.finalAmountCents as number;
    group.count += 1;
    if (group.zip3 !== zip3) group.zip3 = null;
    groups.set(key, group);
  }

  const ordered = [...groups.values()].sort((a, b) => {
    if (!a.categoryCode !== !b.categoryCode) return a.categoryCode ? -1 : 1;
    return b.cents - a.cents;
  });
  const shown = ordered.slice(0, 3);
  const rest = ordered.slice(3);
  const parts = shown.map(piece);
  if (rest.length) {
    const cents = rest.reduce((sum, group) => sum + group.cents, 0);
    const count = rest.reduce((sum, group) => sum + group.count, 0);
    parts.push(`${formatCentsTidy(cents) ?? "$0"} on ${count === 1 ? "1 other job" : `${count} other jobs`}`);
  }
  return `Closed ${joinPieces(parts)}.`;
}

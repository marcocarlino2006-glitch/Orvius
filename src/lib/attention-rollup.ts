/**
 * Board roll-up.
 *
 * One customer with six open jobs would otherwise own the whole command board
 * and push a different customer's emergency off the first screen. Keep that
 * customer's most urgent rows, fold the rest into a count, and leave shop-level
 * rows (billing, weekly proof, setup) alone — they carry no person.
 *
 * No imports here on purpose: this runs in the API path and in a plain node test.
 */

export type RollUpGroup = {
  /** Customer id when known, else the lead or job it came from. */
  key: string;
  label: string;
  href?: string;
};

export type RollUpRow = {
  /** What the row asks for — confirm, assign, follow up. */
  kind?: string;
  group?: RollUpGroup;
  rolledUp?: number;
};

/** Rows one person can hold before the rest fold into a roll-up line. */
export const MAX_ROWS_PER_PERSON = 2;

/**
 * Takes rows already sorted most-urgent-first and returns the same order with
 * each person capped two ways:
 *
 *  - one row per kind, because "confirm Maria" twice reads like a bug and asks
 *    for the same action twice;
 *  - MAX_ROWS_PER_PERSON in total, so a person with five different problems
 *    still cannot own the screen.
 *
 * The last kept row for a person carries `rolledUp` — how many of their rows
 * are folded behind it.
 */
export function rollUpByPerson<T extends RollUpRow>(ranked: T[]): T[] {
  const kept: T[] = [];
  const lastKeptIndex = new Map<string, number>();
  const keptPerPerson = new Map<string, number>();
  const foldedPerPerson = new Map<string, number>();
  const seenKinds = new Set<string>();

  for (const row of ranked) {
    const key = row.group?.key;
    if (!key) {
      kept.push(row);
      continue;
    }

    // The total cap counts rows shown, not rows read: a person whose repeats
    // were folded still gets to show a second, different problem.
    const shown = keptPerPerson.get(key) ?? 0;
    const kindKey = `${key}::${row.kind ?? ""}`;
    const repeatKind = seenKinds.has(kindKey);
    seenKinds.add(kindKey);

    if (shown < MAX_ROWS_PER_PERSON && !repeatKind) {
      keptPerPerson.set(key, shown + 1);
      lastKeptIndex.set(key, kept.length);
      kept.push(row);
      continue;
    }

    foldedPerPerson.set(key, (foldedPerPerson.get(key) ?? 0) + 1);
  }

  // One roll-up line per person, under the last row of theirs on the board.
  for (const [key, folded] of foldedPerPerson) {
    const at = lastKeptIndex.get(key);
    if (at == null || folded < 1) continue;
    kept[at] = { ...kept[at], rolledUp: folded };
  }

  return kept;
}

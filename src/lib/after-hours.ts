/**
 * The hours this product exists for.
 *
 * A shop with a receptionist is covered roughly eight to six on weekdays.
 * Everything outside that is the window where the phone rings out, the caller
 * dials the next shop on the list, and the job is gone — which is the whole
 * reason someone pays us. So it is worth naming precisely and in one place,
 * rather than each screen guessing at its own cutoff.
 *
 * Deliberately read from the viewer's clock, not the shop record's timezone: an
 * owner checking the board is standing in the same hours the callers are, and a
 * label that disagrees with the clock on their wall reads as a bug.
 */
export function isAfterHours(at: Date) {
  const day = at.getDay();
  if (day === 0 || day === 6) return true;
  const hour = at.getHours();
  return hour < 8 || hour >= 18;
}

/*
  Plain-text founder board lines that the browser admin page shares with the
  Monday email, so this file must not import the database.
*/

/** Of shops that signed up in the last 30 days, how far each got toward taking real calls. */
export type Activation = { signedUp: number; lineAnswered: number; numberProven: number };

/** Shops that started paying at least N days ago, and how many are still on a plan. */
export type Retention = Array<{ days: number; started: number; kept: number }>;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const rate = (value: number | null) => (value == null ? "—" : `${value}%`);

export function activationText(a: Activation | undefined) {
  if (!a || !a.signedUp) return "Activation, 30 days: no new shops";
  return `Activation, 30 days: ${a.signedUp} signed up · ${a.lineAnswered} had a call answered on their Orvius line (${rate(pct(a.lineAnswered, a.signedUp))}) · ${a.numberProven} proved their own number reaches Orvius (${rate(pct(a.numberProven, a.signedUp))})`;
}

export function retentionText(r: Retention | undefined) {
  const parts = (r ?? []).filter((c) => c.started > 0).map((c) => `${c.days} days: ${c.kept} of ${c.started} still paying (${rate(pct(c.kept, c.started))})`);
  return parts.length ? `Retention since first payment · ${parts.join(" · ")}` : "Retention since first payment: no shop has paid long enough to measure";
}

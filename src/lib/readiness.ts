/**
 * Readiness, stated three ways so one green word never stands in for all of
 * them: configured (it is set up), verified (it has worked at least once,
 * end to end) and healthy now (recent evidence says it still works). "The
 * Orvius number answers" and "your number's forwarding is not proven" are
 * different facts, and so are "alerts have been delivered" and "alerts are
 * being delivered".
 */

/** true = yes, false = no / failing, null = no recent evidence either way. */
export type ReadinessMark = { ok: boolean | null; text: string };

export type ReadinessRow = {
  id: "line" | "forwarding" | "alerts";
  label: string;
  /** The one-line answer: what works right now. */
  summary: string;
  configured: ReadinessMark;
  verified: ReadinessMark;
  healthy: ReadinessMark;
  tone: "ok" | "attention" | "risk" | "neutral";
  action: "test_call" | "forward_test" | "test_alert" | "fix_alerts" | null;
};

export type ReadinessInput = {
  line: string | null;
  lineVerifiedAt: string | null;
  lastCallAt: string | null;
  forwardConfirmedAt?: string | null;
  forwardProvenAt?: string | null;
  lastForwardTest?: { state: string; at: string } | null;
  alertsReachable: boolean;
  lastAlertAt: string | null;
  lastFailedAlertAt?: string | null;
  failedAlerts24h: number;
  stuckPendingAlerts: number;
};

/** How long a success counts as current evidence. */
export const FRESH_EVIDENCE_DAYS = 7;
const DAY = 86_400_000;

/** Clock skew a timestamp may run ahead of now before it is treated as bad evidence. */
const SKEW_MS = 5 * 60_000;

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/** A timestamp from the future or one that doesn't parse proves nothing about the past or the present. */
function evidence(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t <= now + SKEW_MS ? iso : null;
}

function credible(input: ReadinessInput, now: number): ReadinessInput {
  return {
    ...input,
    lineVerifiedAt: evidence(input.lineVerifiedAt, now),
    lastCallAt: evidence(input.lastCallAt, now),
    forwardConfirmedAt: evidence(input.forwardConfirmedAt, now),
    forwardProvenAt: evidence(input.forwardProvenAt, now),
    lastForwardTest: input.lastForwardTest && evidence(input.lastForwardTest.at, now) ? input.lastForwardTest : null,
    lastAlertAt: evidence(input.lastAlertAt, now),
    // A failure is never discarded: an unreadable failure time still counts as the latest thing that happened.
    lastFailedAlertAt: input.lastFailedAlertAt ? (evidence(input.lastFailedAlertAt, now) ?? new Date(now).toISOString()) : null,
  };
}
const fresh = (iso: string | null | undefined, now: number) => Boolean(iso) && now - time(iso) <= FRESH_EVIDENCE_DAYS * DAY;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function age(iso: string, now: number): string {
  const days = Math.floor((now - time(iso)) / DAY);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor((now - time(iso)) / 3_600_000);
  return hours >= 1 ? `${hours}h ago` : "just now";
}

function tone(row: Pick<ReadinessRow, "configured" | "verified" | "healthy">): ReadinessRow["tone"] {
  if (row.healthy.ok === false || row.configured.ok === false) return "risk";
  if (row.verified.ok !== true || row.healthy.ok !== true) return "attention";
  return "ok";
}

export function lineReadiness(raw: ReadinessInput, now = Date.now()): ReadinessRow {
  const input = credible(raw, now);
  const configured: ReadinessMark = input.line
    ? { ok: true, text: "Orvius number assigned" }
    : { ok: false, text: "No Orvius number yet" };
  const verified: ReadinessMark = input.lineVerifiedAt
    ? { ok: true, text: `Test call answered ${day(input.lineVerifiedAt)}` }
    : { ok: false, text: "No test call yet" };
  const healthy: ReadinessMark = !input.line
    ? { ok: false, text: "Calls cannot reach Orvius" }
    : input.lastCallAt && fresh(input.lastCallAt, now)
      ? { ok: true, text: `Last call answered ${age(input.lastCallAt, now)}` }
      : input.lastCallAt
        ? { ok: null, text: `No call in ${age(input.lastCallAt, now).replace(" ago", "")}` }
        : { ok: null, text: "No calls yet" };
  const row = { configured, verified, healthy };
  return {
    id: "line",
    label: "Orvius number",
    summary: !input.line
      ? "No Orvius number yet"
      : healthy.ok
        ? "Answers calls made to it"
        : input.lineVerifiedAt
          ? "Answered its test call — no recent calls to confirm it now"
          : "Not tested yet",
    ...row,
    tone: tone(row),
    action: input.line && !input.lineVerifiedAt ? "test_call" : null,
  };
}

export function forwardingReadiness(raw: ReadinessInput, now = Date.now()): ReadinessRow {
  const input = credible(raw, now);
  const test = input.lastForwardTest ?? null;
  const testFailed = Boolean(test && test.state !== "reached" && test.state !== "calling");
  const failedSinceProof = testFailed && time(test!.at) > time(input.forwardProvenAt);

  const configured: ReadinessMark = input.forwardConfirmedAt || input.forwardProvenAt
    ? { ok: true, text: input.forwardProvenAt ? "Forwarding on" : "You said forwarding is on" }
    : { ok: false, text: "Forwarding not set up" };
  const verified: ReadinessMark = input.forwardProvenAt
    ? { ok: true, text: `Proven ${day(input.forwardProvenAt)} by a call through your number` }
    : { ok: false, text: "No call has come through your number yet" };
  const healthy: ReadinessMark = failedSinceProof
    ? { ok: false, text: `Last test failed ${day(test!.at)}` }
    : test?.state === "reached" && fresh(test.at, now)
      ? { ok: true, text: `Test reached Orvius ${age(test.at, now)}` }
      : input.forwardProvenAt && fresh(input.forwardProvenAt, now)
        ? { ok: true, text: `Proven ${age(input.forwardProvenAt, now)}` }
        : input.forwardProvenAt
          ? { ok: null, text: "Not re-tested this week" }
          : { ok: null, text: "Unknown until a call comes through" };
  const row = { configured, verified, healthy };
  return {
    id: "forwarding",
    label: "Your business number",
    summary: failedSinceProof
      ? "Calls to your number are not reaching Orvius"
      : healthy.ok
        ? "Calls to your number reach Orvius"
        : input.forwardProvenAt
          ? "Forwarding worked — run a test to confirm it still does"
          : "Forwarding not proven yet — calls to your number may not reach Orvius",
    ...row,
    tone: tone(row),
    action: healthy.ok ? null : "forward_test",
  };
}

export function alertReadiness(raw: ReadinessInput, now = Date.now()): ReadinessRow {
  const input = credible(raw, now);
  const lastFailure = input.lastFailedAlertAt ?? null;
  const failedSinceSuccess = Boolean(lastFailure) && time(lastFailure) > time(input.lastAlertAt);

  const configured: ReadinessMark = input.alertsReachable
    ? { ok: true, text: "Text or email set up" }
    : { ok: false, text: "No text or email can reach you" };
  const verified: ReadinessMark = input.lastAlertAt
    ? { ok: true, text: `Delivered before, ${day(input.lastAlertAt)}` }
    : { ok: false, text: "No alert delivered yet" };
  const healthy: ReadinessMark =
    input.failedAlerts24h > 0
      ? { ok: false, text: `${input.failedAlerts24h} failed in the last 24h` }
      : input.stuckPendingAlerts > 0
        ? { ok: false, text: `${input.stuckPendingAlerts} stuck waiting to send` }
        : failedSinceSuccess
          ? { ok: false, text: `Last alert failed ${day(lastFailure!)}` }
          : input.lastAlertAt && fresh(input.lastAlertAt, now)
            ? { ok: true, text: `Last delivered ${age(input.lastAlertAt, now)}` }
            : input.lastAlertAt
              ? { ok: null, text: `Last delivered ${age(input.lastAlertAt, now)}` }
              : { ok: null, text: "Nothing sent yet" };
  const row = { configured, verified, healthy };
  return {
    id: "alerts",
    label: "Alert delivery",
    summary: !input.alertsReachable
      ? "Nowhere to send alerts"
      : healthy.ok === false
        ? "Alerts are failing"
        : healthy.ok
          ? "Alerts are reaching you"
          : input.lastAlertAt
            ? "No recent delivery — send a test alert to confirm"
            : "No alert sent yet — send a test alert",
    ...row,
    tone: tone(row),
    action: !input.alertsReachable ? "fix_alerts" : healthy.ok ? null : "test_alert",
  };
}

export function shopReadiness(input: ReadinessInput, now = Date.now()): ReadinessRow[] {
  return [lineReadiness(input, now), forwardingReadiness(input, now), alertReadiness(input, now)];
}

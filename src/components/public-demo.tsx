"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Scenario = { id: string; label: string; expect: string; caller: string; transcript: string[] };
type TraceEvent = { id: string; at: string; source: string; actor: string; title: string; tone: "ok" | "failed" | "held" | "info"; simulated?: boolean };
type Trace = {
  lead: { name: string | null; serviceType: string | null; address: string | null; status: string; urgency: string | null };
  job: { id: string; title: string; status: string; scheduledAt: string | null; customerConfirmedAt: string | null; technician: string | null } | null;
  events: TraceEvent[];
};
type Run = { duplicate?: boolean; autoBooked?: boolean; skipReason?: string | null; trace: Trace | null };

const TONE_LABEL: Record<TraceEvent["tone"], string> = { ok: "Done", failed: "Failed", held: "Held for you", info: "Logged" };

function isHighlight(e: TraceEvent) {
  if (/^Queued the owner alert/.test(e.title)) return false;
  if (e.tone !== "info") return true;
  return /^Answered|playbook/i.test(e.title);
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

function outcome(run: Run): { tone: TraceEvent["tone"]; text: string } {
  if (run.duplicate) return { tone: "ok", text: "Recognised a caller with an open job. No second job was created." };
  const job = run.trace?.job;
  if (job?.customerConfirmedAt) return { tone: "ok", text: `Confirmed by the customer. ${job.technician ?? "A tech"} is on ${job.scheduledAt ? when(job.scheduledAt) : "the schedule"}.` };
  if (job && run.trace?.events.some((e) => e.tone === "failed")) return { tone: "failed", text: "Booked, but the confirmation text bounced. The owner was alerted to call." };
  if (job) return { tone: "ok", text: `Booked ${job.scheduledAt ? when(job.scheduledAt) : ""}${job.technician ? ` with ${job.technician}` : ""}. Waiting on the customer to confirm.` };
  if (run.trace?.lead.urgency === "emergency") return { tone: "held", text: "Safety call. Nothing was booked, and the owner was alerted right away." };
  return { tone: "held", text: "Not enough to book safely, so it's held for a person. Nothing was invented." };
}

export function PublicDemo({ scenarios }: { scenarios: Scenario[] }) {
  const [active, setActive] = useState<Scenario | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);

  async function post(body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public-demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      return data as Run;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function play(s: Scenario) {
    setActive(s);
    setRun(null);
    setFull(false);
    if (window.matchMedia("(max-width: 720px)").matches) stage.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const result = await post({ scenario: s.id });
    if (result) setRun(result);
  }

  async function confirm(jobId: string) {
    const result = await post({ confirmJobId: jobId });
    if (result) setRun((prev) => ({ ...prev, trace: result.trace }));
  }

  const result = run ? outcome(run) : null;
  const job = run?.trace?.job;
  const events = run?.trace?.events ?? [];
  const shown = full ? events : events.filter(isHighlight);

  return (
    <div className="pd-grid">
      <ol className="pd-scenarios" aria-label="Pick a call">
        {scenarios.map((s) => (
          <li key={s.id}>
            <button type="button" className="pd-scenario" aria-pressed={active?.id === s.id} disabled={busy} onClick={() => play(s)}>
              <span className="pd-scenario-title">{s.label}</span>
              <span className="pd-scenario-sub">{s.expect}</span>
            </button>
          </li>
        ))}
      </ol>

      <section ref={stage} className="pd-stage" aria-live="polite">
        {!active ? (
          <div className="pd-empty">
            <p className="pd-kicker">Summit Heating &amp; Air · demo shop</p>
            <p>Pick a call on the left. Orvius takes it the way it would for your shop: it checks the real schedule, books or holds the job, texts the customer and logs every step.</p>
          </div>
        ) : (
          <>
            <p className="pd-kicker">Incoming call · {active.caller}</p>
            <div className="pd-transcript">
              {active.transcript.map((line, i) => {
                const ai = line.startsWith("AI:");
                return (
                  <p key={i} className={ai ? "pd-line pd-line--ai" : "pd-line"}>
                    <span>{ai ? "Orvius" : active.caller.split(" ")[0]}</span>
                    {line.replace(/^(AI|User):\s*/, "")}
                  </p>
                );
              })}
            </div>

            {busy && !run ? <p className="pd-working">Checking the schedule and writing the record…</p> : null}
            {error ? <p className="pd-outcome" data-tone="failed">{error}</p> : null}

            {result ? (
              <p className="pd-outcome" data-tone={result.tone}>
                {result.text}
              </p>
            ) : null}

            {job && !job.customerConfirmedAt && !run?.duplicate ? (
              <button type="button" className="ov-btn ov-btn--solid pd-confirm" disabled={busy} onClick={() => confirm(job.id)}>
                Tap the customer&apos;s confirm link
              </button>
            ) : null}

            {events.length ? (
              <>
                <p className="pd-kicker">{full ? "Full audit trail" : "What Orvius did"}</p>
                <ol className="pd-trace">
                  {shown.map((e) => (
                    <li key={e.id} data-tone={e.tone}>
                      <span className="pd-trace-tag">{TONE_LABEL[e.tone]}</span>
                      <span>
                        {e.title}
                        {e.simulated ? <em> · simulated</em> : null}
                      </span>
                    </li>
                  ))}
                </ol>
                {events.length > shown.length || full ? (
                  <button type="button" className="pd-more" onClick={() => setFull((v) => !v)}>
                    {full ? "Show the key steps" : `Show the full audit trail (${events.length} entries)`}
                  </button>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </section>

      <div className="pd-foot">
        <p>Texts are simulated and the numbers are fictional. The booking, schedule check, alerts and audit trail run the same code your shop would.</p>
        <Link href="/signin?mode=signup" className="ov-btn ov-btn--solid">
          Set this up for my shop
        </Link>
      </div>
    </div>
  );
}

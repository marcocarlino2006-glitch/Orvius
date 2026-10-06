"use client";

import { useCallback, useEffect, useState } from "react";
import "./win-back-card.css";

type Audience = {
  months: number;
  count: number;
  perSend: number;
  sample: Array<{ name: string | null; lastSeenAt: string }>;
  template: string;
  preview: string;
  businessName: string;
};

const MONTHS = [3, 6, 12];

function previewOf(template: string, sampleName: string | null, businessName: string) {
  const first = sampleName?.trim().split(/\s+/)[0] ?? "";
  let body = template
    .replace(/\{business\}/g, businessName)
    .replace(/\{link\}/g, "(your booking link)")
    .replace(/\{first\}/g, first);
  if (!first) body = body.replace(/^Hi\s*,\s*/i, "Hi, ");
  body = body.replace(/[ \t]{2,}/g, " ").trim();
  return /\bSTOP\b/i.test(body) ? body : `${body} Reply STOP to opt out.`;
}

export function WinBackCard() {
  const [months, setMonths] = useState(6);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [template, setTemplate] = useState("");
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: number) => {
    const res = await fetch(`/api/customers/win-back?months=${m}`);
    if (!res.ok) return;
    const data: Audience = await res.json();
    setAudience(data);
    setTemplate((prev) => prev || data.template);
  }, []);

  useEffect(() => {
    void load(months);
  }, [months, load]);

  if (!audience || (!audience.count && !result)) return null;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customers/win-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months, template }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That didn't send. Try again.");
        return;
      }
      setResult(
        `Sent to ${data.sent} customer${data.sent === 1 ? "" : "s"}.${data.remaining ? ` ${data.remaining} more are waiting; send again to reach them.` : ""} Replies come to Inbox → Messages.`,
      );
      setOpen(false);
      setConfirming(false);
      void load(months);
    } catch {
      setError("Network error. Nothing was sent.");
    } finally {
      setBusy(false);
    }
  };

  const sendCount = Math.min(audience.count, audience.perSend);
  const names = audience.sample
    .map((c) => c.name?.split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 3);

  return (
    <section className="wb font-sans" aria-label="Win back customers">
      <div className="wb-top">
        <div>
          <p className="wb-figure">
            {audience.count} customer{audience.count === 1 ? "" : "s"} who said yes to offers haven&apos;t been back in{" "}
            <select
              className="wb-select"
              aria-label="Months since last visit"
              value={months}
              onChange={(e) => {
                setMonths(Number(e.target.value));
                setResult(null);
              }}
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}+ months
                </option>
              ))}
            </select>
          </p>
          <p className="wb-sub">
            {names.length ? `${names.join(", ")}${audience.count > names.length ? " and others" : ""}. ` : ""}
            A short check-in text brings back regulars without paying for ads.
          </p>
        </div>
        {!open ? (
          <button type="button" className="btn btn-void text-sm" onClick={() => setOpen(true)} disabled={!audience.count}>
            Write a check-in text
          </button>
        ) : null}
      </div>

      {result ? <p className="wb-ok">{result}</p> : null}

      {open ? (
        <div className="wb-compose">
          <label className="wb-label" htmlFor="wb-text">
            Message · {"{first}"} becomes their first name{audience.template.includes("{link}") ? ", {link} your booking page" : ""}
          </label>
          <textarea
            id="wb-text"
            rows={3}
            maxLength={480}
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value);
              setConfirming(false);
            }}
          />
          <div className="wb-preview" aria-label="Preview">
            <span>Preview</span>
            <p>{previewOf(template, audience.sample[0]?.name ?? "Ann", audience.businessName)}</p>
          </div>
          {error ? (
            <p className="wb-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="wb-actions">
            <button type="button" className="btn btn-secondary text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            {confirming ? (
              <button type="button" className="btn btn-void text-sm" onClick={() => void send()} disabled={busy}>
                {busy ? "Sending…" : `Yes, text ${sendCount} customer${sendCount === 1 ? "" : "s"}`}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-void text-sm"
                onClick={() => setConfirming(true)}
                disabled={!template.trim()}
              >
                Send to {sendCount}
              </button>
            )}
          </div>
          <p className="wb-fine">
            Only to customers who said yes to offers in writing (the box on your booking page, or texting JOIN to
            your line). Sent 9am to 8pm, at most once per customer every 90 days. Never to anyone who replied STOP
            or already has a visit booked.
          </p>
        </div>
      ) : null}
    </section>
  );
}
